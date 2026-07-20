/**
 * Live reproduction test (authorized by Ronald 2026-07-20, Item 2 of the
 * "fila de 4 fixes" session): confirms that every entry written to
 * interaction_logs.tool_calls now carries a `source` field — 'system' for the
 * processor's automatic pre-fetches (buscar_cliente/session_classifier/...)
 * and 'llm' for tool calls the model actually decided to make inside the
 * tool-calling loop (runAnthropicFlow/runDeepSeekFlow).
 *
 * assertSandboxNumber() enforced per CLAUDE.md "Política de testes ao vivo
 * contra produção". Every messageId is diag-prefixed for later audit via
 * processed_message_ids.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/diag-toolcall-source-verification.ts
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { supabase } from '../src/config/supabase';
import { processMessage } from '../src/agent/processor';

const PHONE = env.TEST_SANDBOX_PHONE!;
const TENANT_ID = env.DEFAULT_TENANT_ID;

// Turn 1: prospect flow that should reach the LLM tool-calling loop and make
// it call `registrar_interesse` for real — gives us at least one 'llm'-sourced
// entry alongside the always-present 'system' pre-fetch entries.
// Deliberately avoids every quick-reply trigger keyword (planos/mega/bairro/
// cobertura/suporte/pix/boleto/instala/...) so both turns reach the LLM
// tool-calling loop instead of being intercepted by quickReply().
const TURNS = [
  'Pode registrar meu interesse em ser cliente? Meu nome é Diag ToolSource, moro na Rua das Acácias 45, Fortaleza.',
];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function latestLog() {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select('created_at, session_mode, tool_calls, response')
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
    const messageId = `diag-toolcall-source-${Date.now()}-${i}`;
    console.log(`\n[diag] === turn ${i + 1}: "${text}" (messageId=${messageId}) ===`);

    await processMessage(PHONE, text, { tenantId: TENANT_ID, messageId });
    await sleep(2000);

    const log = await latestLog();
    if (!log) {
      console.log('[diag] no interaction_logs row found yet');
      continue;
    }
    const toolCalls = Array.isArray(log.tool_calls) ? (log.tool_calls as any[]) : [];
    console.log(`[diag] session_mode=${log.session_mode}`);
    console.log(`[diag] response="${String(log.response).slice(0, 400)}"`);
    for (const t of toolCalls) {
      console.log(`[diag]   name=${t.name} source=${t.source ?? '(MISSING)'}`);
    }

    const missing = toolCalls.filter((t) => t.source !== 'system' && t.source !== 'llm');
    if (missing.length > 0) {
      console.error(`[diag] FAIL — ${missing.length} tool_calls entries missing a valid source field`, missing);
    } else if (toolCalls.length > 0) {
      const hasSystem = toolCalls.some((t) => t.source === 'system');
      const hasLlm = toolCalls.some((t) => t.source === 'llm');
      console.log(`[diag] OK — all ${toolCalls.length} entries have source; hasSystem=${hasSystem} hasLlm=${hasLlm}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[diag] FAILED', e); process.exit(1); });
