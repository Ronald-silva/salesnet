import type Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { anthropic } from '../config/anthropic';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { SYSTEM_PROMPT, getBillingModeContext, getSupportModeContext, getCommercialModeContext } from './prompt';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { getThread, saveMessage, isHumanMode } from './memory';
import { whatsappService } from '../services/whatsapp-service';
import { classifyMessageComplexity } from './complexity-router';
import { classifySession } from './session-classifier';

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

export async function processMessage(phone: string, message: string): Promise<void> {
  if (await isHumanMode(phone)) return;

  try {
    await saveMessage(phone, 'user', message);

    const thread = await getThread(phone);
    const history: Anthropic.MessageParam[] = thread.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Call buscar_cliente directly to get customer context before involving Claude
    const customerData = await executeTool('buscar_cliente', { phone }, phone);

    let invoiceStatus: string | undefined;
    try {
      const customerId = (customerData as { id?: string }).id;
      if (customerId) {
        const invoice = await executeTool('get_fatura_atual', { customer_id: customerId }, phone);
        invoiceStatus = (invoice as { status?: string }).status;
      }
    } catch {
      // invoice lookup is best-effort
    }

    const sessionMode = classifySession(
      message,
      customerData as { status?: string; plan?: { downloadMbps?: number } },
      invoiceStatus,
    );

    const modeContext =
      sessionMode === 'billing'    ? getBillingModeContext() :
      sessionMode === 'support'    ? getSupportModeContext() :
      sessionMode === 'commercial' ? getCommercialModeContext() :
      '';

    const systemWithContext = `${SYSTEM_PROMPT}\n\n## Contexto do cliente atual\nTelefone: ${phone}\nModo: ${sessionMode}\nDados: ${JSON.stringify(customerData)}${modeContext}`;

    const initialToolLog: ToolCallLog[] = [
      { name: 'buscar_cliente', input: { phone }, output: customerData },
    ];

    if (invoiceStatus) {
      initialToolLog.push({ name: 'get_fatura_atual', input: { customer_id: (customerData as { id?: string }).id }, output: { status: invoiceStatus } });
    }

    let primaryProvider: Provider;
    let runOptions: RunOptions;

    if (env.LLM_ROUTING_MODE === 'tiered') {
      const routed = resolveTieredRouting(message);
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

    await supabase.from('interaction_logs').insert({
      phone,
      tool_calls: result.toolCallLog,
      response:   finalText,
    });
  } catch (err) {
    console.error(`[processor] error for ${phone}:`, err);
    await whatsappService.sendText(env.DEFAULT_TENANT_ID, phone, 'Desculpe, ocorreu um erro interno. Tente novamente em instantes.').catch(() => undefined);
  }
}
