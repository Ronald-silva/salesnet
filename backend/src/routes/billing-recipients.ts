import { Router, type Response } from 'express';
import { adminAuthMiddleware, type AdminRequest } from '../middleware/adminAuth';
import { env } from '../config/env';
import {
  createBillingRecipient,
  getBillingRecipientById,
  listBillingRecipients,
  pauseBillingRecipient,
  reactivateBillingRecipient,
  removeBillingRecipient,
  updateBillingRecipientConfig,
} from '../lib/billing-recipients';
import { createPendingJob, listJobsForRecipient } from '../lib/billing-dispatch-jobs';
import { sendDispatchJob } from '../services/billing-sender';
import { getCurrentInvoice, getCustomerByCpf, getCustomerById, getCustomerByPhone } from '../integrations/sgp';
import { normalizeCpf } from '../lib/cpf';
import { isValidBrazilWhatsAppDigits, normalizePhone } from '../lib/phone';
import type { Customer } from '../integrations/sgp/types';

export const billingRecipientsRouter = Router();
billingRecipientsRouter.use(adminAuthMiddleware);

const testSendLocks = new Map<string, number>();
const TEST_SEND_TTL_MS = 10_000;

function recipientIdFromParams(params: Record<string, string | string[]>): string {
  const id = params['id'];
  return Array.isArray(id) ? id[0] ?? '' : id ?? '';
}

billingRecipientsRouter.get('/', async (req, res) => {
  const status = (req.query.status as string) ?? 'active';
  const filter = (['active', 'paused', 'removed', 'all'] as const).includes(status as never)
    ? status as 'active' | 'paused' | 'removed' | 'all'
    : 'active';
  const data = await listBillingRecipients(env.DEFAULT_TENANT_ID, filter);
  res.status(200).json({ data });
});

billingRecipientsRouter.get('/lookup', async (req, res) => {
  const query = String(req.query.q ?? '').trim();
  if (!query) {
    res.status(400).json({ error: 'query param q is required' });
    return;
  }

  const digits = query.replace(/\D/g, '');
  const isFormattedCpf = /^\d{3}[.\-\s]\d{3}[.\-\s]\d{3}[-\s]?\d{2}$/.test(query);
  let customer: Customer | null = null;

  if (isFormattedCpf) {
    customer = await getCustomerByCpf(digits).catch(() => null);
  } else if (digits.length >= 10) {
    customer = await getCustomerByPhone(digits).catch(() => null);
    if (!customer && digits.length === 11) customer = await getCustomerByCpf(digits).catch(() => null);
  } else {
    customer = await getCustomerById(query).catch(() => null);
  }

  if (!customer) {
    res.status(404).json({ error: 'customer not found' });
    return;
  }

  const invoice = await getCurrentInvoice(customer.id).catch(() => null);
  const phoneDigits = customer.phone.replace(/\D/g, '');
  const whatsappDigits = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;

  res.status(200).json({
    contractId: customer.id,
    sgpClienteId: customer.sgpClienteId ?? null,
    cpf: customer.document ?? null,
    customerName: customer.name,
    phone: normalizePhone(customer.phone),
    phoneFormatValid: isValidBrazilWhatsAppDigits(whatsappDigits),
    financialStatus: invoice
      ? { hasOpenInvoice: invoice.status === 'open' || invoice.status === 'overdue', dueDate: invoice.dueDate, amount: invoice.amount }
      : null,
    source: 'sgp',
  });
});

billingRecipientsRouter.post('/', async (req: AdminRequest, res: Response) => {
  const body = req.body as {
    contractId?: string;
    sgpClienteId?: string;
    cpf?: string;
    customerName?: string;
    phone?: string;
    stagesEnabled?: string[];
    cadenceStartDate?: string;
    notes?: string;
  };

  if (!body.contractId || !body.cpf || !body.customerName || !body.phone) {
    res.status(400).json({ error: 'contractId, cpf, customerName, phone are required' });
    return;
  }

  const result = await createBillingRecipient({
    tenantId: env.DEFAULT_TENANT_ID,
    contractId: body.contractId,
    sgpClienteId: body.sgpClienteId,
    cpf: normalizeCpf(body.cpf),
    customerName: body.customerName,
    phone: normalizePhone(body.phone),
    stagesEnabled: body.stagesEnabled,
    cadenceStartDate: body.cadenceStartDate,
    notes: body.notes,
    createdBy: req.adminEmail ?? 'unknown',
  });

  if (!result.ok) {
    res.status(result.error === 'duplicate' ? 409 : 500).json({ error: result.error });
    return;
  }
  res.status(201).json({ data: result.recipient });
});

billingRecipientsRouter.patch('/:id', async (req: AdminRequest, res: Response) => {
  const id = recipientIdFromParams(req.params);
  const body = req.body as {
    paused?: boolean;
    stagesEnabled?: string[];
    notes?: string;
    cadenceStartDate?: string;
    channel?: string;
  };

  if (body.paused === true) {
    const ok = await pauseBillingRecipient(id, req.adminEmail ?? 'unknown');
    res.status(ok ? 200 : 500).json({ ok });
    return;
  }
  if (body.paused === false) {
    const ok = await reactivateBillingRecipient(id);
    res.status(ok ? 200 : 500).json({ ok });
    return;
  }

  const ok = await updateBillingRecipientConfig(id, {
    stagesEnabled: body.stagesEnabled,
    notes: body.notes,
    cadenceStartDate: body.cadenceStartDate,
    channel: body.channel,
  });
  res.status(ok ? 200 : 500).json({ ok });
});

billingRecipientsRouter.delete('/:id', async (req: AdminRequest, res: Response) => {
  const ok = await removeBillingRecipient(recipientIdFromParams(req.params), req.adminEmail ?? 'unknown');
  res.status(ok ? 200 : 500).json({ ok });
});

billingRecipientsRouter.get('/:id/history', async (req, res) => {
  const data = await listJobsForRecipient(recipientIdFromParams(req.params));
  res.status(200).json({ data });
});

billingRecipientsRouter.post('/:id/test-send', async (req: AdminRequest, res: Response) => {
  const body = req.body as { confirm?: boolean; message?: string };
  if (body.confirm !== true || !body.message) {
    res.status(400).json({ error: 'confirm:true and message are required' });
    return;
  }

  const id = recipientIdFromParams(req.params);
  const lastSend = testSendLocks.get(id);
  if (lastSend && Date.now() - lastSend < TEST_SEND_TTL_MS) {
    res.status(429).json({ error: 'test send already in progress for this recipient, try again in a few seconds' });
    return;
  }
  testSendLocks.set(id, Date.now());

  const recipient = await getBillingRecipientById(id);
  if (!recipient) {
    testSendLocks.delete(id);
    res.status(404).json({ error: 'recipient not found' });
    return;
  }

  const scheduledFor = new Date().toISOString().split('T')[0]!;
  const job = await createPendingJob({
    billingRecipientId: recipient.id,
    contractId: recipient.contract_id,
    stage: 'test',
    scheduledFor,
    phone: recipient.phone,
    idempotencyKey: `${recipient.contract_id}:test:${scheduledFor}:${Date.now()}`,
  });
  if (!job) {
    testSendLocks.delete(id);
    res.status(500).json({ error: 'failed to create test dispatch job' });
    return;
  }

  const outcome = await sendDispatchJob(job.id, env.DEFAULT_TENANT_ID, recipient.phone, body.message);
  res.status(200).json({ data: outcome });
});
