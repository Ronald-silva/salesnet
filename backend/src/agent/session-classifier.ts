import { PLANS } from './company-data';

export type SessionMode = 'billing' | 'support' | 'commercial' | 'prospect' | 'default';

const LOWEST_PLAN_DOWNLOAD_MBPS = Math.min(...PLANS.map((p) => p.downloadMbps));

const BILLING_RE =
  /\b(pagar?|pagamento|fatura|boleto|pix|vencimento|vencida?|corte?|cortou|cortad[oa]|suspens[oa]|suspendid[oa]|d[eé]bito|inadimplente)\b/i;

const SUPPORT_RE =
  /\b(lenta?|lentidão|lento|caiu|quedas?|sem\s+internet|sem\s+sinal|conectar?|n[aã]o\s+(abre|funciona)|roteador|instabilidade|t[eé]cnico|problema|falha|oscila[çc][aã]o|travando|trava|ping)\b/i;

const SPEED_COMPLAINT_RE =
  /\b(videochamada|streaming|netflix|youtube|zoom|bufferizando)\b/i;

const PROSPECT_STRONG_RE =
  /\b(contratar?|assinar?|quero\s+(contratar|instalar)|novo\s+cliente|instala[çc][aã]o|instalar?|primeira\s+instala[çc][aã]o)\b/i;

const EXISTING_CUSTOMER_CONTEXT_RE =
  /\b(meu|minha|sou\s+cliente|j[aá]\s*sou\s+cliente|meu\s+plano|minha\s+internet|minha\s+fatura|minha\s+conta)\b/i;

interface CustomerLike {
  status?: string;
  plan?: { downloadMbps?: number };
}

export function classifySession(
  message: string,
  customer: CustomerLike | { error: string },
  invoiceStatus: string | undefined,
): SessionMode {
  // Customer not found in SGP — default to neutral and let the LLM disambiguate intent.
  // We only mark as prospect on strong, explicit acquisition intent.
  if ('error' in customer) {
    return PROSPECT_STRONG_RE.test(message) ? 'prospect' : 'default';
  }

  const isSuspended = customer.status === 'suspended';
  const isOverdue = invoiceStatus === 'overdue';
  const downloadMbps = customer.plan?.downloadMbps;
  const isOnLowestTierPlan =
    downloadMbps != null && downloadMbps <= LOWEST_PLAN_DOWNLOAD_MBPS;

  if (isSuspended || isOverdue || BILLING_RE.test(message)) return 'billing';

  if (isOnLowestTierPlan && SPEED_COMPLAINT_RE.test(message)) return 'commercial';

  if (SUPPORT_RE.test(message)) return 'support';

  if (!EXISTING_CUSTOMER_CONTEXT_RE.test(message) && PROSPECT_STRONG_RE.test(message)) return 'prospect';

  return 'default';
}
