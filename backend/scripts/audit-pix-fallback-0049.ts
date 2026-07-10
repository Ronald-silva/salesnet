/**
 * One-off forensic audit (read-only): investigate why Sofia fell back to
 * PIX_HALLUCINATION_FALLBACK ("Desculpe, tive uma falha técnica gerando seu
 * código PIX agora...") repeatedly around 00:49-00:50 today, right after a
 * client confirmed which invoice to pay in the c18128d disambiguation flow.
 *
 * Pulls interaction_logs rows in the window and prints, per row:
 *  - full tool_calls array (names, inputs, whether gerar_pix ran, its output)
 *  - whether pix_hallucination_blocked is present (confirms containsUnverifiedPix fired)
 *  - the final response text
 *  - a byte-level diff between any gerar_pix output.pixKey and any PIX_EMV_RE
 *    match found in the response text, to catch whitespace/formatting drift
 *    that would explain a false-positive block despite a real, successful
 *    gerar_pix call.
 *
 * Does not modify any table.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/audit-pix-fallback-0049.ts
 */
import { supabase } from '../src/config/supabase';

const PIX_EMV_RE = /000201[^\n]{20,600}?6304[0-9A-Fa-f]{4}/g;

interface ToolCallLogEntry {
  name: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

interface InteractionLogRow {
  id?: string;
  phone: string;
  tenant_id: string;
  session_mode: string;
  tool_calls: ToolCallLogEntry[];
  response: string;
  delivery_status?: string;
  created_at: string;
}

function maskTail(phone: string): string {
  return phone && phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

function charDiff(a: string, b: string): string {
  if (a === b) return '(identical)';
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) {
      return `first diff at index ${i}: tool="${JSON.stringify(a.slice(Math.max(0, i - 15), i + 15))}" vs text="${JSON.stringify(b.slice(Math.max(0, i - 15), i + 15))}" (lengths ${a.length} vs ${b.length})`;
    }
  }
  return `lengths differ: ${a.length} vs ${b.length}, common prefix matches`;
}

async function main() {
  // Today, 00:45-00:55 window, generous padding around the reported 00:49-00:50.
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = `${today}T00:45:00.000Z`;
  const windowEnd = `${today}T00:55:00.000Z`;

  console.log(`[audit] querying interaction_logs from ${windowStart} to ${windowEnd} (UTC)`);
  console.log('[audit] NOTE: Fortaleza is UTC-3, so this is 21:45-21:55 local time the previous day if the 00:49 reported by the user was already local time. Widening if empty.');

  let { data, error } = await supabase
    .from('interaction_logs')
    .select('id, phone, tenant_id, session_mode, tool_calls, response, delivery_status, created_at')
    .gte('created_at', windowStart)
    .lte('created_at', windowEnd)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`interaction_logs query failed: ${error.message}`);

  if (!data || data.length === 0) {
    console.log('[audit] no rows in UTC 00:45-00:55 window, trying local Fortaleza 00:45-00:55 (UTC 03:45-03:55)...');
    const alt = await supabase
      .from('interaction_logs')
      .select('id, phone, tenant_id, session_mode, tool_calls, response, delivery_status, created_at')
      .gte('created_at', `${today}T03:45:00.000Z`)
      .lte('created_at', `${today}T03:55:00.000Z`)
      .order('created_at', { ascending: true });
    if (alt.error) throw new Error(`interaction_logs query failed: ${alt.error.message}`);
    data = alt.data;
  }

  const rows = (data ?? []) as InteractionLogRow[];
  console.log(`[audit] ${rows.length} interaction_logs rows found\n`);

  for (const row of rows) {
    console.log(`=== id=${row.id} phone=${maskTail(row.phone)} tenant=${row.tenant_id} mode=${row.session_mode} at=${row.created_at} delivery=${row.delivery_status ?? 'n/a'} ===`);

    const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
    console.log(`  tool_calls (${calls.length}): ${calls.map((c) => c.name).join(', ') || '(none)'}`);

    const pixCalls = calls.filter((c) => c.name === 'gerar_pix');
    const blocked = calls.some((c) => c.name === 'pix_hallucination_blocked');

    console.log(`  gerar_pix called: ${pixCalls.length > 0} (${pixCalls.length}x)`);
    console.log(`  pix_hallucination_blocked present: ${blocked}`);

    for (const [i, call] of pixCalls.entries()) {
      console.log(`  gerar_pix[${i}] input: ${JSON.stringify(call.input)}`);
      console.log(`  gerar_pix[${i}] output: ${JSON.stringify(call.output)}`);
    }

    const responseMatches = row.response.match(PIX_EMV_RE) ?? [];
    console.log(`  PIX_EMV_RE matches in final response text: ${responseMatches.length}`);

    if (pixCalls.length > 0 && responseMatches.length > 0) {
      for (const call of pixCalls) {
        const pixKey = (call.output as { pixKey?: unknown } | null)?.pixKey;
        if (typeof pixKey !== 'string') continue;
        for (const [j, match] of responseMatches.entries()) {
          console.log(`  compare gerar_pix.output.pixKey vs response match[${j}]: ${charDiff(pixKey, match)}`);
          console.log(`    exact Set.has() match would be: ${pixKey === match}`);
        }
      }
    }

    console.log(`  response text: ${JSON.stringify(row.response)}`);
    console.log('');
  }

  console.log('[audit] done. NO rows were modified.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[audit] fatal error:', err);
    process.exit(1);
  });
