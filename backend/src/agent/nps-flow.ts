import { supabase } from '../config/supabase';
import { getCustomerByPhone } from '../integrations/sgp/customers';
import { markChurnRiskByPhone } from './tools';
import { sanitizeOutgoingMessage } from '../utils/sanitize-outgoing';
import { excludePixFragments } from './sanitize';

type NpsPending = {
  sessionId: string;
  scheduledAt: Date;
  sent: boolean;
};

const pendingNps = new Map<string, NpsPending>();

const MS_24H = 24 * 60 * 60 * 1000;
const MS_48H = 48 * 60 * 60 * 1000;
const MS_72H = 72 * 60 * 60 * 1000;

const RECOVERY_MESSAGE =
  'Olá! Vimos que sua última experiência não foi boa. Quero entender o que aconteceu e resolver pra você. Pode me contar o que houve?';

const REFERRAL_NPS_MESSAGE =
  'Que ótimo que conseguimos te ajudar! 😊 Se conhecer alguém que precise de internet fibra, pode nos indicar — adoraríamos atender!';

const SCORE3_FOLLOWUP =
  'Olá! Vimos que sua experiência conosco foi regular 🤔 ' +
  'Tem algo que possamos melhorar? Sua opinião faz diferença pra gente!';

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
 *
 * Recebe SEMPRE `response_placeholder` (a versão com `{{PIX_xxxxxxxx}}`, a
 * mesma string que `saveMessage` grava em `conversation_threads`) — nunca
 * `interaction_logs.response`, que é o texto JÁ RESOLVIDO com o código PIX
 * real embutido. Ler o texto resolvido aqui reabriria exatamente o vazamento
 * que o PIX Token Vault existe para fechar: este few-shot é servido para
 * QUALQUER cliente do mesmo tenant/session_mode, não só para quem gerou a
 * conversa original (ver `buildQualityExamples` em skill/prompt-builder.ts).
 *
 * Mantém apenas sentenças com conteúdo real (sem emojis/asteriscos) e limita
 * o volume para não inchar o prompt depois.
 */
function extractKeyPhrases(responsePlaceholder: unknown): string[] {
  if (typeof responsePlaceholder !== 'string') return [];
  return responsePlaceholder
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 15 && s.length <= 200)
    .slice(0, 3);
}

/**
 * Liga o score do NPS à conversa que o gerou. Best-effort: nunca derruba o
 * fluxo de salvamento do NPS. Score <=2 vira exemplo 'bad', score 5 vira
 * exemplo 'good' — alimentando o feedback loop de qualidade.
 *
 * `key_phrases` passa por `excludePixFragments` como defesa em profundidade
 * — mesmo que `response_placeholder` viesse contaminado com PIX real por
 * algum caminho não previsto, nenhuma frase com cara de EMV chega a esta
 * tabela (ver sanitize.ts). Exportada para teste direto do comportamento.
 */
export async function captureConversationQuality(
  phone: string,
  tenantId: string,
  score: number,
  sessionId: string,
): Promise<void> {
  const { data: log } = await supabase
    .from('interaction_logs')
    .select('session_mode, tool_calls, response_placeholder')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!log) return;

  const entry = log as {
    session_mode: string | null;
    tool_calls: unknown;
    response_placeholder: unknown;
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
    key_phrases:            excludePixFragments(extractKeyPhrases(entry.response_placeholder)),
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
    let churnMarked = false;
    try {
      await markChurnRiskByPhone(phone, tenantId);
      churnMarked = true;
    } catch (err) {
      console.error('[nps] failed to mark churn risk:', err);
    }

    try {
      await scheduleMessage(phone, tenantId, RECOVERY_MESSAGE, MS_24H);
    } catch (err) {
      console.error('[nps] failed to schedule recovery message:', err);
      if (churnMarked) {
        console.error('[nps] ATTENTION: churn marked but recovery message not scheduled for', phone);
      }
    }
    return;
  }

  if (score === 3) {
    try {
      await scheduleMessage(phone, tenantId, SCORE3_FOLLOWUP, MS_72H);
    } catch (err) {
      console.error('[nps] failed to schedule score-3 followup:', err);
    }
    return;
  }

  let alreadySentReferral = true; // fail-safe: don't duplicate referral if DB fails
  try {
    const customer = await getCustomerByPhone(phone);
    alreadySentReferral = await hasReferralCampaign(customer.id);
  } catch (err) {
    console.error('[nps] hasReferralCampaign check failed, skipping referral:', err);
  }
  if (!alreadySentReferral) {
    await scheduleMessage(phone, tenantId, REFERRAL_NPS_MESSAGE, MS_48H);
  }
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
        // Auto-cleanup: if customer ignores NPS, allow future NPS after 2h
        setTimeout(() => {
          const latest = pendingNps.get(phone);
          if (latest?.sessionId === sessionId) pendingNps.delete(phone);
        }, 2 * 60 * 60 * 1000);
      } catch (err) {
        console.error('[nps] failed to send NPS question:', err);
        pendingNps.delete(phone);
      }
    })();
  }, DELAY_MS);
}
