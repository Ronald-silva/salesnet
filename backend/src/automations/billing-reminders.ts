import { env } from '../config/env';
import { hasOpenInvoice } from '../integrations/sgp/billing';
import { suspendCustomer } from '../integrations/sgp';
import { resolveDueSoonCustomers, resolveOverdueCustomers, isCpfSendAllowed, logSkippedOutsideAllowlist } from './billing-allowlist';
import { createPendingJob, markJobPaid } from '../lib/billing-dispatch-jobs';
import { sendDispatchJob } from '../services/billing-sender';
import { titleCaseName } from '../lib/format';
import { resolveTemplate } from '../templates';
import type { BillingTemplateName } from '../templates';

const today = () => new Date().toISOString().split('T')[0]!;

async function processStage(
  customers: Array<{ customerId: string; recipientId: string; name: string; phone: string; amount?: number; amountDue?: number; dueDate?: string; pixCode?: string; document?: string }>,
  stage: string,
  templateName: BillingTemplateName,
  onSuccess?: (customerId: string) => Promise<void>,
): Promise<void> {
  for (const customer of customers) {
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

      const valor = (customer.amount ?? customer.amountDue ?? 0).toFixed(2);
      const msg = resolveTemplate(templateName, {
        nome: titleCaseName(customer.name),
        valor,
        data_vencimento: customer.dueDate ?? '',
        chave_pix: customer.pixCode ?? '',
      });

      const outcome = await sendDispatchJob(job.id, env.DEFAULT_TENANT_ID, customer.phone, msg);
      if (outcome.status === 'sent' && onSuccess) await onSuccess(customer.customerId);
    } catch (err) {
      console.error(`[billing:${stage}] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingJobD3(): Promise<void> {
  const customers = await resolveDueSoonCustomers(3);
  await processStage(customers, 'd3', 'billing_reminder_d3');
}

export async function runBillingJobD0(): Promise<void> {
  const customers = await resolveDueSoonCustomers(0);
  await processStage(customers, 'd0', 'billing_reminder_d0');
}

export async function runBillingJobOverdueD3(): Promise<void> {
  const customers = await resolveOverdueCustomers(3);
  await processStage(customers, 'overdue_d3', 'billing_overdue_d3');
}

export async function runBillingJobSuspendD5(): Promise<void> {
  const customers = await resolveOverdueCustomers(5);
  await processStage(customers, 'suspended_d5', 'billing_suspended_d5', async (customerId) => {
    await suspendCustomer(customerId);
  });
}
