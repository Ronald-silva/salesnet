import type Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { anthropic } from '../config/anthropic';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { SYSTEM_PROMPT, getBillingModeContext, getSupportModeContext, getCommercialModeContext, getProspectModeContext } from './prompt';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { getThread, saveMessage, isHumanMode } from './memory';
import { whatsappService } from '../services/whatsapp-service';
import { classifyMessageComplexity } from './complexity-router';
import { classifySession, type SessionMode } from './session-classifier';
import { sanitizeUserInput } from './sanitize';
import { quickReply } from './quick-reply';
import { getCustomerInsights, buildInsightsContext } from './customer-memory';
import { shouldSendNps, parseNpsResponse, saveNpsResponse, scheduleNps, getPendingNps, clearPendingNps } from './nps-flow';
import { randomUUID } from 'crypto';
import { withPhoneLock } from '../utils/phone-mutex';

type Provider = 'anthropic' | 'deepseek';

type ToolCallLog = { name: string; input: unknown; output: unknown };

type RunOptions = {
  maxTokens: number;
  maxToolIterations: number;
};

type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

type SessionDisambiguationResult = {
  mode: SessionMode;
  confidence: 'low' | 'medium' | 'high';
  reason: string;
};

type SessionModeDecision = {
  baseMode: SessionMode;
  finalMode: SessionMode;
  source: 'regex' | 'llm';
  confidence: 'none' | 'low' | 'medium' | 'high';
  reason: string;
};

const DEEPSEEK_TOOLS = TOOL_DEFINITIONS.map((tool) => ({
  type: 'function' as const,
  function: {
    name:        tool.name,
    description: tool.description,
    parameters:  tool.input_schema,
  },
}));

async function runAnthropicFlow(
  history: Anthropic.MessageParam[],
  systemWithContext: string,
  phone: string,
  initialToolLog: ToolCallLog[],
  options: RunOptions,
): Promise<{ finalText: string; toolCallLog: ToolCallLog[] }> {
  let messages: Anthropic.MessageParam[] = [...history];
  const toolCallLog = [...initialToolLog];
  let response = await anthropic.messages.create({
    model:      env.ANTHROPIC_MODEL,
    max_tokens: options.maxTokens,
    system:     systemWithContext,
    tools:      TOOL_DEFINITIONS,
    messages,
  });

  let iterations = 0;

  while (response.stop_reason === 'tool_use' && iterations < options.maxToolIterations) {
    iterations += 1;
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    messages = [...messages, { role: 'assistant', content: response.content }];

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input as Record<string, unknown>, phone);
      toolCallLog.push({ name: block.name, input: block.input, output: result });
      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     JSON.stringify(result),
      });
    }

    messages = [...messages, { role: 'user', content: toolResults }];

    response = await anthropic.messages.create({
      model:      env.ANTHROPIC_MODEL,
      max_tokens: options.maxTokens,
      system:     systemWithContext,
      tools:      TOOL_DEFINITIONS,
      messages,
    });
  }

  const finalText =
    response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ??
    'Desculpe, não consegui processar sua mensagem. Por favor, tente novamente.';

  return { finalText, toolCallLog };
}

async function runDeepSeekFlow(
  history: Anthropic.MessageParam[],
  systemWithContext: string,
  phone: string,
  initialToolLog: ToolCallLog[],
  options: RunOptions,
): Promise<{ finalText: string; toolCallLog: ToolCallLog[] }> {
  const baseUrl = env.DEEPSEEK_BASE_URL.replace(/\/$/, '');
  const toolCallLog = [...initialToolLog];
  const historyMessages: DeepSeekMessage[] = history.map((m) => ({
    role:    m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  let messages: DeepSeekMessage[] = [{ role: 'system', content: systemWithContext }, ...historyMessages];
  let iterations = 0;

  while (iterations < options.maxToolIterations) {
    iterations += 1;

    const { data } = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model:      env.DEEPSEEK_MODEL,
        max_tokens: options.maxTokens,
        messages,
        tools:      DEEPSEEK_TOOLS,
      },
      {
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const choice = data?.choices?.[0];
    const message = choice?.message as DeepSeekMessage | undefined;
    if (!message) {
      break;
    }

    const toolCalls = message.tool_calls ?? [];

    if (!toolCalls.length) {
      const finalText =
        typeof message.content === 'string' && message.content.trim().length > 0
          ? message.content
          : 'Desculpe, não consegui processar sua mensagem. Por favor, tente novamente.';
      return { finalText, toolCallLog };
    }

    messages.push({
      role:       'assistant',
      content:    message.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      let parsedInput: Record<string, unknown> = {};
      try {
        parsedInput = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        parsedInput = {};
      }

      const result = await executeTool(call.function.name, parsedInput, phone);
      toolCallLog.push({ name: call.function.name, input: parsedInput, output: result });
      messages.push({
        role:         'tool',
        tool_call_id: call.id,
        content:      JSON.stringify(result),
      });
    }
  }

  return {
    finalText: 'Desculpe, não consegui processar sua mensagem. Por favor, tente novamente.',
    toolCallLog,
  };
}

async function runLLMFlow(
  provider: Provider,
  history: Anthropic.MessageParam[],
  systemWithContext: string,
  phone: string,
  initialToolLog: ToolCallLog[],
  options: RunOptions,
): Promise<{ finalText: string; toolCallLog: ToolCallLog[] }> {
  if (provider === 'deepseek') {
    return runDeepSeekFlow(history, systemWithContext, phone, initialToolLog, options);
  }

  return runAnthropicFlow(history, systemWithContext, phone, initialToolLog, options);
}

function getFortalezaContext(): string {
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hour = now.getUTCHours();
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const period = hour < 5 ? 'madrugada' : hour < 12 ? 'manhã' : hour < 18 ? 'tarde' : 'noite';
  const weekdays = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  return `Agora são ${String(hour).padStart(2, '0')}:${minutes}, ${weekdays[now.getUTCDay()]}, ${period}.`;
}

const DEFAULT_TOOL_ROUNDS = 10;

function defaultRunOptions(): RunOptions {
  return {
    maxTokens:         env.LLM_MAX_TOKENS,
    maxToolIterations: DEFAULT_TOOL_ROUNDS,
  };
}

function simpleTierRunOptions(): RunOptions {
  return {
    maxTokens:         Math.min(env.LLM_SIMPLE_MAX_TOKENS, env.LLM_MAX_TOKENS),
    maxToolIterations: env.LLM_SIMPLE_MAX_TOOL_ROUNDS,
  };
}

function pickProviderForComplex(): Provider {
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.DEEPSEEK_API_KEY) return 'deepseek';
  return env.LLM_PROVIDER;
}

function pickProviderForCheapTier(): Provider {
  if (env.DEEPSEEK_API_KEY) return 'deepseek';
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  return env.LLM_PROVIDER;
}

function resolveTieredRouting(message: string): { provider: Provider; options: RunOptions; tier: string } {
  const tier = classifyMessageComplexity(message);
  if (tier === 'complex') {
    return { tier, provider: pickProviderForComplex(), options: defaultRunOptions() };
  }
  if (tier === 'intermediate') {
    return { tier, provider: pickProviderForCheapTier(), options: defaultRunOptions() };
  }
  return { tier, provider: pickProviderForCheapTier(), options: simpleTierRunOptions() };
}

function isSessionDisambiguationCandidate(baseMode: SessionMode, message: string): boolean {
  if (baseMode === 'billing' || baseMode === 'support') return false;
  if (baseMode === 'prospect' || baseMode === 'commercial') return true;
  return /\b(plano|planos|cancel|entender|d[uú]vida|quero|internet|fatura|pagar|lenta|caiu|suporte|t[eé]cnico)\b/i.test(message);
}

function parseSessionDisambiguation(raw: string): SessionDisambiguationResult | null {
  const trimmed = raw.trim();
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  const payload = objectMatch ? objectMatch[0] : trimmed;
  try {
    const parsed = JSON.parse(payload) as Partial<SessionDisambiguationResult>;
    const mode = parsed.mode;
    const confidence = parsed.confidence;
    if (
      (mode === 'billing' || mode === 'support' || mode === 'commercial' || mode === 'prospect' || mode === 'default')
      && (confidence === 'low' || confidence === 'medium' || confidence === 'high')
    ) {
      return {
        mode,
        confidence,
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function disambiguateSessionMode(
  message: string,
  customerData: unknown,
  invoiceStatus: string | undefined,
  baseMode: SessionMode,
): Promise<SessionModeDecision> {
  if (!isSessionDisambiguationCandidate(baseMode, message)) {
    return {
      baseMode,
      finalMode: baseMode,
      source: 'regex',
      confidence: 'none',
      reason: 'not_candidate',
    };
  }

  const provider = pickProviderForCheapTier();
  const compactCustomer = JSON.stringify(customerData).slice(0, 1200);
  const prompt = [
    'Classifique a intenção da mensagem em UM modo de sessão.',
    'Responda APENAS JSON válido sem markdown.',
    'Schema: {"mode":"billing|support|commercial|prospect|default","confidence":"low|medium|high","reason":"texto curto"}',
    'Regras:',
    '- billing: cobrança, pagamento, suspensão por débito',
    '- support: problema técnico, internet lenta/instável/sem sinal',
    '- commercial: cliente com baixa velocidade insatisfeito, possível upgrade após suporte',
    '- prospect: intenção explícita de contratar/instalar como novo cliente',
    '- default: dúvidas gerais, inclusive cliente perguntando sobre o próprio plano',
    '',
    `base_mode=${baseMode}`,
    `invoice_status=${invoiceStatus ?? 'unknown'}`,
    `customer_data=${compactCustomer}`,
    `message=${message}`,
  ].join('\n');

  try {
    if (provider === 'anthropic') {
      const response = await anthropic.messages.create({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 160,
        system: 'Você é um classificador determinístico de intenção. Responda somente JSON.',
        messages: [{ role: 'user', content: prompt }],
      });
      const raw = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
      const parsed = parseSessionDisambiguation(raw);
      if (!parsed || parsed.confidence === 'low') {
        return {
          baseMode,
          finalMode: baseMode === 'prospect' ? 'default' : baseMode,
          source: 'llm',
          confidence: parsed?.confidence ?? 'low',
          reason: parsed?.reason ?? 'invalid_or_low_confidence',
        };
      }
      return {
        baseMode,
        finalMode: parsed.mode,
        source: 'llm',
        confidence: parsed.confidence,
        reason: parsed.reason,
      };
    }

    const baseUrl = env.DEEPSEEK_BASE_URL.replace(/\/$/, '');
    const { data } = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: env.DEEPSEEK_MODEL,
        max_tokens: 160,
        messages: [
          { role: 'system', content: 'Você é um classificador determinístico de intenção. Responda somente JSON.' },
          { role: 'user', content: prompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );
    const raw = String(data?.choices?.[0]?.message?.content ?? '');
    const parsed = parseSessionDisambiguation(raw);
    if (!parsed || parsed.confidence === 'low') {
      return {
        baseMode,
        finalMode: baseMode === 'prospect' ? 'default' : baseMode,
        source: 'llm',
        confidence: parsed?.confidence ?? 'low',
        reason: parsed?.reason ?? 'invalid_or_low_confidence',
      };
    }
    return {
      baseMode,
      finalMode: parsed.mode,
      source: 'llm',
      confidence: parsed.confidence,
      reason: parsed.reason,
    };
  } catch (err) {
    console.warn('[processor] session disambiguation failed:', err);
    return {
      baseMode,
      finalMode: baseMode === 'prospect' ? 'default' : baseMode,
      source: 'llm',
      confidence: 'low',
      reason: 'llm_error',
    };
  }
}

export async function processMessage(phone: string, message: string, rawMessageId?: string): Promise<void> {
  return withPhoneLock(phone, async () => {
  if (await isHumanMode(phone)) return;

  const messageId = rawMessageId;
  if (messageId) {
    const { error } = await supabase
      .from('processed_message_ids')
      .insert({ message_id: messageId, phone })
      .select()
      .single();
    if (error?.code === '23505') {
      console.log('[processor] duplicate message skipped:', messageId);
      return;
    }
  }

  const startMs = Date.now();
  const clean = sanitizeUserInput(message);

  // ── NPS: captura resposta se pergunta estava pendente ────────────────────────
  const nps = getPendingNps(phone);
  if (nps) {
    if (!nps.sent) {
      // User sent a new message before the 30-min timer fired — cancel NPS
      clearPendingNps(phone);
    } else {
      const score = parseNpsResponse(clean);
      if (score !== null) {
        try {
          await saveNpsResponse(phone, env.DEFAULT_TENANT_ID, score, nps.sessionId);
          if (score <= 2) console.warn(`[processor] nps low score: phone=${phone} score=${score}`);
          await whatsappService.sendText(
            env.DEFAULT_TENANT_ID,
            phone,
            'Muito obrigada pela sua avaliação! 🙏 Sua opinião nos ajuda a melhorar o atendimento.',
          );
        } catch (err) {
          console.error('[processor] nps save error:', err);
        }
        clearPendingNps(phone);
        return;
      }
      // Non-numeric reply while NPS is pending — clear and process normally
      clearPendingNps(phone);
    }
  }

  // ── Quick reply: FAQ direto, sem LLM ────────────────────────────────────────
  const faqResponse = await quickReply(clean, phone);
  if (faqResponse) {
    try {
      await saveMessage(phone, 'user', clean);
      await saveMessage(phone, 'assistant', faqResponse);
      await whatsappService.sendText(env.DEFAULT_TENANT_ID, phone, faqResponse);
      await supabase.from('interaction_logs').insert({ phone, tool_calls: [], response: faqResponse });
    } catch (err) {
      console.error(`[processor] quick-reply send error for ${phone}:`, err);
    }
    return;
  }

  try {
    await saveMessage(phone, 'user', clean);

    const thread = await getThread(phone);
    const history: Anthropic.MessageParam[] = thread.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Call buscar_cliente and fetch customer history in parallel
    const [customerData, insights] = await Promise.all([
      executeTool('buscar_cliente', { phone }, phone),
      getCustomerInsights(phone, env.DEFAULT_TENANT_ID),
    ]);

    let invoiceStatus: string | undefined;
    try {
      const customerId = (customerData as { id?: string }).id;
      if (customerId) {
        const invoice = await executeTool('get_fatura_atual', { customer_id: customerId }, phone);
        invoiceStatus = (invoice as { status?: string }).status;
      }
    } catch (err) {
      console.warn('[processor] get_fatura_atual failed:', err);
    }

    const baseSessionMode = classifySession(
      clean,
      customerData as { status?: string; plan?: { downloadMbps?: number } },
      invoiceStatus,
    );
    const sessionModeDecision = await disambiguateSessionMode(clean, customerData, invoiceStatus, baseSessionMode);
    const sessionMode = sessionModeDecision.finalMode;

    const modeContext =
      sessionMode === 'billing'    ? getBillingModeContext() :
      sessionMode === 'support'    ? getSupportModeContext() :
      sessionMode === 'commercial' ? getCommercialModeContext() :
      sessionMode === 'prospect'   ? getProspectModeContext() :
      '';

    const initialToolLog: ToolCallLog[] = [
      { name: 'buscar_cliente', input: { phone }, output: customerData },
      {
        name: 'session_classifier',
        input: { message: clean, invoiceStatus: invoiceStatus ?? null },
        output: sessionModeDecision,
      },
    ];

    if (invoiceStatus) {
      initialToolLog.push({ name: 'get_fatura_atual', input: { customer_id: (customerData as { id?: string }).id }, output: { status: invoiceStatus } });
    }

    // Pre-call verificar_cobertura so the LLM never needs to guess neighborhoods
    let coverageContext = '';
    if (/bairro|cobertura|atend|região|disponível|minha.?área/i.test(clean)) {
      try {
        const coverageData = await executeTool('verificar_cobertura', { neighborhood: '*' }, phone);
        initialToolLog.push({ name: 'verificar_cobertura', input: { neighborhood: '*' }, output: coverageData });
        coverageContext = `\n\n## Bairros atendidos (fonte oficial — use SOMENTE estes)\n${JSON.stringify(coverageData)}`;
      } catch (err) {
        console.warn('[processor] verificar_cobertura pre-call failed:', err);
      }
    }

    const { contratoCentralSenha, contratoCentralLogin, ...safeCustomerData } = customerData as Record<string, unknown>;
    const insightsContext = buildInsightsContext(insights);
    const systemWithContext = `${getFortalezaContext()}\n\n${SYSTEM_PROMPT}\n\n## Contexto do cliente atual\nTelefone: ${phone}\nModo: ${sessionMode}\nDados: ${JSON.stringify(safeCustomerData)}${modeContext}${coverageContext}${insightsContext}`;

    let primaryProvider: Provider;
    let runOptions: RunOptions;

    if (env.LLM_ROUTING_MODE === 'tiered') {
      const routed = resolveTieredRouting(clean);
      primaryProvider = routed.provider;
      runOptions = routed.options;
      console.log(
        `[processor] tier=${routed.tier} provider=${primaryProvider} maxTokens=${runOptions.maxTokens} toolRoundsCap=${runOptions.maxToolIterations}`,
      );
    } else {
      primaryProvider = env.LLM_PROVIDER;
      runOptions = defaultRunOptions();
    }

    let result: { finalText: string; toolCallLog: ToolCallLog[] };

    try {
      result = await runLLMFlow(primaryProvider, history, systemWithContext, phone, initialToolLog, runOptions);
    } catch (providerErr) {
      if (!env.LLM_FALLBACK_PROVIDER || env.LLM_FALLBACK_PROVIDER === primaryProvider) {
        throw providerErr;
      }

      console.error(`[processor] provider ${primaryProvider} failed, trying fallback ${env.LLM_FALLBACK_PROVIDER}:`, providerErr);
      result = await runLLMFlow(
        env.LLM_FALLBACK_PROVIDER,
        history,
        systemWithContext,
        phone,
        initialToolLog,
        runOptions,
      );
    }

    const finalText = result.finalText;

    await saveMessage(phone, 'assistant', finalText);
    await whatsappService.sendText(env.DEFAULT_TENANT_ID, phone, finalText);

    // Schedule NPS before inserting the log so shouldSendNps sees the previous session
    if (sessionMode !== 'prospect') {
      try {
        const shouldAsk = await shouldSendNps(phone, env.DEFAULT_TENANT_ID);
        if (shouldAsk) {
          scheduleNps(phone, env.DEFAULT_TENANT_ID, randomUUID(), async (tid, p, text) => {
            await whatsappService.sendText(tid, p, text);
          });
        }
      } catch (err) {
        console.warn('[processor] nps check failed:', err);
      }
    }

    await supabase.from('interaction_logs').insert({
      phone,
      session_mode: sessionMode,
      tool_calls: result.toolCallLog,
      response:   finalText,
      processing_ms: Date.now() - startMs,
    });
  } catch (err) {
    console.error(`[processor] error for ${phone}:`, err);
    await whatsappService.sendText(env.DEFAULT_TENANT_ID, phone, 'Desculpe, ocorreu um erro interno. Tente novamente em instantes.').catch((e: unknown) => console.error('[processor] failed to send error reply:', e));
  }
  });
}
