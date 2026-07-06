/**
 * One-off forensic audit (read-only): find calls to listar_chamados_sofia, abrir_chamado
 * and agendar_visita where the contrato/customer_id argument diverged from the contrato
 * actually identified for that session (the buscar_cliente entry logged in the same
 * interaction_logs row's tool_calls, per processor.ts initialToolLog). Before the local,
 * uncommitted fix in tools.ts, these three tools trusted that argument directly instead of
 * resolveSessionCustomerId(phone, tenantId) — a divergence here means the OLD deployed code
 * may have acted on a different customer's contrato than the one talking.
 *
 * For every divergence found, cross-checks sofia_tickets / scheduled_visits for real writes
 * under the diverging contrato, to tell "exposure only" apart from "ticket actually opened"
 * or "visit actually booked" at someone else's address.
 *
 * Does not modify any table.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/audit-contrato-divergence.ts
 */
import { supabase } from '../src/config/supabase';

interface ToolCallLogEntry {
  name: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

interface InteractionLogRow {
  id?: string;
  phone: string;
  tenant_id: string;
  tool_calls: ToolCallLogEntry[];
  created_at: string;
}

interface Divergence {
  tool: 'listar_chamados_sofia' | 'abrir_chamado' | 'agendar_visita';
  phone: string;
  tenantId: string;
  createdAt: string;
  sessionContrato: string;
  requested: string;
  output: Record<string, unknown> | undefined;
}

function maskTail(phone: string): string {
  return phone && phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

async function fetchAllInteractionLogs(): Promise<InteractionLogRow[]> {
  const pageSize = 1000;
  let offset = 0;
  const rows: InteractionLogRow[] = [];

  for (;;) {
    const { data, error } = await supabase
      .from('interaction_logs')
      .select('id, phone, tenant_id, tool_calls, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`interaction_logs query failed: ${error.message}`);
    if (!data || data.length === 0) break;

    rows.push(...(data as InteractionLogRow[]));

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function findDivergences(rows: InteractionLogRow[]): Divergence[] {
  const divergences: Divergence[] = [];
  const TARGET_TOOLS = new Set(['listar_chamados_sofia', 'abrir_chamado', 'agendar_visita']);

  for (const row of rows) {
    const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
    if (calls.length === 0) continue;

    // buscar_cliente is always tool_calls[0] in the current processor.ts initialToolLog —
    // but scan the whole array defensively in case that ever changes.
    const identCall = calls.find((c) => c.name === 'buscar_cliente');
    const sessionContrato = identCall?.output && typeof identCall.output.id === 'string'
      ? identCall.output.id
      : null;
    if (!sessionContrato) continue; // no ground-truth identification logged for this turn

    for (const call of calls) {
      if (!TARGET_TOOLS.has(call.name)) continue;

      // abrir_chamado accepts contrato OR customer_id (input.contrato ?? input.customer_id
      // in tools.ts); agendar_visita and listar_chamados_sofia only ever accepted one name.
      const requestedRaw = call.name === 'agendar_visita'
        ? call.input?.customer_id
        : call.name === 'abrir_chamado'
        ? (call.input?.contrato ?? call.input?.customer_id)
        : call.input?.contrato;
      if (requestedRaw === undefined || requestedRaw === null) continue;

      const requested = String(requestedRaw);
      if (requested === sessionContrato) continue;

      divergences.push({
        tool: call.name as Divergence['tool'],
        phone: row.phone,
        tenantId: row.tenant_id,
        createdAt: row.created_at,
        sessionContrato,
        requested,
        output: call.output,
      });
    }
  }

  return divergences;
}

async function crossCheckAbrirChamado(d: Divergence): Promise<string> {
  const windowStart = new Date(new Date(d.createdAt).getTime() - 10 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(d.createdAt).getTime() + 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('sofia_tickets')
    .select('id, contrato, phone, tipo, status, created_at')
    .eq('contrato', d.requested)
    .eq('tenant_id', d.tenantId)
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd);

  if (error) return `sofia_tickets check failed: ${error.message}`;
  if (!data || data.length === 0) return 'NO matching sofia_tickets row found for the requested (diverging) contrato in this window';
  return `REAL TICKET WRITTEN under diverging contrato=${d.requested}: ${data.map((t) => `id=${t.id} tipo=${t.tipo} status=${t.status}`).join('; ')}`;
}

async function crossCheckAgendarVisita(d: Divergence): Promise<string> {
  const windowStart = new Date(new Date(d.createdAt).getTime() - 10 * 60 * 1000).toISOString();
  const windowEnd = new Date(new Date(d.createdAt).getTime() + 10 * 60 * 1000).toISOString();

  // Table has been observed under both `contrato` and `customer_id` column names across
  // migrations/routes in this codebase — try contrato first (per book_visit_slot RPC),
  // fall back to customer_id (per routes/schedules.ts SELECT_BASE) if the column errors out.
  let data: Array<Record<string, unknown>> | null = null;
  let error: { message: string } | null = null;

  const byContrato = await supabase
    .from('scheduled_visits')
    .select('id, contrato, phone, address, visit_date, period, status, created_at')
    .eq('contrato', d.requested)
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd);

  if (!byContrato.error) {
    data = byContrato.data;
  } else {
    const byCustomerId = await supabase
      .from('scheduled_visits')
      .select('id, customer_id, phone, address, visit_date, period, status, created_at')
      .eq('customer_id', d.requested)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd);
    data = byCustomerId.data;
    error = byCustomerId.error ? { message: byCustomerId.error.message } : null;
  }

  if (error) return `scheduled_visits check failed: ${error.message}`;
  if (!data || data.length === 0) return 'NO matching scheduled_visits row found for the requested (diverging) contrato in this window';
  return `REAL VISIT BOOKED under diverging contrato=${d.requested} (address may belong to a different customer than the session's phone): ${JSON.stringify(data)}`;
}

async function main() {
  console.log('[audit] fetching interaction_logs...');
  const rows = await fetchAllInteractionLogs();
  console.log(`[audit] ${rows.length} interaction_logs rows in retained window`);

  const divergences = findDivergences(rows);
  console.log(`[audit] ${divergences.length} divergence candidates found (contrato/customer_id argument != session-identified contrato)\n`);

  if (divergences.length === 0) {
    console.log('[audit] No divergences found in the retained interaction_logs window for listar_chamados_sofia, abrir_chamado or agendar_visita.');
    console.log('[audit] CAVEAT: interaction_logs is purged after 90 days (data-cleanup.ts) — this only covers what still exists in the table today, not the full history of these tools in production.');
    return;
  }

  for (const d of divergences) {
    console.log(`--- ${d.tool} ---`);
    console.log(`  phone=${maskTail(d.phone)} tenant=${d.tenantId} at=${d.createdAt}`);
    console.log(`  session_contrato=${d.sessionContrato} requested=${d.requested}`);
    console.log(`  tool output: ${JSON.stringify(d.output)}`);

    if (d.tool === 'abrir_chamado') {
      console.log(`  cross-check: ${await crossCheckAbrirChamado(d)}`);
    } else if (d.tool === 'agendar_visita') {
      console.log(`  cross-check: ${await crossCheckAgendarVisita(d)}`);
    } else if (d.tool === 'listar_chamados_sofia') {
      const total = (d.output as { total?: number } | undefined)?.total ?? 0;
      console.log(`  exposure: ${total > 0 ? `${total} chamado(s) from contrato=${d.requested} returned to session of phone=${maskTail(d.phone)}` : 'output.total=0 — no ticket data actually exposed despite the divergent argument'}`);
    }
    console.log('');
  }

  console.log(`[audit] total divergence candidates: ${divergences.length}`);
  console.log('[audit] CAVEAT: interaction_logs is purged after 90 days (data-cleanup.ts) — this only covers what still exists in the table today.');
  console.log('[audit] NO rows were modified.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[audit] fatal error:', err);
    process.exit(1);
  });
