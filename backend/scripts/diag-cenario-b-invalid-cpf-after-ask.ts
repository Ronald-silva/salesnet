/**
 * Live sandbox reproduction (2026-07-20) — investigation into whether removing
 * sofiaAskedForCpf/lastAssistantMsg regressed Cenário B: the customer replies
 * with a bare 11-digit number that FAILS the CPF checksum, right after Sofia
 * explicitly asked for the CPF. Two-turn conversation against TEST_SANDBOX_PHONE:
 *   Turn 1: generic request that should make Sofia ask for identification/CPF
 *           (sandbox phone has no linked customer).
 *   Turn 2: an 11-digit sequence shaped like a CPF but failing the checksum.
 *
 * Confirms whether hasInvalidBareCpfCandidate fires and the LLM is warned not
 * to trust a stale identity, instead of silently accepting the bad CPF or
 * crashing with no fallback.
 *
 * Safety: sends through TEST_SANDBOX_PHONE only (assertSandboxNumber).
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { processMessage } from '../src/agent/processor';
import { supabase } from '../src/config/supabase';
import { isValidCpf } from '../src/lib/cpf';

async function lastLog(phone: string) {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select('created_at, session_mode, response, tool_calls, delivery_status')
    .eq('phone', phone)
    .eq('tenant_id', env.DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(`interaction_logs fetch failed: ${error.message}`);
  return data;
}

async function main() {
  const sandboxPhone = env.TEST_SANDBOX_PHONE!;
  assertSandboxNumber(sandboxPhone);

  const invalidCpf = '02284204316'; // last digit tampered — fails checksum
  console.log('isValidCpf(invalidCpf) =', isValidCpf(invalidCpf));

  const msg1Id = `diag-cenarioB-turn1-${Date.now()}`;
  const msg1 = 'oi, quero ver minha fatura';
  console.log(`\n--- Turn 1 (messageId=${msg1Id}) ---\n${msg1}`);
  await processMessage(sandboxPhone, msg1, { messageId: msg1Id, tenantId: env.DEFAULT_TENANT_ID });
  const log1 = await lastLog(sandboxPhone);
  console.log('Sofia (turn 1):', log1.response);

  const msg2Id = `diag-cenarioB-turn2-${Date.now()}`;
  const msg2 = invalidCpf;
  console.log(`\n--- Turn 2 (messageId=${msg2Id}) ---\n${msg2}`);
  await processMessage(sandboxPhone, msg2, { messageId: msg2Id, tenantId: env.DEFAULT_TENANT_ID });
  const log2 = await lastLog(sandboxPhone);

  console.log('\nbuscar_cliente call (turn 2), if any:');
  const toolCalls = (log2.tool_calls ?? []) as Array<{ name: string; input: unknown; output: unknown }>;
  console.log(JSON.stringify(toolCalls.find((t) => t.name === 'buscar_cliente') ?? null, null, 2));

  console.log('\n=== Sofia response (turn 2) ===');
  console.log(log2.response);
  console.log(`\ndelivery_status: ${log2.delivery_status}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
