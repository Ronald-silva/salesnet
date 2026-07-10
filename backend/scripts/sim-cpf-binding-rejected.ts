/**
 * One-off behavioral simulation (read-mostly): drives the REAL prompt-builder output,
 * the REAL salvar_cpf_cliente tool (hitting live SGP read-only via isPhoneRegisteredToCpf),
 * and a REAL DeepSeek call to verify the prompt-builder.ts fix actually changes Sofia's
 * behavior when cpf_binding_rejected: true — not just that it compiles.
 *
 * Uses an obviously fake test phone that is not a real customer, so no real customer data
 * is touched. salvar_cpf_cliente's rejected-binding path never persists anything (no
 * Supabase write) — see tools.ts case 'salvar_cpf_cliente'.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/sim-cpf-binding-rejected.ts
 */
import axios from 'axios';
import { env } from '../src/config/env';
import { getSkillConfig, buildSystemPrompt, buildModeContext } from '../src/agent/skill';
import { TOOL_DEFINITIONS, executeTool } from '../src/agent/tools';
import { isPhoneRegisteredToCpf } from '../src/agent/identity-verification';

const TEST_PHONE = '+5585900000001'; // fake, not a real customer
const TEST_CPF = '111.444.777-35'; // well-known valid-checksum CPF used for testing, not a real assignment
const TENANT_ID = env.DEFAULT_TENANT_ID;

const DEEPSEEK_TOOLS = TOOL_DEFINITIONS.map((tool) => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.input_schema,
  },
}));

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

async function callDeepSeek(messages: DeepSeekMessage[]) {
  const baseUrl = env.DEEPSEEK_BASE_URL.replace(/\/$/, '');
  const { data } = await axios.post(
    `${baseUrl}/chat/completions`,
    { model: env.DEEPSEEK_MODEL, max_tokens: 700, messages, tools: DEEPSEEK_TOOLS },
    { headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' } },
  );
  return data?.choices?.[0]?.message as DeepSeekMessage & { tool_calls?: any[] } | undefined;
}

async function main() {
  console.log(`[sim] preflight: is ${TEST_PHONE} registered to CPF ${TEST_CPF} in SGP? (expect false)`);
  const preflight = await isPhoneRegisteredToCpf(TEST_PHONE, TEST_CPF.replace(/\D/g, ''));
  console.log(`[sim] preflight result: ${preflight}`);
  if (preflight) {
    console.log('[sim] ABORT: this CPF/phone combo is actually registered — pick a different test CPF.');
    return;
  }

  const skillConfig = await getSkillConfig(TENANT_ID);
  const systemPrompt = buildSystemPrompt(skillConfig);
  const modeContext = buildModeContext('default', skillConfig);
  const systemWithContext = `${systemPrompt}\n\n${modeContext}\n\nContexto do cliente atual: telefone ${TEST_PHONE}, ainda não identificado nesta conversa.`;

  console.log('\n[sim] === TURN 1: user gives a CPF, asks about their invoice ===');
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: systemWithContext },
    { role: 'user', content: `Meu CPF é ${TEST_CPF}, quero ver minha fatura` },
  ];

  const turn1 = await callDeepSeek(messages);
  console.log('[sim] assistant turn 1 tool_calls:', JSON.stringify(turn1?.tool_calls));
  console.log('[sim] assistant turn 1 content:', turn1?.content);

  const salvarCall = turn1?.tool_calls?.find((c) => c.function.name === 'salvar_cpf_cliente');
  if (!salvarCall) {
    console.log('[sim] Model did not call salvar_cpf_cliente on turn 1 — cannot proceed with this exact scenario.');
    console.log('[sim] Full turn 1 message:', JSON.stringify(turn1));
    return;
  }

  const parsedInput = JSON.parse(salvarCall.function.arguments || '{}');
  console.log('[sim] executing REAL salvar_cpf_cliente with input:', parsedInput);
  const toolResult = await executeTool('salvar_cpf_cliente', parsedInput, TEST_PHONE, TENANT_ID);
  console.log('[sim] REAL tool result:', JSON.stringify(toolResult));

  if (!(toolResult as any)?.cpf_binding_rejected) {
    console.log('[sim] ABORT: tool did not return cpf_binding_rejected:true — scenario precondition not met.');
    return;
  }

  messages.push({ role: 'assistant', content: turn1?.content ?? null, tool_calls: turn1?.tool_calls });
  messages.push({ role: 'tool', tool_call_id: salvarCall.id, content: JSON.stringify(toolResult) });

  console.log('\n[sim] === TURN 2: model responds after seeing cpf_binding_rejected ===');
  const turn2 = await callDeepSeek(messages);
  console.log('[sim] assistant turn 2 tool_calls:', JSON.stringify(turn2?.tool_calls));
  console.log('[sim] assistant turn 2 content:\n', turn2?.content);

  const calledTransferir = turn2?.tool_calls?.some((c) => c.function.name === 'transferir_humano');
  const text = (turn2?.content ?? '').toLowerCase();
  const mentionsPortal = /minha-?conta|portal/.test(text);
  const mentionsComercial = /comercial/.test(text);

  console.log('\n[sim] === VERDICT ===');
  console.log(`  called transferir_humano directly on turn 2: ${calledTransferir ?? false}`);
  console.log(`  mentions portal/minha-conta: ${mentionsPortal}`);
  console.log(`  mentions canal comercial: ${mentionsComercial}`);

  if (calledTransferir) {
    console.log('  RESULT: FAIL — model jumped straight to transferir_humano instead of offering portal/comercial first.');
  } else if (mentionsPortal || mentionsComercial) {
    console.log('  RESULT: PASS — model offered a self-service next step before any transferir_humano.');
  } else {
    console.log('  RESULT: INCONCLUSIVE — model neither transferred nor clearly mentioned portal/comercial. Re-read the content above.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[sim] fatal error:', err);
    process.exit(1);
  });
