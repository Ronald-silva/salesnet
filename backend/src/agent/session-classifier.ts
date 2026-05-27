export type SessionMode = 'billing' | 'support' | 'commercial' | 'prospect' | 'default';

const BILLING_RE =
  /\b(pagar?|pagamento|fatura|boleto|pix|vencimento|vencida?|corte?|cortou|cortad[oa]|suspens[oa]|suspendid[oa]|d[eé]bito|inadimplente)\b/i;

const SUPPORT_RE =
  /\b(lenta?|lentidão|lento|caiu|quedas?|sem\s+internet|sem\s+sinal|conectar?|n[aã]o\s+(abre|funciona)|roteador|instabilidade|t[eé]cnico|problema|falha|oscila[çc][aã]o|travando|trava|ping)\b/i;

const SPEED_COMPLAINT_RE =
  /\b(videochamada|streaming|netflix|youtube|zoom|bufferizando)\b/i;

const PROSPECT_RE =
  /\b(contratar?|assinar?|planos?|pre[çc]o|valor|quanto\s+custa|cobertura|atende|quero\s+internet|novo\s+cliente|instala[çc][aã]o|instalar?|fibra|pacote)\b/i;

const COMMERCIAL_PLAN_THRESHOLD_MBPS = 50;

interface CustomerLike {
  status?: string;
  plan?: { downloadMbps?: number };
}

export function classifySession(
  message: string,
  customer: CustomerLike | { error: string },
  invoiceStatus: string | undefined,
): SessionMode {
  // Customer not found in SGP — could be a prospect or wrong number
  if ('error' in customer) {
    return 'prospect';
  }

  const isSuspended = customer.status === 'suspended';
  const isOverdue = invoiceStatus === 'overdue';
  const isLowPlan = (customer.plan?.downloadMbps ?? 999) <= COMMERCIAL_PLAN_THRESHOLD_MBPS;

  if (isSuspended || isOverdue || BILLING_RE.test(message)) return 'billing';

  if (isLowPlan && SPEED_COMPLAINT_RE.test(message)) return 'commercial';

  if (SUPPORT_RE.test(message)) return 'support';

  if (PROSPECT_RE.test(message)) return 'prospect';

  return 'default';
}
