/**
 * Read-only forensic audit (Ronald, 2026-07-20): quantify tool-call repetition and
 * verbatim assistant-response duplication in interaction_logs, to check whether the
 * +558591575525 buscar_cliente x3 incident and the byte-identical "R$ 79.99" sandbox
 * reproduction are isolated outliers or a real pattern in runLLMFlow.
 *
 * Does NOT modify any table. Run with:
 *   npx ts-node --project tsconfig.json scripts/audit-toolcall-repetition.ts
 */
import { supabase } from '../src/config/supabase';

const WINDOW_DAYS = 30;
const SESSION_GAP_MINUTES = 15;

interface ToolCallEntry {
  name: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

interface LogRow {
  id: string;
  phone: string;
  tenant_id: string;
  created_at: string;
  session_mode: string;
  tool_calls: ToolCallEntry[];
  response: string | null;
  delivery_status: string | null;
}

function maskPhone(phone: string): string {
  return phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

// Stable key per tool call: normalize phone-like args to digits-only so equivalent
// formats ("+5585..." vs "5585...") collapse to the same key.
function normalizeArgs(input: Record<string, unknown> | undefined): string {
  if (!input) return '{}';
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    const value = input[key];
    if (typeof value === 'string' && /phone|telefone|contato/i.test(key)) {
      normalized[key] = value.replace(/\D/g, '');
    } else {
      normalized[key] = value;
    }
  }
  return JSON.stringify(normalized);
}

async function fetchAllLogs(): Promise<LogRow[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows: LogRow[] = [];
  const pageSize = 1000;
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase
      .from('interaction_logs')
      .select('id, phone, tenant_id, created_at, session_mode, tool_calls, response, delivery_status')
      .gte('created_at', since)
      .order('phone', { ascending: true })
      .order('tenant_id', { ascending: true })
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`interaction_logs query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as LogRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

type Session = { phone: string; tenantId: string; rows: LogRow[] };

function groupIntoSessions(rows: LogRow[]): Session[] {
  // rows are already ordered by phone, tenant_id, created_at ascending
  const sessions: Session[] = [];
  let current: Session | null = null;
  let lastTs = 0;

  for (const row of rows) {
    const key = `${row.tenant_id}::${row.phone}`;
    const ts = Date.parse(row.created_at);
    const currentKey = current ? `${current.tenantId}::${current.phone}` : null;
    const gapMinutes = current ? (ts - lastTs) / 60000 : Infinity;

    if (!current || currentKey !== key || gapMinutes > SESSION_GAP_MINUTES) {
      current = { phone: row.phone, tenantId: row.tenant_id, rows: [] };
      sessions.push(current);
    }
    current.rows.push(row);
    lastTs = ts;
  }

  return sessions;
}

const CONCLUSIVE_TOOLS = new Set([
  'registrar_interesse',
  'gerar_pix',
  'agendar_visita',
  'abrir_chamado',
  'confirmar_pagamento',
]);

async function main() {
  console.log(`[audit] fetching interaction_logs for last ${WINDOW_DAYS} days...`);
  const rows = await fetchAllLogs();
  console.log(`[audit] ${rows.length} rows fetched`);
  if (rows.length > 0) {
    const dates = rows.map((r) => r.created_at).sort();
    console.log(`[audit] date range: ${dates[0]} .. ${dates[dates.length - 1]}`);
  }

  const sessions = groupIntoSessions(rows);
  console.log(`[audit] grouped into ${sessions.length} sessions (gap=${SESSION_GAP_MINUTES}min)\n`);

  // ── TASK 1: tool-call repetition within session ──────────────────────────
  const repeatBuckets = { none: 0, one: 0, twoPlus: 0 };
  const repeatedToolCounts = new Map<string, number>();
  const sessionsWithRepeats: Array<{
    phone: string; tenantId: string; maxRepeat: number; tool: string;
    sessionModes: string[]; lastResponse: string | null; rowCount: number;
    firstAt: string; lastAt: string; hadConclusive: boolean;
  }> = [];

  for (const session of sessions) {
    const callCounts = new Map<string, number>();
    for (const row of session.rows) {
      const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
      for (const call of calls) {
        const key = `${call.name}::${normalizeArgs(call.input)}`;
        callCounts.set(key, (callCounts.get(key) ?? 0) + 1);
      }
    }

    let maxRepeat = 0;
    let maxTool = '';
    for (const [key, count] of callCounts) {
      if (count > maxRepeat) {
        maxRepeat = count;
        maxTool = key.split('::')[0];
      }
      if (count >= 2) {
        repeatedToolCounts.set(maxTool || key.split('::')[0], (repeatedToolCounts.get(key.split('::')[0]) ?? 0) + 1);
      }
    }

    if (maxRepeat <= 1) repeatBuckets.none += 1;
    else if (maxRepeat === 2) repeatBuckets.one += 1;
    else repeatBuckets.twoPlus += 1;

    if (maxRepeat >= 2) {
      const allCalls = session.rows.flatMap((r) => (Array.isArray(r.tool_calls) ? r.tool_calls : []));
      const hadConclusive = allCalls.some((c) => CONCLUSIVE_TOOLS.has(c.name));
      sessionsWithRepeats.push({
        phone: session.phone,
        tenantId: session.tenantId,
        maxRepeat,
        tool: maxTool,
        sessionModes: [...new Set(session.rows.map((r) => r.session_mode))],
        lastResponse: session.rows[session.rows.length - 1]?.response ?? null,
        rowCount: session.rows.length,
        firstAt: session.rows[0].created_at,
        lastAt: session.rows[session.rows.length - 1].created_at,
        hadConclusive,
      });
    }
  }

  console.log('=== TASK 1: distribuição de repetição de tool call por sessão ===');
  console.log(`  0 repetições (max call count <=1):  ${repeatBuckets.none}`);
  console.log(`  exatamente 1 repetição (max count=2): ${repeatBuckets.one}`);
  console.log(`  2+ repetições (max count>=3):          ${repeatBuckets.twoPlus}`);
  console.log(`  total sessions: ${sessions.length}`);
  console.log('\n  tool mais repetida (contagem de sessões onde foi a tool com maior repetição):');
  const sortedTools = [...repeatedToolCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tool, count] of sortedTools) console.log(`    ${tool}: ${count} sessões`);

  console.log(`\n  sessões com repetição (>=2), detalhe (phone mascarado):`);
  for (const s of sessionsWithRepeats.sort((a, b) => b.maxRepeat - a.maxRepeat)) {
    console.log(
      `    phone=${maskPhone(s.phone)} tenant=${s.tenantId} tool=${s.tool} maxRepeat=${s.maxRepeat} ` +
      `rows=${s.rowCount} modes=[${s.sessionModes.join(',')}] window=${s.firstAt}..${s.lastAt} ` +
      `hadConclusiveTool=${s.hadConclusive}`,
    );
    console.log(`      lastResponse="${String(s.lastResponse).slice(0, 200).replace(/\n/g, ' ')}"`);
  }

  const knownIncidentPhone = '558591575525';
  const knownIncident = sessionsWithRepeats.find((s) => s.phone.replace(/\D/g, '').endsWith(knownIncidentPhone.slice(-8)));
  console.log(`\n  [check] +${knownIncidentPhone} incidente conhecido aparece na amostra: ${!!knownIncident}`);

  // ── TASK 2: verbatim response duplication ────────────────────────────────
  console.log('\n=== TASK 2: duplicação verbatim de resposta do assistant ===');
  let verbatimPairsTotal = 0;
  let verbatimWithToolCalls = 0;
  let verbatimQuickReplyLike = 0;
  const verbatimDetails: Array<{
    phone: string; tenantId: string; tool_calls_nonempty: boolean;
    responseSnippet: string; atA: string; atB: string;
  }> = [];

  for (const session of sessions) {
    for (let i = 0; i < session.rows.length; i++) {
      for (let j = i + 1; j < session.rows.length; j++) {
        const a = session.rows[i];
        const b = session.rows[j];
        if (!a.response || !b.response) continue;
        if (a.response.trim().length === 0) continue;
        if (a.response === b.response) {
          verbatimPairsTotal += 1;
          const bHasTools = Array.isArray(b.tool_calls) && b.tool_calls.length > 0;
          if (bHasTools) verbatimWithToolCalls += 1;
          else verbatimQuickReplyLike += 1;
          verbatimDetails.push({
            phone: a.phone,
            tenantId: a.tenant_id,
            tool_calls_nonempty: bHasTools,
            responseSnippet: a.response.slice(0, 200).replace(/\n/g, ' '),
            atA: a.created_at,
            atB: b.created_at,
          });
        }
      }
    }
  }

  console.log(`  pares com response idêntico (mesma sessão): ${verbatimPairsTotal}`);
  console.log(`    com tool_calls preenchido no turno repetido (LLM genuíno): ${verbatimWithToolCalls}`);
  console.log(`    sem tool_calls (quick-reply-like, já resolvido): ${verbatimQuickReplyLike}`);
  console.log('\n  detalhe dos pares com tool_calls preenchido:');
  for (const d of verbatimDetails.filter((d) => d.tool_calls_nonempty)) {
    console.log(
      `    phone=${maskPhone(d.phone)} tenant=${d.tenantId} at=${d.atA}..${d.atB}\n` +
      `      response="${d.responseSnippet}"`,
    );
  }

  console.log('\n[audit] done — no rows modified.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[audit] fatal error:', err);
    process.exit(1);
  });
