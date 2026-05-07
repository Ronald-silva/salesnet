import type Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '../config/anthropic';
import { supabase } from '../config/supabase';
import { SYSTEM_PROMPT } from './prompt';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { getThread, saveMessage, isHumanMode } from './memory';
import { sendMessage } from '../integrations/twilio/sender';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

export async function processMessage(phone: string, message: string): Promise<void> {
  if (await isHumanMode(phone)) return;

  await saveMessage(phone, 'user', message);

  const thread = await getThread(phone);
  const history: Anthropic.MessageParam[] = thread.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Call buscar_cliente directly to get customer context before involving Claude
  const customerData = await executeTool('buscar_cliente', { phone }, phone);
  const systemWithContext = `${SYSTEM_PROMPT}\n\n## Contexto do cliente atual\nTelefone: ${phone}\nDados: ${JSON.stringify(customerData)}`;

  let messages: Anthropic.MessageParam[] = [...history];

  let response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemWithContext,
    tools:      TOOL_DEFINITIONS,
    messages,
  });

  const toolCallLog: { name: string; input: unknown; output: unknown }[] = [
    { name: 'buscar_cliente', input: { phone }, output: customerData },
  ];

  while (response.stop_reason === 'tool_use') {
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
      model:      MODEL,
      max_tokens: MAX_TOKENS,
      system:     systemWithContext,
      tools:      TOOL_DEFINITIONS,
      messages,
    });
  }

  const finalText =
    response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ??
    'Desculpe, não consegui processar sua mensagem. Por favor, tente novamente.';

  await saveMessage(phone, 'assistant', finalText);
  await sendMessage(phone, finalText);

  await supabase.from('interaction_logs').insert({
    phone,
    tool_calls: toolCallLog,
    response:   finalText,
  });
}
