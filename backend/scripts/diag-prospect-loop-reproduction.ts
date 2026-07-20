/**
 * Live reproduction test (authorized by Ronald 2026-07-20): drives the REAL
 * processMessage() pipeline against TEST_SANDBOX_PHONE to check whether a prospect
 * expressing purchase intent ("quero contratar") gets stuck on the plans_list
 * quick-reply instead of reaching the LLM / registrar_interesse.
 *
 * assertSandboxNumber() enforced per CLAUDE.md "Política de testes ao vivo contra
 * produção". Every messageId is diag-prefixed for later audit via processed_message_ids.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/diag-prospect-loop-reproduction.ts
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { supabase } from '../src/config/supabase';
import { processMessage } from '../src/agent/processor';

const PHONE = env.TEST_SANDBOX_PHONE!;
const TENANT_ID = env.DEFAULT_TENANT_ID;

const TURNS = [
  'quais planos vocês têm?',
  'quero contratar, pode fazer meu cadastro?',
  'Meu nome é Diag Teste, moro na Rua das Flores 123, Fortaleza',
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function latestLog() {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select('created_at, session_mode, tool_calls, response, delivery_status')
    .eq('phone', PHONE)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`interaction_logs query failed: ${error.message}`);
  return data?.[0] ?? null;
}

async function main() {
  assertSandboxNumber(PHONE);
  console.log(`[diag] using sandbox phone=${PHONE} tenant=${TENANT_ID}`);

  for (let i = 0; i < TURNS.length; i++) {
    const text = TURNS[i];
    const messageId = `diag-prospect-loop-${Date.now()}-${i}`;
    console.log(`\n[diag] === turn ${i + 1}: "${text}" (messageId=${messageId}) ===`);

    await processMessage(PHONE, text, { tenantId: TENANT_ID, messageId });

    // interaction_logs insert happens at the end of processMessage; give it a moment
    // in case of any async tail (delivery retries etc.) before reading it back.
    await sleep(2000);

    const log = await latestLog();
    if (!log) {
      console.log('[diag] no interaction_logs row found yet');
      continue;
    }
    const toolCalls = Array.isArray(log.tool_calls) ? log.tool_calls : [];
    const toolNames = toolCalls.map((t: any) => t.name).join(', ') || '(none)';
    console.log(`[diag] session_mode=${log.session_mode} delivery_status=${log.delivery_status}`);
    console.log(`[diag] tool_calls=[${toolNames}]`);
    console.log(`[diag] response="${String(log.response).slice(0, 300)}"`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[diag] FAILED', e); process.exit(1); });
