/**
 * One-off forensic audit (read-only): investigate the PIX_HALLUCINATION_FALLBACK
 * ("Desculpe, tive uma falha técnica gerando seu código PIX agora...") sent
 * ~10:05 Fortaleza time today, right after the client confirmed
 * "a penúltima mais atrasada" and Sofia said she would generate the PIX —
 * first fallback case AFTER the PIX message-split deploy (vault.resolve parts +
 * buildPixDeliverySequence/sendSequenceWithDeliveryStatus).
 *
 * Questions to answer with log evidence:
 *  1. Was gerar_pix called in that turn? With which input (invoice_id, force_new)?
 *     Did it return success (pixKey present) or an error?
 *  2. If success: did the vault block anyway — pix_hallucination_blocked
 *     (containsUnverifiedPix) or pix_token_blocked (unknown_tokens /
 *     malformed_leftover)?
 *  3. If error: same 403 from the dedicated endpoint (force_new without cache),
 *     or wrong invoice_id resolved from the relative reference?
 *  4. Or: did the vault resolve fine and the SEND sequence fail
 *     (delivery_status='failed') — i.e. wrong fallback wording, generation was ok?
 *
 * PIX payloads / sensitive values are MASKED in output (never reprinted whole).
 * Does not modify any table.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/audit-pix-fallback-1005.ts
 */
import { createHash } from 'crypto';
import { supabase } from '../src/config/supabase';

const PIX_EMV_RE = /000201[^\n]{20,600}?6304[0-9A-Fa-f]{4}/g;
const PIX_PLACEHOLDER_RE = /\{\{PIX_[0-9a-f]{8}\}\}/g;

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
  delivery_error?: string | null;
  processing_ms?: number;
  created_at: string;
}

function maskTail(phone: string): string {
  return phone && phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

function maskPix(value: string): string {
  const hash = createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `<PIX len=${value.length} sha256:${hash} head="${value.slice(0, 12)}...">`;
}

/** Deep-clone a value, masking any string that looks like a PIX EMV payload. */
function maskDeep(value: unknown): unknown {
  if (typeof value === 'string') {
    if (PIX_EMV_RE.test(value)) {
      PIX_EMV_RE.lastIndex = 0;
      return value.replace(PIX_EMV_RE, (m) => maskPix(m));
    }
    PIX_EMV_RE.lastIndex = 0;
    return value;
  }
  if (Array.isArray(value)) return value.map(maskDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskDeep(v);
    }
    return out;
  }
  return value;
}

async function fetchWindow(startIso: string, endIso: string): Promise<InteractionLogRow[]> {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select(
      'id, phone, tenant_id, session_mode, tool_calls, response, delivery_status, delivery_error, processing_ms, created_at',
    )
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`interaction_logs query failed: ${error.message}`);
  return (data ?? []) as InteractionLogRow[];
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  // 10:04-10:05 Fortaleza (UTC-3) = 13:04-13:05 UTC. Pull the whole session
  // with generous padding so we also see the previous turns (invoice list,
  // "penúltima mais atrasada" resolution, the confirmation turn).
  let windowStart = `${today}T12:30:00.000Z`;
  let windowEnd = `${today}T13:20:00.000Z`;

  console.log(`[audit] querying interaction_logs ${windowStart} .. ${windowEnd} (UTC; 09:30-10:20 Fortaleza)`);
  let rows = await fetchWindow(windowStart, windowEnd);

  if (rows.length === 0) {
    console.log('[audit] empty — retrying assuming the reported 10:04-10:05 was already UTC (09:30-10:20 UTC)...');
    windowStart = `${today}T09:30:00.000Z`;
    windowEnd = `${today}T10:20:00.000Z`;
    rows = await fetchWindow(windowStart, windowEnd);
  }

  console.log(`[audit] ${rows.length} interaction_logs rows found\n`);

  for (const row of rows) {
    console.log(
      `=== id=${row.id} phone=${maskTail(row.phone)} tenant=${row.tenant_id} mode=${row.session_mode} at=${row.created_at} delivery=${row.delivery_status ?? 'n/a'} error=${row.delivery_error ?? '-'} ms=${row.processing_ms ?? '-'} ===`,
    );

    const calls = Array.isArray(row.tool_calls) ? row.tool_calls : [];
    console.log(`  tool_calls (${calls.length}): ${calls.map((c) => c.name).join(', ') || '(none)'}`);

    for (const [i, call] of calls.entries()) {
      const interesting =
        call.name === 'gerar_pix' ||
        call.name === 'listar_faturas' ||
        call.name === 'get_fatura_atual' ||
        call.name === 'pix_token_blocked' ||
        call.name === 'pix_hallucination_blocked' ||
        call.name === 'session_classifier';
      if (!interesting) continue;
      console.log(`  [${i}] ${call.name}`);
      console.log(`      input:  ${JSON.stringify(maskDeep(call.input))}`);
      console.log(`      output: ${JSON.stringify(maskDeep(call.output))}`);
    }

    const emvMatches = row.response.match(PIX_EMV_RE) ?? [];
    PIX_EMV_RE.lastIndex = 0;
    const placeholderMatches = row.response.match(PIX_PLACEHOLDER_RE) ?? [];
    console.log(`  response: EMV matches=${emvMatches.length} unresolved placeholders=${placeholderMatches.length}`);
    console.log(`  response text: ${JSON.stringify(maskDeep(row.response))}`);
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
