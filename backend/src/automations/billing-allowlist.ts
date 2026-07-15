import { env } from '../config/env';
import { getBillingStatusForAllowlist } from '../integrations/sgp/billing';
import { listActiveEligibleRecipients } from '../lib/billing-recipients';
import { normalizeCpf } from '../lib/cpf';
import { maskPhone } from '../lib/phone';
import type { BillingStage, DueSoonCustomer, OverdueCustomer } from '../integrations/sgp/types';

/**
 * BILLING_ALLOWLIST_CPFS deixou de ser a fonte de autorização — billing_recipients
 * (administrável pelo painel) é a fonte agora (ver
 * docs/superpowers/specs/2026-07-15-billing-recipients-admin-design.md). A env var
 * sobrevive só como filtro ADICIONAL opcional (interseção): se setada, restringe ainda
 * mais quem recebe; vazia/ausente não amplia nada além do que billing_recipients já
 * define. Nunca remover sem pedido explícito do Ronald — mesma regra de antes.
 */
function parseAllowlistFromEnv(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((cpf) => normalizeCpf(cpf))
    .filter((cpf) => cpf.length > 0);
}

export const BILLING_SEND_ALLOWLIST: string[] = parseAllowlistFromEnv(env.BILLING_ALLOWLIST_CPFS);

function isExtraAllowlistActive(): boolean {
  return BILLING_SEND_ALLOWLIST.length > 0;
}

/** Filtro adicional opcional — true se a env var não estiver ativa OU o CPF estiver nela. */
export function isCpfSendAllowed(document: string | undefined): boolean {
  if (!isExtraAllowlistActive()) return true;
  if (!document) return false;
  return BILLING_SEND_ALLOWLIST.includes(normalizeCpf(document));
}

export function logSkippedOutsideAllowlist(customerId: string, phone: string, type: string): void {
  console.warn(
    `[billing:allowlist] elegível mas fora da allowlist — customerId=${customerId} phone=${maskPhone(phone)} type=${type}`,
  );
}

// Mapeamento explícito days -> { estágio SGP (classificação por janela), estágio de disparo (billing_recipients.stages_enabled) }.
// d5_habitual/d2_habitual/d2_regular são resolvidos separadamente pelas automations (Task 8) —
// aqui resolveDueSoonCustomers só sabe filtrar por estágio SGP bruto (d5/d3/d2/d0); a
// habitualidade é decidida em billing-cadence.ts, não aqui.
const DUE_SOON_SGP_STAGE: Partial<Record<number, BillingStage>> = { 5: 'd5', 3: 'd3', 2: 'd2', 0: 'd0' };
const DUE_SOON_DISPATCH_STAGE: Partial<Record<number, string>> = { 5: 'd5_habitual', 3: 'd3', 2: 'd2_habitual', 0: 'd0' };
const OVERDUE_SGP_STAGE: Partial<Record<number, BillingStage>> = { 3: 'd3_overdue', 5: 'd5_overdue' };
const OVERDUE_DISPATCH_STAGE: Partial<Record<number, string>> = { 3: 'overdue_d3', 5: 'suspended_d5' };

export async function resolveDueSoonCustomers(days: number): Promise<DueSoonCustomer[]> {
  const sgpStage = DUE_SOON_SGP_STAGE[days];
  const dispatchStage = DUE_SOON_DISPATCH_STAGE[days];
  if (!sgpStage || !dispatchStage) return [];

  const recipients = await listActiveEligibleRecipients(env.DEFAULT_TENANT_ID, dispatchStage);
  if (recipients.length === 0) return [];

  const cpfs = recipients.map((r) => r.cpf);
  const recipientByCpf = new Map(recipients.map((r) => [r.cpf, r.id]));
  const entries = await getBillingStatusForAllowlist(cpfs);

  return entries
    .filter((e) => e.stage === sgpStage)
    .map((e) => ({
      customerId: e.customerId,
      recipientId: recipientByCpf.get(e.document) ?? '',
      name: e.name,
      phone: e.phone,
      dueDate: e.dueDate,
      amount: e.amount,
      document: e.document,
      pixCode: e.pixCode,
    }));
}

export async function resolveOverdueCustomers(daysOverdue: number): Promise<OverdueCustomer[]> {
  const sgpStage = OVERDUE_SGP_STAGE[daysOverdue];
  const dispatchStage = OVERDUE_DISPATCH_STAGE[daysOverdue];
  if (!sgpStage || !dispatchStage) return [];

  const recipients = await listActiveEligibleRecipients(env.DEFAULT_TENANT_ID, dispatchStage);
  if (recipients.length === 0) return [];

  const cpfs = recipients.map((r) => r.cpf);
  const recipientByCpf = new Map(recipients.map((r) => [r.cpf, r.id]));
  const entries = await getBillingStatusForAllowlist(cpfs);

  return entries
    .filter((e) => e.stage === sgpStage)
    .map((e) => ({
      customerId: e.customerId,
      recipientId: recipientByCpf.get(e.document) ?? '',
      name: e.name,
      phone: e.phone,
      daysOverdue,
      amountDue: e.amount,
      document: e.document,
      pixCode: e.pixCode,
    }));
}
