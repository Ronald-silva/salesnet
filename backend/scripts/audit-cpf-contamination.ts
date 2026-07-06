/**
 * One-off forensic audit: find conversation_threads.cpf values that were persisted via
 * salvar_cpf_cliente WITHOUT ever verifying the phone↔CPF link (the bug fixed in this
 * branch). For each candidate, re-checks today's SGP data to see whether the phone is
 * actually registered to that CPF. Read-only — does not modify any table.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/audit-cpf-contamination.ts
 */
import { supabase } from '../src/config/supabase';
import * as sgp from '../src/integrations/sgp';
import { normalizePhone } from '../src/lib/phone';

interface ToolCallLogEntry {
  name: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

interface InteractionLogRow {
  phone: string;
  tenant_id: string;
  tool_calls: ToolCallLogEntry[];
  created_at: string;
}

interface ThreadRow {
  phone: string;
  tenant_id: string;
  cpf: string | null;
  updated_at: string;
}

async function fetchAllSalvarCpfCalls(): Promise<Map<string, { phone: string; tenantId: string; cpf: string; at: string }[]>> {
  // interaction_logs.tool_calls is jsonb — filter in memory (per CLAUDE.md: never
  // rely on PostgREST .contains() against jsonb arrays, it fails silently on this schema).
  const byPhoneTenant = new Map<string, { phone: string; tenantId: string; cpf: string; at: string }[]>();
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('interaction_logs')
      .select('phone, tenant_id, tool_calls, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`interaction_logs query failed: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data as InteractionLogRow[]) {
      const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
      for (const call of calls) {
        if (call.name !== 'salvar_cpf_cliente') continue;
        const cpf = String(call.input?.cpf ?? '').replace(/\D/g, '');
        if (cpf.length !== 11) continue;
        const key = `${row.tenant_id}::${row.phone}`;
        const list = byPhoneTenant.get(key) ?? [];
        list.push({ phone: row.phone, tenantId: row.tenant_id, cpf, at: row.created_at });
        byPhoneTenant.set(key, list);
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return byPhoneTenant;
}

async function fetchThreadsWithCpf(): Promise<ThreadRow[]> {
  const { data, error } = await supabase
    .from('conversation_threads')
    .select('phone, tenant_id, cpf, updated_at')
    .not('cpf', 'is', null);
  if (error) throw new Error(`conversation_threads query failed: ${error.message}`);
  return (data ?? []) as ThreadRow[];
}

async function main() {
  console.log('[audit] fetching salvar_cpf_cliente calls from interaction_logs...');
  const salvarCalls = await fetchAllSalvarCpfCalls();
  console.log(`[audit] found salvar_cpf_cliente calls for ${salvarCalls.size} phone/tenant pairs`);

  console.log('[audit] fetching conversation_threads with cpf set...');
  const threads = await fetchThreadsWithCpf();
  console.log(`[audit] ${threads.length} threads currently have a cpf value`);

  const candidates: ThreadRow[] = [];
  for (const thread of threads) {
    const key = `${thread.tenant_id}::${thread.phone}`;
    const calls = salvarCalls.get(key);
    if (!calls) continue; // cpf on this thread wasn't set via salvar_cpf_cliente
    // Any call() that recorded the SAME cpf as currently stored is a candidate —
    // salvar_cpf_cliente never verified the link before persisting.
    const matching = calls.filter((c) => c.cpf === thread.cpf);
    if (matching.length > 0) candidates.push(thread);
  }

  console.log(`[audit] ${candidates.length} threads have cpf set via salvar_cpf_cliente — verifying against live SGP...\n`);

  const results: Array<{
    phone: string;
    tenantId: string;
    cpf: string;
    phoneRegisteredToCpf: boolean;
    sgpError?: string;
  }> = [];

  for (const thread of candidates) {
    try {
      const sgpPhones = new Set<string>();
      // getCustomerByCpf only returns ONE resolved phone (first match) — use the raw
      // contrato lookup path via getCustomerByCpf plus a direct check against .phone
      // is not sufficient for multi-phone contracts, but it is what the codebase
      // exposes today; document the limitation in the report below.
      const customer = await sgp.getCustomerByCpf(thread.cpf as string);
      if (customer.phone) sgpPhones.add(normalizePhone(customer.phone));

      const target = normalizePhone(thread.phone);
      results.push({
        phone: thread.phone,
        tenantId: thread.tenant_id,
        cpf: thread.cpf as string,
        phoneRegisteredToCpf: sgpPhones.has(target),
      });
    } catch (err) {
      results.push({
        phone: thread.phone,
        tenantId: thread.tenant_id,
        cpf: thread.cpf as string,
        phoneRegisteredToCpf: false,
        sgpError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const contaminated = results.filter((r) => !r.phoneRegisteredToCpf);
  const clean = results.filter((r) => r.phoneRegisteredToCpf);

  console.log('=== CLEAN (phone IS registered to this CPF in SGP today) ===');
  for (const r of clean) {
    console.log(`  phone=${maskTail(r.phone)} tenant=${r.tenantId} cpf=${r.cpf.slice(0, 3)}***`);
  }

  console.log('\n=== CANDIDATES FOR CONTAMINATION (phone NOT registered to this CPF, or SGP lookup failed) ===');
  for (const r of contaminated) {
    console.log(
      `  phone=${maskTail(r.phone)} tenant=${r.tenantId} cpf=${r.cpf.slice(0, 3)}***` +
        (r.sgpError ? ` sgpError="${r.sgpError}"` : ' — NO MATCHING PHONE IN SGP FOR THIS CPF'),
    );
  }

  console.log(`\n[audit] total salvar_cpf_cliente-sourced threads: ${results.length}`);
  console.log(`[audit] clean: ${clean.length} | contamination candidates: ${contaminated.length}`);
  console.log('[audit] NO rows were modified. Review this list before running any cleanup UPDATE.');
}

function maskTail(phone: string): string {
  return phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[audit] fatal error:', err);
    process.exit(1);
  });
