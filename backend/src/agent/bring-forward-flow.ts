/**
 * Antecipação de visita (bring-forward).
 *
 * Cada turno tem 1 vaga (ver `visit-scheduling.ts`). Quando a equipe termina o
 * serviço cedo e abre folga, o operador clica em "Oferecer antecipação" no
 * painel → `offerBringForward` envia uma mensagem ao próximo cliente. Se ele
 * responder SIM dentro de 20 min, `handleBringForwardReply` antecipa a visita
 * pra hoje. Padrão NPS: o estado da oferta vive em colunas de `scheduled_visits`
 * (não em memória), então sobrevive a restart do backend.
 */

import { supabase } from '../config/supabase';
import { whatsappService } from '../services/whatsapp-service';
import {
  fortalezaToday,
  fortalezaCurrentPeriod,
  periodLabelPt,
  type VisitPeriod,
} from './visit-scheduling';

const OFFER_WINDOW_MS = 20 * 60 * 1000;

interface VisitRow {
  id: string;
  customer_id: string;
  phone: string;
  visit_date: string;
  period: VisitPeriod;
  status: string;
  type: string | null;
  bring_forward_status: string | null;
  bring_forward_offered_at: string | null;
}

const SELECT = 'id, customer_id, phone, visit_date, period, status, type, bring_forward_status, bring_forward_offered_at';

function typeLabel(type: string | null): string {
  return type === 'instalacao' ? 'instalação' : 'manutenção';
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const AFFIRMATIVE_RE =
  /^(sim|s|pode|pode ser|quero|aceito|aceita|bora|isso|claro|ok|okay|blz|beleza|positivo|com certeza|👍|🙏|👏)\b/;
const NEGATIVE_RE =
  /^(nao|n|negativo|prefiro nao|prefiro que nao|deixa|deixa pra|depois|outro dia|outra hora|mantem|manter|👎)\b/;

export function isAffirmative(message: string): boolean {
  return AFFIRMATIVE_RE.test(normalize(message));
}

export function isNegative(message: string): boolean {
  return NEGATIVE_RE.test(normalize(message));
}

/**
 * Dispara a oferta de antecipação (chamado pelo painel). Marca a oferta e envia
 * a mensagem ao cliente. Best-effort no envio: se o WhatsApp falhar, reverte.
 */
export async function offerBringForward(
  visitId: string,
  tenantId: string,
): Promise<{ ok: true; phone: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('scheduled_visits')
    .select(SELECT)
    .eq('id', visitId)
    .single();

  if (error || !data) return { ok: false, error: 'agendamento não encontrado' };
  const visit = data as VisitRow;

  if (visit.status !== 'scheduled') {
    return { ok: false, error: 'visita não está agendada (já concluída ou cancelada)' };
  }
  if (!visit.phone) {
    return { ok: false, error: 'agendamento sem telefone de contato' };
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('scheduled_visits')
    .update({ bring_forward_status: 'offered', bring_forward_offered_at: now, updated_at: now })
    .eq('id', visitId);
  if (updErr) return { ok: false, error: 'falha ao registrar oferta' };

  const message =
    `Oi! Aqui é a Sofia, da SalesNet. 😊\n\n` +
    `Nossa equipe técnica abriu uma janela e consegue adiantar a sua ${typeLabel(visit.type)} ainda hoje. ` +
    `Quer aproveitar? Responda SIM nos próximos 20 minutos que eu já encaixo pra você.\n\n` +
    `Se preferir manter o horário que já estava combinado, é só responder NÃO ou ignorar esta mensagem.`;

  try {
    await whatsappService.sendText(tenantId, visit.phone, message);
  } catch (err) {
    // Reverte a oferta se não conseguimos avisar o cliente.
    await supabase
      .from('scheduled_visits')
      .update({ bring_forward_status: 'none', bring_forward_offered_at: null })
      .eq('id', visitId);
    console.error('[bring-forward] failed to send offer:', err);
    return { ok: false, error: 'falha ao enviar mensagem ao cliente' };
  }

  return { ok: true, phone: visit.phone };
}

/** Busca uma oferta pendente (offered + dentro da janela de 20 min) pro telefone. */
async function getPendingOffer(phone: string): Promise<VisitRow | null> {
  const cutoff = new Date(Date.now() - OFFER_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from('scheduled_visits')
    .select(SELECT)
    .eq('phone', phone)
    .eq('bring_forward_status', 'offered')
    .gte('bring_forward_offered_at', cutoff)
    .order('bring_forward_offered_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as VisitRow | null) ?? null;
}

/**
 * Captura a resposta do cliente a uma oferta de antecipação.
 * @returns true se a mensagem foi consumida (processor deve encerrar).
 */
export async function handleBringForwardReply(
  phone: string,
  message: string,
  tenantId: string,
): Promise<boolean> {
  const offer = await getPendingOffer(phone);
  if (!offer) return false;

  if (isAffirmative(message)) {
    const today = fortalezaToday();
    const period = fortalezaCurrentPeriod();
    const now = new Date().toISOString();
    await supabase
      .from('scheduled_visits')
      .update({
        visit_date: today,
        period,
        bring_forward_status: 'accepted',
        reminder_sent: false,
        followup_sent: false,
        updated_at: now,
      })
      .eq('id', offer.id);

    await whatsappService.sendText(
      tenantId,
      phone,
      `Perfeito! ✅ Encaixei a sua ${typeLabel(offer.type)} pra hoje no período da ${periodLabelPt(period)}. ` +
        `A equipe vai entrar em contato antes de chegar. Qualquer coisa, é só me chamar!`,
    );
    return true;
  }

  if (isNegative(message)) {
    await supabase
      .from('scheduled_visits')
      .update({ bring_forward_status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', offer.id);

    await whatsappService.sendText(
      tenantId,
      phone,
      `Sem problema! 😊 Mantemos o horário que já estava combinado. Até lá!`,
    );
    return true;
  }

  // Resposta ambígua: deixa a oferta pendente (cliente pode responder SIM depois)
  // e segue o processamento normal da mensagem.
  return false;
}
