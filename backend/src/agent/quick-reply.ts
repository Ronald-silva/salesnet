/**
 * Quick Reply — respostas diretas para perguntas de FAQ.
 *
 * Detecta intenções puramente informacionais e responde com dados
 * de company-data, sem acionar o LLM. O LLM só é chamado quando
 * a resposta exige raciocínio, contexto do cliente ou ação (tools).
 *
 * Retorna null quando a mensagem não é um FAQ simples, indicando
 * que o processador deve prosseguir para o fluxo LLM completo.
 */

import { PLANS, COVERED_NEIGHBORHOODS, BUSINESS_INFO } from './company-data';
import { getCustomerByPhone } from '../integrations/sgp/customers';
import { maskPhone } from '../lib/phone';

// ─── Intents ──────────────────────────────────────────────────────────────────

type Intent =
  | 'plans_list'
  | 'coverage_list'
  | 'coverage_check'
  | 'faq_installation'
  | 'faq_payment'
  | 'faq_support'
  | null;

/** Perguntas sobre agendamento/status — precisam de LLM + histórico, não FAQ fixo. */
const INSTALLATION_CONTEXT_RE =
  /minha\s+instala|instala.{0,30}(agendad|marcad|confirmad)|agendad|amanh[aã]|hoje|tarde|manh[aã]|quero\s+(?:a\s+)?instala|preciso\s+(?:da\s+)?instala/i;

/** Só FAQ genérico de taxa/prazo (sem intenção de agendar). */
const INSTALLATION_FAQ_RE =
  /(?:taxa|valor|quanto\s+custa).{0,25}instala|prazo.{0,20}instala|tempo\s+(?:de\s+)?instala|demora\s+(?:da\s+)?instala|quanto\s+tempo\s+demora/i;

export function messageAsksForPlans(message: string): boolean {
  const m = message.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (
    /planos?|precos?|valor|quanto custa|velocidade|mbps|mega|pacote|contratar|assinar|internet/.test(m) &&
    !/fatura|boleto|segunda via|vencimento|pagar minha|meu plano atual|meu contrato/.test(m)
  );
}

function detect(message: string): { intent: Intent; neighborhood?: string } {
  const m = message.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  if (messageAsksForPlans(message)) {
    return { intent: 'plans_list' };
  }

  if (/quais?\s+bairros?|lista.{0,15}bairros?|bairros?\s+atendid/i.test(m)) {
    return { intent: 'coverage_list' };
  }

  const coverageCheckMatch = m.match(
    /(?:voces?|salesnet|tem|cobre|cobertura|fibra).{0,30}(?:no|em|bairro)\s+([a-záàâãéèêíïóôõöúç\s]{3,}?)(?:\?|$|,)/i,
  );
  const neighborhood = coverageCheckMatch?.[1]?.trim();
  if (neighborhood && !/^(atend|atende|atendem|atendemos)$/i.test(neighborhood)) {
    return { intent: 'coverage_check', neighborhood };
  }

  if (
    /bairro|cobertura|regiao|minha.?area/i.test(m) ||
    /disponiv.{0,25}(bairro|area|regiao|cidade)|(?:bairro|area|regiao).{0,25}disponiv/i.test(m) ||
    /atend(e|em|emos|imento)/i.test(m)
  ) {
    return { intent: 'coverage_list' };
  }

  if (!INSTALLATION_CONTEXT_RE.test(m) && INSTALLATION_FAQ_RE.test(m)) {
    return { intent: 'faq_installation' };
  }

  if (/(?:forma|meio).{0,15}pagamento|como pag|pix|boleto/.test(m) &&
      !/fatura|segunda via/.test(m)) {
    return { intent: 'faq_payment' };
  }

  if (/suporte|atendimento|horario|whatsapp/.test(m)) {
    return { intent: 'faq_support' };
  }

  return { intent: null };
}

type ActiveQuickReplyIntent =
  | 'plans_list'
  | 'coverage_list'
  | 'coverage_check'
  | 'faq_installation'
  | 'faq_payment'
  | 'faq_support';

const ENABLED_QUICK_REPLY_INTENTS = new Set<ActiveQuickReplyIntent>([
  'plans_list',
  'coverage_list',
  'coverage_check',
  'faq_installation',
  'faq_payment',
  'faq_support',
]);

function isQuickReplyEnabled(intent: Intent): intent is ActiveQuickReplyIntent {
  return intent !== null && ENABLED_QUICK_REPLY_INTENTS.has(intent as ActiveQuickReplyIntent);
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatPlans(): string {
  const lines = PLANS.map((p) => {
    const tag = p.popular ? ' ← mais popular' : '';
    return `${p.name}: ${p.downloadMbps} Mbps / R$ ${p.priceMonthly}/mês${tag}`;
  });

  return (
    `Planos de fibra óptica da SalesNet em ${BUSINESS_INFO.city}:\n\n` +
    lines.join('\n') +
    `\n\nTodos incluem roteador e suporte ${BUSINESS_INFO.supportHours}.` +
    `\nTaxa de instalação: R$ ${BUSINESS_INFO.installationFee}.` +
    `\nCanais/filmes (opcional): R$ ${BUSINESS_INFO.tvAddonMonthly}/mês.` +
    `\n\nQual plano te interessa ou quer iniciar a contratação?`
  );
}

function formatCoverageList(): string {
  const list = COVERED_NEIGHBORHOODS.map((n) => `- ${n}`).join('\n');
  return (
    `Bairros com cobertura de fibra óptica da SalesNet em ${BUSINESS_INFO.city}:\n\n` +
    list +
    `\n\nEstamos em expansão! Se o seu bairro não está na lista, posso registrar seu interesse para quando chegarmos aí.`
  );
}

function formatCoverageCheck(neighborhood: string): string {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const covered = COVERED_NEIGHBORHOODS.find((n) => norm(n).includes(norm(neighborhood)));

  if (covered) {
    return (
      `Boa notícia! Atendemos o ${covered} com fibra óptica. 😊\n\n` +
      `Quer conhecer nossos planos ou já quer iniciar o contrato?`
    );
  }

  return (
    `Infelizmente ainda não temos cobertura no ${neighborhood}.\n\n` +
    `Mas estamos expandindo! Posso registrar seu interesse e avisamos quando a fibra chegar aí. Quer que eu faça isso?`
  );
}

function formatFaqPayment(): string {
  return (
    `Aceitamos PIX e boleto bancário.\n\n` +
    `PIX: gero o código aqui mesmo pra você — é só pedir.\n` +
    `Boleto: disponível se preferir, basta solicitar.\n\n` +
    `Prefere já gerar o PIX da fatura atual?`
  );
}

function formatFaqSupport(): string {
  return (
    `Atendimento Sofia: 24h via WhatsApp.\n` +
    `Equipe humana: segunda a sábado, 8h-12h e 14h-18h.\n\n` +
    `Como posso te ajudar agora?`
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Tenta responder a mensagem como FAQ direto.
 * Retorna a resposta formatada, ou null se o LLM precisar ser acionado.
 */
export async function quickReply(message: string, phone: string): Promise<string | null> {
  const { intent, neighborhood } = detect(message);
  console.log(
    `[quick-reply] phone=${maskPhone(phone)} intent=${intent ?? 'null'} neighborhood=${neighborhood ?? '-'}`,
  );

  if (!isQuickReplyEnabled(intent)) {
    if (intent) {
      console.log(`[quick-reply] intent=${intent} desabilitado temporariamente → LLM`);
    }
    return null;
  }

  switch (intent) {
    case 'plans_list': {
      // Cliente existente: passa para LLM (contexto do contrato atual)
      try {
        const customer = await getCustomerByPhone(phone);
        if (customer && !('error' in customer)) {
          console.log('[quick-reply] plans_list → cliente existente, passa para LLM');
          return null;
        }
      } catch {
        // best-effort — não localizar não é erro crítico
      }
      console.log('[quick-reply] plans_list → prospect, formatPlans()');
      return formatPlans();
    }

    case 'coverage_list':
      console.log('[quick-reply] coverage_list → formatCoverageList()');
      return formatCoverageList();

    case 'faq_installation':
      console.log('[quick-reply] faq_installation → installation FAQ');
      return (
        `A taxa de instalação é R$ ${BUSINESS_INFO.installationFee} e o prazo é de até ${BUSINESS_INFO.installationDaysMax} dias úteis ` +
        `após a assinatura do contrato. O roteador já está incluso no plano.`
      );

    case 'coverage_check': {
      if (!neighborhood) return null;
      console.log(`[quick-reply] coverage_check → ${neighborhood}`);
      return formatCoverageCheck(neighborhood);
    }

    case 'faq_payment':
      console.log('[quick-reply] faq_payment → formatFaqPayment()');
      return formatFaqPayment();

    case 'faq_support':
      console.log('[quick-reply] faq_support → formatFaqSupport()');
      return formatFaqSupport();

    default:
      return null;
  }
}
