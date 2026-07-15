import { hasOpenInvoice } from '../integrations/sgp/billing';
import { resolveDueSoonCustomers, isCpfSendAllowed, logSkippedOutsideAllowlist } from './billing-allowlist';
import { createPendingJob, markJobPaid, getHabitualLatePayerContractIds } from '../lib/billing-dispatch-jobs';
import { sendDispatchJob } from '../services/billing-sender';
import { env } from '../config/env';
import { titleCaseName } from '../lib/format';
import { pixLine } from '../templates/billing';

const today = () => new Date().toISOString().split('T')[0]!;

export async function runBillingCadenceD5(): Promise<void> {
  const [habituals, customers] = await Promise.all([
    getHabitualLatePayerContractIds(),
    resolveDueSoonCustomers(5),
  ]);

  for (const customer of customers) {
    if (!habituals.has(customer.customerId)) continue;
    if (!isCpfSendAllowed(customer.document)) {
      logSkippedOutsideAllowlist(customer.customerId, customer.phone, 'd5_habitual');
      continue;
    }

    const job = await createPendingJob({
      billingRecipientId: customer.recipientId,
      contractId: customer.customerId,
      stage: 'd5_habitual',
      scheduledFor: today(),
      phone: customer.phone,
    });
    if (!job) continue; // já agendado/enviado hoje (idempotência)

    try {
      const stillOpen = await hasOpenInvoice(customer.customerId);
      if (!stillOpen) {
        await markJobPaid(job.id);
        continue;
      }

      const fullName = titleCaseName(customer.name);
      const msg =
        `Olá, ${fullName}! 👋\n\nSua fatura de R$ ${customer.amount.toFixed(2)} vence em 5 dias (${customer.dueDate}).\n\n` +
        pixLine(customer.pixCode ?? '', '💳 Pague via PIX (copia e cola):') +
        `Qualquer dúvida, é só falar! 😊`;

      await sendDispatchJob(job.id, env.DEFAULT_TENANT_ID, customer.phone, msg);
    } catch (err) {
      console.error(`[billing-cadence:d5] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingCadenceD2(): Promise<void> {
  const [habituals, customers] = await Promise.all([
    getHabitualLatePayerContractIds(),
    resolveDueSoonCustomers(2),
  ]);

  for (const customer of customers) {
    const isHabitualLatePayer = habituals.has(customer.customerId);
    const stage = isHabitualLatePayer ? 'd2_habitual' : 'd2_regular';
    if (!isCpfSendAllowed(customer.document)) {
      logSkippedOutsideAllowlist(customer.customerId, customer.phone, stage);
      continue;
    }

    const job = await createPendingJob({
      billingRecipientId: customer.recipientId,
      contractId: customer.customerId,
      stage,
      scheduledFor: today(),
      phone: customer.phone,
    });
    if (!job) continue;

    try {
      const stillOpen = await hasOpenInvoice(customer.customerId);
      if (!stillOpen) {
        await markJobPaid(job.id);
        continue;
      }

      const fullName = titleCaseName(customer.name);
      const msg = isHabitualLatePayer
        ? `Olá, ${fullName}! ⚠️\n\nFaltam 2 dias para o vencimento da sua fatura de R$ ${customer.amount.toFixed(2)}. Evite juros e risco de suspensão futura pagando agora.\n\n` +
          pixLine(customer.pixCode ?? '', '💳 PIX copia e cola:') +
          `Qualquer dúvida, é só falar! 😊`
        : `Olá, ${fullName}! 👋\n\nSó um lembrete rápido: sua fatura de R$ ${customer.amount.toFixed(2)} vence em 2 dias.\n\n` +
          pixLine(customer.pixCode ?? '', '💳 PIX copia e cola:') +
          `Qualquer dúvida, é só falar! 😊`;

      await sendDispatchJob(job.id, env.DEFAULT_TENANT_ID, customer.phone, msg);
    } catch (err) {
      console.error(`[billing-cadence:d2] failed for ${customer.customerId}:`, err);
    }
  }
}
