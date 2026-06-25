import type Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { anthropic } from '../config/anthropic';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { getSkillConfig, buildSystemPrompt, buildModeContext, buildQualityExamples } from './skill';
import { parseProcessMessageOptions } from './process-message-options';
import type { ProcessMessageOptions } from './process-message-options';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { getThread, saveMessage, isHumanMode } from './memory';
import { lookupCustomer, extractCpfFromText, buildIdentificationContext } from './customer-lookup';
import { buildMediaMessageContext } from './media-context';
import { whatsappService } from '../services/whatsapp-service';
import { classifyMessageComplexity } from './complexity-router';
import { classifySession, type SessionMode } from './session-classifier';
import { formatOutgoingWhatsApp, sanitizeUserInput } from './sanitize';
import { messageAsksForPlans, quickReply } from './quick-reply';
import { getCustomerInsights, buildInsightsContext } from './customer-memory';
import { lookupKnowledge } from './knowledge-lookup';
import { shouldSendNps, parseNpsResponse, saveNpsResponse, scheduleNps, getPendingNps, clearPendingNps } from './nps-flow';
import { handleBringForwardReply } from './bring-forward-flow';
import { randomUUID } from 'crypto';
import { withPhoneLock } from '../utils/phone-mutex';
import { sanitizeOutgoingMessage } from '../utils/sanitize-outgoing';
import { warnIfDailyBudgetExceeded } from './llm-budget';
import { isSendableWhatsAppTarget } from '../lib/phone';

type Provider = 'anthropic' | 'deepseek';

type ToolCallLog = { name: string; input: unknown; output: unknown };

type LlmUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  provider: Provider;
  model: string;
};

function emptyUsage(provider: Provider): LlmUsageTotals {
  return {
    inputTokens:  0,
    outputTokens: 0,
    provider,
    model:        provider === 'deepseek' ? env.DEEPSEEK_MODEL : env.ANTHROPIC_MODEL,
  };
}

function mergeUsage(base: LlmUsageTotals, extra: LlmUsageTotals): LlmUsageTotals {
  return {
    inputTokens:  base.inputTokens + extra.inputTokens,
    outputTokens: base.outputTokens + extra.outputTokens,
    provider:     extra.provider,
    model:        extra.model,
  };
}

function usageFromAnthropicResponse(response: Anthropic.Message, provider: Provider): LlmUsageTotals {
  return {
    inputTokens:  response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    provider,
    model:        env.ANTHROPIC_MODEL,
  };
}

function usageFromDeepSeekResponse(
  data: { usage?: { prompt_tokens?: number; completion_tokens?: number } },
  provider: Provider,
): LlmUsageTotals {
  return {
    inputTokens:  data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    provider,
    model:        env.DEEPSEEK_MODEL,
  };
}

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

/**
 * Executes a tool inside the LLM loop without ever throwing: a failing tool
 * (e.g. get_fatura_atual when there is no open invoice) must surface as a
 * structured result the model can handle, not crash the whole conversation.
 */
async function safeExecuteTool(
  name: string,
  input: Record<string, unknown>,
  phone: string,
  tenantId: string,
): Promise<unknown> {
  try {
    return await executeTool(name, input, phone, tenantId);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[processor] tool "${name}" failed for ${phone}: ${reason}`);
    return { error: reason };
  }
}

async function runAnthropicFlow(
  history: Anthropic.MessageParam[],
  systemWithContext: string,
  phone: string,
  tenantId: string,
  initialToolLog: ToolCallLog[],
  options: RunOptions,
): Promise<{ finalText: string; toolCallLog: ToolCallLog[]; usage: LlmUsageTotals }> {
  let messages: Anthropic.MessageParam[] = [...history];
  const toolCallLog = [...initialToolLog];
  let usage = emptyUsage('anthropic');
  let response = await anthropic.messages.create({
    model:      env.ANTHROPIC_MODEL,
    max_tokens: options.maxTokens,
    system:     systemWithContext,
    tools:      TOOL_DEFINITIONS,
    messages,
  });
  usage = mergeUsage(usage, usageFromAnthropicResponse(response, 'anthropic'));

  let iterations = 0;

  while (response.stop_reason === 'tool_use' && iterations < options.maxToolIterations) {
    iterations += 1;
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    messages = [...messages, { role: 'assistant', content: response.content }];

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      const result = await safeExecuteTool(
        block.name,
        block.input as Record<string, unknown>,
        phone,
        tenantId,
      );
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
    usage = mergeUsage(usage, usageFromAnthropicResponse(response, 'anthropic'));
  }

  const finalText =
    response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ??
    LLM_EMPTY_RESPONSE_FALLBACK;

  return { finalText, toolCallLog, usage };
}

async function runDeepSeekFlow(
  history: Anthropic.MessageParam[],
  systemWithContext: string,
  phone: string,
  tenantId: string,
  initialToolLog: ToolCallLog[],
  options: RunOptions,
): Promise<{ finalText: string; toolCallLog: ToolCallLog[]; usage: LlmUsageTotals }> {
  const baseUrl = env.DEEPSEEK_BASE_URL.replace(/\/$/, '');
  const toolCallLog = [...initialToolLog];
  let usage = emptyUsage('deepseek');
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

    usage = mergeUsage(usage, usageFromDeepSeekResponse(data, 'deepseek'));

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
          : LLM_EMPTY_RESPONSE_FALLBACK;
      return { finalText, toolCallLog, usage };
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

      const result = await safeExecuteTool(call.function.name, parsedInput, phone, tenantId);
      toolCallLog.push({ name: call.function.name, input: parsedInput, output: result });
      messages.push({
        role:         'tool',
        tool_call_id: call.id,
        content:      JSON.stringify(result),
      });
    }
  }

  return {
    finalText: LLM_EMPTY_RESPONSE_FALLBACK,
    toolCallLog,
    usage,
  };
}

async function runLLMFlow(
  provider: Provider,
  history: Anthropic.MessageParam[],
  systemWithContext: string,
  phone: string,
  tenantId: string,
  initialToolLog: ToolCallLog[],
  options: RunOptions,
): Promise<{ finalText: string; toolCallLog: ToolCallLog[]; usage: LlmUsageTotals }> {
  if (provider === 'deepseek') {
    return runDeepSeekFlow(history, systemWithContext, phone, tenantId, initialToolLog, options);
  }

  return runAnthropicFlow(history, systemWithContext, phone, tenantId, initialToolLog, options);
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

const LLM_EMPTY_RESPONSE_FALLBACK =
  'Desculpe, não consegui processar sua mensagem. Por favor, tente novamente.';

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
): Promise<{ decision: SessionModeDecision; usage: LlmUsageTotals }> {
  if (!isSessionDisambiguationCandidate(baseMode, message)) {
    return {
      decision: {
        baseMode,
        finalMode: baseMode,
        source: 'regex',
        confidence: 'none',
        reason: 'not_candidate',
      },
      usage: emptyUsage(pickProviderForCheapTier()),
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
      const usage = usageFromAnthropicResponse(response, 'anthropic');
      const raw = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
      const parsed = parseSessionDisambiguation(raw);
      if (!parsed || parsed.confidence === 'low') {
        return {
          decision: {
            baseMode,
            finalMode: baseMode === 'prospect' ? 'default' : baseMode,
            source: 'llm',
            confidence: parsed?.confidence ?? 'low',
            reason: parsed?.reason ?? 'invalid_or_low_confidence',
          },
          usage,
        };
      }
      return {
        decision: {
          baseMode,
          finalMode: parsed.mode,
          source: 'llm',
          confidence: parsed.confidence,
          reason: parsed.reason,
        },
        usage,
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
    const usage = usageFromDeepSeekResponse(data, 'deepseek');
    const raw = String(data?.choices?.[0]?.message?.content ?? '');
    const parsed = parseSessionDisambiguation(raw);
    if (!parsed || parsed.confidence === 'low') {
      return {
        decision: {
          baseMode,
          finalMode: baseMode === 'prospect' ? 'default' : baseMode,
          source: 'llm',
          confidence: parsed?.confidence ?? 'low',
          reason: parsed?.reason ?? 'invalid_or_low_confidence',
        },
        usage,
      };
    }
    return {
      decision: {
        baseMode,
        finalMode: parsed.mode,
        source: 'llm',
        confidence: parsed.confidence,
        reason: parsed.reason,
      },
      usage,
    };
  } catch (err) {
    console.warn('[processor] session disambiguation failed:', err);
    return {
      decision: {
        baseMode,
        finalMode: baseMode === 'prospect' ? 'default' : baseMode,
        source: 'llm',
        confidence: 'low',
        reason: 'llm_error',
      },
      usage: emptyUsage(provider),
    };
  }
}

export async function processMessage(
  phone: string,
  message: string,
  options?: string | ProcessMessageOptions,
): Promise<void> {
  const { messageId, tenantId: tenantIdOpt } = parseProcessMessageOptions(options);
  const tenantId = tenantIdOpt ?? env.DEFAULT_TENANT_ID;

  const lockKey = `${tenantId}::${phone}`;

  return withPhoneLock(lockKey, async () => {
  if (await isHumanMode(phone, tenantId)) return;
  if (messageId) {
    const { error } = await supabase
      .from('processed_message_ids')
      .insert({ message_id: messageId, phone, tenant_id: tenantId })
      .select()
      .single();
    if (error?.code === '23505') {
      console.log('[processor] duplicate message skipped:', messageId);
      return;
    }
  }

  const startMs = Date.now();
  const clean = sanitizeUserInput(message);

  // ── Antecipação de visita: captura SIM/NÃO se há oferta pendente (20 min) ─────
  try {
    if (await handleBringForwardReply(phone, clean, tenantId)) return;
  } catch (err) {
    console.error('[processor] bring-forward reply error:', err);
  }

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
          await saveNpsResponse(phone, tenantId, score, nps.sessionId);
          if (score <= 2) console.warn(`[processor] nps low score: phone=${phone} score=${score}`);
          await whatsappService.sendText(
            tenantId,
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

  // ── Fila de espera: salva mensagem mas não responde ─────────────────────────
  {
    const earlyThread = await getThread(phone, tenantId);
    if ((earlyThread as { status?: string }).status === 'waiting') {
      await saveMessage(phone, 'user', clean, tenantId);
      return;
    }
  }

  // ── Quick reply: FAQ direto, sem LLM ────────────────────────────────────────
  const faqResponse = await quickReply(clean, phone);
  if (faqResponse) {
    try {
      await saveMessage(phone, 'user', clean, tenantId);
      await saveMessage(phone, 'assistant', faqResponse, tenantId);
      await whatsappService.sendText(tenantId, phone, formatOutgoingWhatsApp(faqResponse));
      await supabase.from('interaction_logs').insert({
        phone,
        tenant_id: tenantId,
        session_mode: 'default',
        tool_calls: [],
        response: faqResponse,
        processing_ms: Date.now() - startMs,
      });
    } catch (err) {
      console.error(`[processor] quick-reply send error for ${phone}:`, err);
    }
    return;
  }

  try {
    await saveMessage(phone, 'user', clean, tenantId);

    const thread = await getThread(phone, tenantId);
    const history: Anthropic.MessageParam[] = thread.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const cpfFromMessage = extractCpfFromText(clean);

    // Identify customer: WhatsApp phone first, then CPF (message or thread)
    const [lookupResult, insights, skillConfig] = await Promise.all([
      lookupCustomer({
        whatsappPhone: phone,
        tenantId,
        cpfFromMessage,
        cpfFromThread: thread.cpf ?? null,
      }),
      getCustomerInsights(phone, tenantId),
      getSkillConfig(tenantId),
    ]);
    const customerData = lookupResult.customer;

    let invoiceStatus: string | undefined;
    try {
      const customerId = (customerData as { id?: string }).id;
      if (customerId) {
        const invoice = await executeTool(
          'get_fatura_atual',
          { customer_id: customerId },
          phone,
          tenantId,
        );
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
    const { decision: sessionModeDecision, usage: disambiguationUsage } =
      await disambiguateSessionMode(clean, customerData, invoiceStatus, baseSessionMode);
    const sessionMode = sessionModeDecision.finalMode;

    // Few-shot baseado no NPS real do tenant para este modo de sessão.
    // Disparado aqui para sobrepor à pré-chamada de cobertura abaixo.
    const qualityExamplesPromise = buildQualityExamples(tenantId, sessionMode);
    const knowledgePromise = lookupKnowledge(tenantId, clean, sessionMode);

    const systemPrompt = buildSystemPrompt(skillConfig);
    const modeContext = buildModeContext(sessionMode, skillConfig);

    const initialToolLog: ToolCallLog[] = [
      {
        name: 'buscar_cliente',
        input: {
          phone,
          ...(cpfFromMessage ? { cpf: cpfFromMessage } : thread.cpf ? { cpf: thread.cpf } : {}),
        },
        output: {
          ...customerData,
          _lookup: {
            method: lookupResult.method,
            attempts: lookupResult.attempts,
            cpfUsed: lookupResult.cpfUsed ?? null,
          },
        },
      },
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
    if (
      !messageAsksForPlans(clean) &&
      /bairro|cobertura|atend|regi[aã]o|dispon[ií]vel|minha.?[aá]rea/i.test(clean) &&
      !/\bplanos?\b/i.test(clean)
    ) {
      try {
        const coverageData = await executeTool(
          'verificar_cobertura',
          { neighborhood: '*' },
          phone,
          tenantId,
        );
        initialToolLog.push({ name: 'verificar_cobertura', input: { neighborhood: '*' }, output: coverageData });
        coverageContext = `\n\n## Bairros atendidos (fonte oficial — use SOMENTE estes)\n${JSON.stringify(coverageData)}`;
      } catch (err) {
        console.warn('[processor] verificar_cobertura pre-call failed:', err);
      }
    }

    const { contratoCentralSenha, contratoCentralLogin, ...safeCustomerData } = customerData as Record<string, unknown>;
    const insightsContext = buildInsightsContext(insights);
    const [qualityExamples, knowledgeContext] = await Promise.all([
      qualityExamplesPromise,
      knowledgePromise,
    ]);
    const identificationContext = buildIdentificationContext(lookupResult, phone);
    const mediaContext = buildMediaMessageContext(clean);
    const systemWithContext =
      `${getFortalezaContext()}\n\n${systemPrompt}` +
      `\n\n## Contexto do cliente atual` +
      `\nTelefone: ${phone}` +
      `\nModo: ${sessionMode}` +
      `\nDados: ${JSON.stringify(safeCustomerData)}` +
      modeContext +
      identificationContext +
      mediaContext +
      coverageContext +
      insightsContext +
      qualityExamples +
      knowledgeContext;

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

    let result: { finalText: string; toolCallLog: ToolCallLog[]; usage: LlmUsageTotals };
    let llmUsage = disambiguationUsage;

    try {
      result = await runLLMFlow(
        primaryProvider,
        history,
        systemWithContext,
        phone,
        tenantId,
        initialToolLog,
        runOptions,
      );
      llmUsage = mergeUsage(llmUsage, result.usage);
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
        tenantId,
        initialToolLog,
        runOptions,
      );
      llmUsage = mergeUsage(llmUsage, result.usage);
    }

    const finalText = formatOutgoingWhatsApp(result.finalText);

    if (finalText === LLM_EMPTY_RESPONSE_FALLBACK) {
      console.warn(
        `[processor] LLM empty response phone=${phone} tenant=${tenantId} tools=${result.toolCallLog.length}`,
        result.toolCallLog.map((t) => t.name).join(','),
      );
    }

    await saveMessage(phone, 'assistant', finalText, tenantId);
    const safeResponse = sanitizeOutgoingMessage(finalText);
    await whatsappService.sendText(tenantId, phone, safeResponse);

    // Schedule NPS before inserting the log so shouldSendNps sees the previous session
    if (sessionMode !== 'prospect') {
      try {
        const shouldAsk = await shouldSendNps(phone, tenantId);
        if (shouldAsk) {
          scheduleNps(phone, tenantId, randomUUID(), async (tid, p, text) => {
            await whatsappService.sendText(tid, p, text);
          });
        }
      } catch (err) {
        console.warn('[processor] nps check failed:', err);
      }
    }

    await supabase.from('interaction_logs').insert({
      phone,
      tenant_id: tenantId,
      session_mode: sessionMode,
      tool_calls: result.toolCallLog,
      response:   finalText,
      processing_ms: Date.now() - startMs,
      input_tokens:  llmUsage.inputTokens > 0 ? llmUsage.inputTokens : null,
      output_tokens: llmUsage.outputTokens > 0 ? llmUsage.outputTokens : null,
      llm_provider:  llmUsage.inputTokens > 0 ? llmUsage.provider : null,
      llm_model:     llmUsage.inputTokens > 0 ? llmUsage.model : null,
    });

    await warnIfDailyBudgetExceeded();
  } catch (err) {
    console.error(`[processor] error for ${phone}:`, err);
    if (isSendableWhatsAppTarget(phone)) {
      await whatsappService
        .sendText(tenantId, phone, 'Desculpe, ocorreu um erro interno. Tente novamente em instantes.')
        .catch((e: unknown) => console.error('[processor] failed to send error reply:', e));
    } else {
      console.warn(`[processor] skip error reply — invalid phone: ${phone}`);
    }
  }
  });
}
