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

// ─── Intents ──────────────────────────────────────────────────────────────────

type Intent =
  | 'plans_list'
  | 'coverage_list'
  | 'coverage_check'
  | 'faq_installation'
  | 'faq_payment'
  | 'faq_support'
  | null;

function detect(message: string): { intent: Intent; neighborhood?: string } {
  const m = message.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // Coverage check for a specific neighborhood
  const coverageCheckMatch = m.match(
    /(?:voces?|salesnet|tem|atend[e]?|cobre|cobertura|fibra).{0,30}(?:no|em|bairro)?\s+([a-záàâãéèêíïóôõöúç\s]+?)(?:\?|$|,| tem| atend)/i,
  );
  if (coverageCheckMatch?.[1]?.trim().length) {
    return { intent: 'coverage_check', neighborhood: coverageCheckMatch[1].trim() };
  }

  if (/bairro|cobertura|atend|regiao|disponiv|minha.?area/i.test(m)) {
    return { intent: 'coverage_list' };
  }

  if (/plano|preco|valor|quanto custa|velocidade|mbps|pacote|contratar|assinar|internet/.test(m) &&
      !/fatura|boleto|segunda via|vencimento|pagar minha|meu plano atual|meu contrato/.test(m)) {
    return { intent: 'plans_list' };
  }

  if (/instala|prazo|tempo de instala|demora/.test(m)) {
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

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatPlans(): string {
  const lines = PLANS.map((p) => {
    const tag = p.popular ? ' ← mais popular' : '';
    return `${p.name}: ${p.downloadMbps} Mbps / R$ ${p.priceMonthly}/mês${tag}`;
  });

  return (
    `Planos de fibra óptica da SalesNet em ${BUSINESS_INFO.city}:\n\n` +
    lines.join('\n') +
    `\n\nTodos incluem roteador, instalação gratuita e suporte ${BUSINESS_INFO.supportHours}.` +
    `\nDesconto de R$ ${BUSINESS_INFO.earlyPaymentDiscount} pagando até o vencimento.` +
    `\n\nQuer contratar ou tem alguma dúvida sobre os planos?`
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Tenta responder a mensagem como FAQ direto.
 * Retorna a resposta formatada, ou null se o LLM precisar ser acionado.
 */
export function quickReply(message: string): string | null {
  const { intent, neighborhood } = detect(message);

  switch (intent) {
    case 'plans_list':
      return formatPlans();

    case 'coverage_list':
      return formatCoverageList();

    case 'coverage_check':
      return neighborhood ? formatCoverageCheck(neighborhood) : formatCoverageList();

    case 'faq_installation':
      return (
        `A instalação da fibra é gratuita e o prazo é de até ${BUSINESS_INFO.installationDaysMax} dias úteis ` +
        `após a assinatura do contrato. O roteador já está incluso no plano.`
      );

    case 'faq_payment':
      return (
        `Aceitamos ${BUSINESS_INFO.paymentMethods.join(' e ')}. ` +
        `Tem desconto de R$ ${BUSINESS_INFO.earlyPaymentDiscount} para quem paga até a data de vencimento. ` +
        `O dia de vencimento é escolhido por você na hora do contrato.`
      );

    case 'faq_support':
      return `Nosso suporte é ${BUSINESS_INFO.supportHours}. É só mandar mensagem aqui pelo WhatsApp mesmo!`;

    default:
      return null;
  }
}
