/**
 * Live sandbox reproduction (2026-07-20) for Item 3 of the vencida-fix task:
 * confirms the new "status open|paid|overdue|cancelled" prompt instruction in
 * prompt-builder.ts makes Sofia describe a real mixed overdue/open invoice list
 * correctly. Uses CPF 04976301338 (SILVANA GOMES FERREIRA / contrato 1094),
 * which has exactly 1 real overdue invoice (30/06/2026) + 7 open ones with
 * future due dates (30/07/2026 through 30/01/2027) — the same shape as the
 * original incident.
 *
 * Safety: sends through TEST_SANDBOX_PHONE only (assertSandboxNumber), never a
 * real customer or personal number. messageId carries a diag- marker for audit.
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { processMessage } from '../src/agent/processor';
import { supabase } from '../src/config/supabase';

async function main() {
  const sandboxPhone = env.TEST_SANDBOX_PHONE!;
  assertSandboxNumber(sandboxPhone);

  const messageId = `diag-item3-${Date.now()}`;
  const message = 'cpf: 04976301338 — me dê a data exata dos vencimentos de todas as faturas';

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

  const listarFaturas = ((data.tool_calls ?? []) as Array<{ name: string; output: unknown }>)
    .find((t) => t.name === 'listar_faturas');
  console.log('\nlistar_faturas raw output (status per invoice, as seen by the LLM):');
  console.log(JSON.stringify(listarFaturas?.output, null, 2));

  console.log('\n=== Sofia response ===');
  console.log(data.response);
  console.log(`\ndelivery_status: ${data.delivery_status}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
