/**
 * Read-only follow-up to audit-toolcall-repetition.ts: dump raw tool_calls for specific
 * flagged sessions to verify whether repeated buscar_cliente/get_fatura_atual calls are
 * truly redundant (same args, no new info) or legitimate sequential lookups (different
 * CPF/phone each time). Does NOT modify any table.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/audit-toolcall-repetition-detail.ts
 */
import { supabase } from '../src/config/supabase';

interface LogRow {
  id: string;
  phone: string;
  tenant_id: string;
  created_at: string;
  session_mode: string;
  tool_calls: Array<{ name: string; input?: Record<string, unknown>; output?: unknown }>;
  response: string | null;
}

// (phoneLast4, tenantId, fromISO, toISO)
const TARGETS: Array<[string, string, string, string]> = [
  ['2957', 'salesnet-default', '2026-07-10T15:44:00Z', '2026-07-10T15:52:00Z'],
  ['5525', 'salesnet-default', '2026-07-08T23:20:00Z', '2026-07-08T23:25:00Z'],
  ['5525', 'salesnet-default', '2026-07-10T12:34:00Z', '2026-07-10T12:36:00Z'],
  ['2816', 'default', '2026-07-20T12:20:00Z', '2026-07-20T12:31:00Z'],
];

function maskPhone(phone: string): string {
  return phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

async function main() {
  for (const [last4, tenantId, from, to] of TARGETS) {
    const { data, error } = await supabase
      .from('interaction_logs')
      .select('id, phone, tenant_id, created_at, session_mode, tool_calls, response')
      .eq('tenant_id', tenantId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as LogRow[]).filter((r) => r.phone.endsWith(last4));

    console.log(`\n\n########## phone=****${last4} tenant=${tenantId} window=${from}..${to} (${rows.length} rows) ##########`);
    for (const row of rows) {
      console.log(`\n--- row ${row.created_at} mode=${row.session_mode} ---`);
      const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
      for (const c of calls) {
        console.log(`  call: ${c.name} input=${JSON.stringify(c.input)}`);
        if (c.name === 'buscar_cliente' || c.name === 'get_fatura_atual') {
          const out = c.output as Record<string, unknown>;
          const summary = {
            error: out?.error,
            name: out?.name,
            status: out?.status,
            _lookup: out?._lookup,
            cross_phone_attempt: out?.cross_phone_attempt,
          };
          console.log(`    output_summary=${JSON.stringify(summary)}`);
        }
      }
      console.log(`  response="${String(row.response).slice(0, 160).replace(/\n/g, ' ')}"`);
    }
  }
  console.log('\n\n[audit] done — no rows modified.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[audit] fatal error:', err);
    process.exit(1);
  });
