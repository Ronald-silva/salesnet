import { supabase } from '../config/supabase';
import { getCustomerByPhone } from '../integrations/sgp/customers';
import { markChurnRiskByPhone } from './tools';
import { sanitizeOutgoingMessage } from '../utils/sanitize-outgoing';

type NpsPending = {
  sessionId: string;
  scheduledAt: Date;
  sent: boolean;
};

const pendingNps = new Map<string, NpsPending>();

const MS_24H = 24 * 60 * 60 * 1000;
const MS_48H = 48 * 60 * 60 * 1000;

const RECOVERY_MESSAGE =
  'Olá! Vimos que sua última experiência não foi boa. Quero entender o que aconteceu e resolver pra você. Pode me contar o que houve?';

const REFERRAL_NPS_MESSAGE =
  'Que ótimo que conseguimos te ajudar! 😊 Se conhecer alguém que precise de internet fibra, pode nos indicar — adoraríamos atender!';

export function getPendingNps(phone: string): NpsPending | undefined {
  return pendingNps.get(phone);
}

export function clearPendingNps(phone: string): void {
  pendingNps.delete(phone);
}

export async function shouldSendNps(phone: string, tenantId: string): Promise<boolean> {
  if (pendingNps.has(phone)) return false;

  // Query the last interaction log (called before inserting the current one,
  // so this reflects the previous session)
  const { data: log } = await supabase
    .from('interaction_logs')
    .select('created_at, session_mode')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!log) return false;

  const entry = log as { created_at: string; session_mode: string | null };

  if (entry.session_mode === 'prospect') return false;

  const lastAt = new Date(entry.created_at);
  const diffMs = Date.now() - lastAt.getTime();
  const thirtyMin = 30 * 60 * 1000;
  const twoHours  = 2 * 60 * 60 * 1000;

  if (diffMs < thirtyMin || diffMs > twoHours) return false;

  // Guard against sending NPS twice in the same window
  const windowStart = new Date(Date.now() - twoHours).toISOString();
  const { count } = await supabase
    .from('nps_responses')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .gte('created_at', windowStart);

  return (count ?? 0) === 0;
}

export function parseNpsResponse(message: string): number | null {
  const trimmed = message.trim();
  if (!/^\d$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  if (n < 1 || n > 5) return null;
  return n;
}

async function scheduleMessage(
  phone: string,
  tenantId: string,
  message: string,
  delayMs: number,
): Promise<void> {
  const sendAfter = new Date(Date.now() + delayMs).toISOString();
  const { error } = await supabase.from('scheduled_messages').insert({
    phone,
    tenant_id: tenantId,
    message,
    send_after: sendAfter,
  });
  if (error) throw new Error(`Failed to schedule message: ${error.message}`);
}

async function hasReferralCampaign(customerId: string): Promise<boolean> {
  const { data } = await supabase
    .from('campaign_sends')
    .select('id')
    .eq('customer_id', customerId)
    .eq('type', 'referral')
    .limit(1)
    .maybeSingle();
  return data !== null;
}

type ToolCallEntry = { name?: unknown };

function extractToolsUsed(toolCalls: unknown): string[] {
  if (!Array.isArray(toolCalls)) return [];
  const names = toolCalls
    .map((c) => (typeof (c as ToolCallEntry).name === 'string' ? ((c as ToolCallEntry).name as string) : null))
    .filter((n): n is string => n !== null);
  return [...new Set(names)];
}

/**
 * Extrai frases-chave curtas da resposta da Sofia para servir de few-shot.
 * Mantém apenas sentenças com conteúdo real (sem emojis/asteriscos) e limita
 * o volume para não inchar o prompt depois.
 */
function extractKeyPhrases(response: unknown): string[] {
  if (typeof response !== 'string') return [];
  return response
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 15 && s.length <= 200)
    .slice(0, 3);
}

/**
 * Liga o score do NPS à conversa que o gerou. Best-effort: nunca derruba o
 * fluxo de salvamento do NPS. Score <=2 vira exemplo 'bad', score 5 vira
 * exemplo 'good' — alimentando o feedback loop de qualidade.
 */
async function captureConversationQuality(
  phone: string,
  tenantId: string,
  score: number,
  sessionId: string,
): Promise<void> {
  const { data: log } = await supabase
    .from('interaction_logs')
    .select('session_mode, tool_calls, response')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!log) return;

  const entry = log as {
    session_mode: string | null;
    tool_calls: unknown;
    response: unknown;
  };

  const { data: thread } = await supabase
    .from('conversation_threads')
    .select('messages')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const messages = (thread as { messages?: unknown } | null)?.messages;
  const messageCount = Array.isArray(messages) ? messages.length : null;

  const toolsUsed = extractToolsUsed(entry.tool_calls);
  const hadHumanTransfer = toolsUsed.includes('transferir_humano');

  const exampleType = score <= 2 ? 'bad' : score === 5 ? 'good' : null;

  const { error } = await supabase.from('conversation_quality').insert({
    tenant_id:              tenantId,
    phone,
    session_id:             sessionId,
    nps_score:              score,
    session_mode:           entry.session_mode,
    message_count:          messageCount,
    resolved_without_human: !hadHumanTransfer,
    tools_used:             toolsUsed,
    key_phrases:            extractKeyPhrases(entry.response),
    marked_as_example:      exampleType !== null,
    example_type:           exampleType,
  });
  if (error) throw new Error(`Failed to insert conversation_quality: ${error.message}`);
}

async function applyNpsScoreActions(
  phone: string,
  tenantId: string,
  score: number,
): Promise<void> {
  if (score <= 2) {
    await markChurnRiskByPhone(phone, tenantId);
    await scheduleMessage(phone, tenantId, RECOVERY_MESSAGE, MS_24H);
    return;
  }

  if (score === 3) return;

  try {
    const customer = await getCustomerByPhone(phone);
    if (await hasReferralCampaign(customer.id)) return;
  } catch {
    // Not a registered customer — still eligible for referral prompt
  }

  await scheduleMessage(phone, tenantId, REFERRAL_NPS_MESSAGE, MS_48H);
}

export async function saveNpsResponse(
  phone: string,
  tenantId: string,
  score: number,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.from('nps_responses').insert({
    phone,
    tenant_id: tenantId,
    score,
    session_id: sessionId,
  });
  if (error) throw new Error(`Failed to save NPS response: ${error.message}`);

  try {
    await captureConversationQuality(phone, tenantId, score, sessionId);
  } catch (err) {
    console.error(`[nps] quality capture failed phone=${phone} score=${score}:`, err);
  }

  try {
    await applyNpsScoreActions(phone, tenantId, score);
  } catch (err) {
    console.error(`[nps] post-save actions failed phone=${phone} score=${score}:`, err);
  }
}

export function scheduleNps(
  phone: string,
  tenantId: string,
  sessionId: string,
  sendFn: (tenantId: string, phone: string, text: string) => Promise<void>,
): void {
  const DELAY_MS = 30 * 60 * 1000;
  const state: NpsPending = { sessionId, scheduledAt: new Date(), sent: false };
  pendingNps.set(phone, state);

  setTimeout(() => {
    void (async () => {
      const current = pendingNps.get(phone);
      if (!current || current.sessionId !== sessionId) return;

      try {
        const npsMessage = sanitizeOutgoingMessage(
          'Obrigada por falar com a SalesNet!\n\nComo você avalia o atendimento de hoje? Responda só com o número:\n1 - Muito ruim\n2 - Ruim\n3 - Regular\n4 - Bom\n5 - Excelente',
        );
        await sendFn(tenantId, phone, npsMessage);
        current.sent = true;
      } catch (err) {
        console.error('[nps] failed to send NPS question:', err);
        pendingNps.delete(phone);
      }
    })();
  }, DELAY_MS);
}
