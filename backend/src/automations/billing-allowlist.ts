import { env } from '../config/env';
import { getBillingStatusForAllowlist } from '../integrations/sgp/billing';
import { getCustomersDueInDays, getOverdueCustomers } from '../integrations/sgp';
import { normalizeCpf } from '../lib/cpf';
import { maskPhone } from '../lib/phone';
import type { BillingStage, DueSoonCustomer, OverdueCustomer } from '../integrations/sgp/types';

/**
 * REMOVER ESTE GATE quando Ronald aprovar rollout pra base completa — decisão pendente,
 * não é permanente. Enquanto BILLING_ALLOWLIST_CPFS tiver CPFs, cobrança automática REAL
 * (fora de dry-run) só é enviada para eles; ver memória do projeto
 * (project_billing_allowlist_restriction) — nenhuma sessão futura deve remover o gate
 * `isCpfSendAllowed` sem pedido explícito do Ronald.
 *
 * Fonte: env var BILLING_ALLOWLIST_CPFS (string separada por vírgula, com ou sem
 * formatação — normalizada aqui). Ausente/vazia = allowlist inativa, mesmo
 * comportamento de antes com o array vazio: não trava o boot, só loga um aviso.
 */
function parseAllowlistFromEnv(raw: string | undefined): string[] {
  const cpfs = (raw ?? '')
    .split(',')
    .map((cpf) => normalizeCpf(cpf))
    .filter((cpf) => cpf.length > 0);

  if (cpfs.length === 0) {
    console.warn(
      '[billing:allowlist] BILLING_ALLOWLIST_CPFS não configurada (ou vazia) — allowlist inativa, cobrança automática real não está restrita a nenhum CPF específico.'
    );
  }

  return cpfs;
}

export const BILLING_SEND_ALLOWLIST: string[] = parseAllowlistFromEnv(env.BILLING_ALLOWLIST_CPFS);

function isAllowlistActive(): boolean {
  return BILLING_SEND_ALLOWLIST.length > 0;
}

/** Gate checked immediately before any real billing send — independent of source. */
export function isCpfSendAllowed(document: string | undefined): boolean {
  if (!isAllowlistActive()) return true;
  if (!document) return false;
  return BILLING_SEND_ALLOWLIST.includes(normalizeCpf(document));
}

export function logSkippedOutsideAllowlist(customerId: string, phone: string, type: string): void {
  console.warn(
    `[billing:allowlist] elegível mas fora da allowlist — customerId=${customerId} phone=${maskPhone(phone)} type=${type}`
  );
}

const DUE_SOON_STAGE: Partial<Record<number, BillingStage>> = { 5: 'd5', 2: 'd2', 0: 'd0' };
const OVERDUE_STAGE: Partial<Record<number, BillingStage>> = { 3: 'd3_overdue', 5: 'd5_overdue' };

/**
 * Drop-in replacement for getCustomersDueInDays: while the allowlist is active, resolves
 * ONLY the allowlisted CPFs via getBillingStatusForAllowlist (targeted lookup, no bulk
 * endpoint needed) and filters to the requested stage. Falls back to getCustomersDueInDays
 * (still a documented stub — see integrations/sgp/billing.ts) once the allowlist is emptied.
 */
export async function resolveDueSoonCustomers(days: number): Promise<DueSoonCustomer[]> {
  if (!isAllowlistActive()) return getCustomersDueInDays(days);

  const stage = DUE_SOON_STAGE[days];
  if (!stage) return [];

  const entries = await getBillingStatusForAllowlist(BILLING_SEND_ALLOWLIST);
  return entries
    .filter((e) => e.stage === stage)
    .map((e) => ({
      customerId: e.customerId,
      name:       e.name,
      phone:      e.phone,
      dueDate:    e.dueDate,
      amount:     e.amount,
      document:   e.document,
      pixCode:    e.pixCode,
    }));
}

/** Drop-in replacement for getOverdueCustomers — same targeted/allowlist logic as above. */
export async function resolveOverdueCustomers(daysOverdue: number): Promise<OverdueCustomer[]> {
  if (!isAllowlistActive()) return getOverdueCustomers(daysOverdue);

  const stage = OVERDUE_STAGE[daysOverdue];
  if (!stage) return [];

  const entries = await getBillingStatusForAllowlist(BILLING_SEND_ALLOWLIST);
  return entries
    .filter((e) => e.stage === stage)
    .map((e) => ({
      customerId: e.customerId,
      name:       e.name,
      phone:      e.phone,
      daysOverdue,
      amountDue:  e.amount,
      document:   e.document,
      pixCode:    e.pixCode,
    }));
}
