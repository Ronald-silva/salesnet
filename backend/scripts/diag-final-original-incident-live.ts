/**
 * Live sandbox reproduction (2026-07-20) — FINAL end-to-end check for the 3-item
 * fix. Replays the EXACT original incident message verbatim:
 *   "ME DE A DATA EXATA DOS VENCIMENTOS DA FATURA DA:  02284204317"
 * (bare 11-digit CPF, no "cpf" keyword, 63 chars — this is what triggered both
 * bugs: Item 1's 50-char cutoff silently discarded the CPF, and Item 3's prompt
 * gap then made Sofia call every open invoice "vencida").
 *
 * Confirms:
 *   1) The CPF is now recognized (Item 1) — identification should resolve to
 *      MARIA DA CONCEIÇÃO SOARES FERREIRA / contrato 103971 (the CPF actually
 *      typed), not a stale thread CPF from an earlier session.
 *   2) No spurious "CPF ambíguo" warning fires (Item 2) — a valid CPF was found,
 *      so this is not the ambiguous case.
 *   3) The invoice list correctly distinguishes open vs overdue (Item 3).
 *
 * Safety: sends through TEST_SANDBOX_PHONE only (assertSandboxNumber).
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { processMessage } from '../src/agent/processor';
import { supabase } from '../src/config/supabase';

async function main() {
  const sandboxPhone = env.TEST_SANDBOX_PHONE!;
  assertSandboxNumber(sandboxPhone);

  const messageId = `diag-final-incident-${Date.now()}`;
  const message = 'ME DE A DATA EXATA DOS VENCIMENTOS DA FATURA DA:  02284204317';

  console.log(`Sending to sandbox ${sandboxPhone} (messageId=${messageId}):`);
  console.log(message);
  console.log('---');

  await processMessage(sandboxPhone, message, { messageId, tenantId: env.DEFAULT_TENANT_ID });

  const { data, error } = await supabase
    .from('interaction_logs')
    .select('created_at, session_mode, response, tool_calls, delivery_status')
    .eq('phone', sandboxPhone)
    .eq('tenant_id', env.DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.error('could not fetch resulting interaction_logs row:', error.message);
    return;
  }

  const toolCalls = (data.tool_calls ?? []) as Array<{ name: string; input: unknown; output: unknown }>;
  const buscarCliente = toolCalls.find((t) => t.name === 'buscar_cliente');
  const listarFaturas = toolCalls.find((t) => t.name === 'listar_faturas');

  console.log('\nbuscar_cliente (identity resolution) input+output:');
  console.log(JSON.stringify(buscarCliente, null, 2));

  console.log('\nlistar_faturas output (first 3 items, status per invoice):');
  console.log(JSON.stringify((listarFaturas?.output as unknown[] | undefined)?.slice(0, 3), null, 2));

  console.log('\n=== Sofia response ===');
  console.log(data.response);
  console.log(`\ndelivery_status: ${data.delivery_status}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
