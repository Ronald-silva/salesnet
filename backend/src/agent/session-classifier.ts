export type SessionMode = 'billing' | 'support' | 'commercial' | 'default';

const BILLING_RE =
  /\b(pagar?|pagamento|fatura|boleto|pix|vencimento|vencida?|corte?|cortou|cortad[oa]|suspens[oa]|suspendid[oa]|d[eé]bito|inadimplente)\b/i;

const SUPPORT_RE =
  /\b(lenta?|lentidão|lento|caiu|qu(e|a)da|sem\s+internet|sem\s+sinal|conectar?|n[aã]o\s+(abre|funciona)|roteador|instabilidade|t[eé]cnico|problema|falha|oscila[çc][aã]o|travando|trava|ping)\b/i;

const SPEED_COMPLAINT_RE =
  /\b(videochamada|streaming|netflix|youtube|zoom|bufferizando)\b/i;

interface CustomerLike {
  status?: string;
  plan?: { downloadMbps?: number };
}

export function classifySession(
  message: string,
  customer: CustomerLike | { error: string },
  invoiceStatus: string | undefined,
): SessionMode {
  if ('error' in customer) return 'default';

  const isSuspended = customer.status === 'suspended';
  const isOverdue = invoiceStatus === 'overdue';
  const isLowPlan = (customer.plan?.downloadMbps ?? 999) <= 30;

  if (isSuspended || isOverdue || BILLING_RE.test(message)) return 'billing';

  if (isLowPlan && SPEED_COMPLAINT_RE.test(message)) return 'commercial';

  if (SUPPORT_RE.test(message)) return 'support';

  return 'default';
}
