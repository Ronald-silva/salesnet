/**
 * Live reproduction test (authorized by Ronald 2026-07-20, Item 3 step 7 of the
 * "fila de 4 fixes" session): drives the REAL processMessage() pipeline against
 * TEST_SANDBOX_PHONE with LLM_ROUTING_MODE=tiered and a tier='complex' message
 * (COMPLEX_RE — Procon/Anatel/judicial), then confirms via SELECT against the
 * real interaction_logs table that tier_downgraded (migration 040) is written
 * correctly in both downgrade scenarios:
 *
 *   - "missing-key": ANTHROPIC_API_KEY absent → pickProviderForComplex() picks
 *     deepseek up front, tierDowngraded=true from the very first decision.
 *   - "runtime-failure": ANTHROPIC_API_KEY present but invalid → anthropic.messages
 *     .create() genuinely fails at call time, LLM_FALLBACK_PROVIDER=deepseek
 *     catches it, tierDowngraded is set to true in the fallback catch block.
 *
 * Env vars for ANTHROPIC_API_KEY/LLM_FALLBACK_PROVIDER/LLM_ROUTING_MODE are
 * passed on the invoking shell command line, never written to .env — dotenv's
 * default config() does not override variables already present in process.env.
 *
 * assertSandboxNumber() enforced per CLAUDE.md "Política de testes ao vivo
 * contra produção". Every messageId is diag-prefixed for later audit via
 * processed_message_ids.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json scripts/diag-tier-downgraded-live.ts missing-key
 *   ANTHROPIC_API_KEY=sk-ant-diag-invalid-test-key LLM_FALLBACK_PROVIDER=deepseek \
 *     npx ts-node --project tsconfig.json scripts/diag-tier-downgraded-live.ts runtime-failure
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { supabase } from '../src/config/supabase';
import { processMessage } from '../src/agent/processor';

const PHONE = env.TEST_SANDBOX_PHONE!;
const TENANT_ID = env.DEFAULT_TENANT_ID;

const scenario = process.argv[2];
if (scenario !== 'missing-key' && scenario !== 'runtime-failure') {
  console.error('Usage: diag-tier-downgraded-live.ts <missing-key|runtime-failure>');
  process.exit(1);
}

// Precisa bater em COMPLEX_RE (Procon/Anatel/judicial) para classificar como
// tier='complex', mas SEM soar como ameaça legal explícita — esse texto original
// ("vou entrar com ação judicial no Procon") aciona a regra do prompt "Qualquer
// ameaça legal: transferir_humano imediatamente" (skill/prompt-builder.ts:151),
// que seta human_mode=true e bloqueia o próximo diagnóstico. Ver investigação
// "por que human_mode volta pra true sozinho" nesta sessão.
const COMPLEX_MESSAGE =
  'Preciso entender meus direitos sobre uma reclamação no Procon, protocolo diag ' + Date.now();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function latestLog() {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select('created_at, session_mode, llm_provider, tier_downgraded, tool_calls')
    .eq('phone', PHONE)
    .eq('tenant_id', TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`interaction_logs query failed: ${error.message}`);
  return data?.[0] ?? null;
}

async function main() {
  assertSandboxNumber(PHONE);
  console.log(`[diag] scenario=${scenario} sandbox phone=${PHONE} tenant=${TENANT_ID}`);
  console.log(
    `[diag] env snapshot: LLM_ROUTING_MODE=${env.LLM_ROUTING_MODE} ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY ? 'present' : 'absent'} LLM_FALLBACK_PROVIDER=${env.LLM_FALLBACK_PROVIDER ?? 'unset'}`,
  );

  const messageId = `diag-tier-downgraded-${scenario}-${Date.now()}`;
  console.log(`[diag] sending: "${COMPLEX_MESSAGE}" (messageId=${messageId})`);

  await processMessage(PHONE, COMPLEX_MESSAGE, { tenantId: TENANT_ID, messageId });
  await sleep(2000);

  const log = await latestLog();
  if (!log) {
    console.error('[diag] FAIL — no interaction_logs row found');
    process.exit(1);
  }

  console.log(`[diag] session_mode=${log.session_mode} llm_provider=${log.llm_provider} tier_downgraded=${log.tier_downgraded}`);

  if (log.tier_downgraded === true) {
    console.log(`[diag] OK — scenario=${scenario}: tier_downgraded=true confirmed via SELECT against production interaction_logs`);
  } else {
    console.error(`[diag] FAIL — scenario=${scenario}: expected tier_downgraded=true, got ${log.tier_downgraded}`);
    process.exit(1);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[diag] FAILED', e); process.exit(1); });
