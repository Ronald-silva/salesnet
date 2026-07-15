jest.mock('../../config/env', () => ({ env: { DEFAULT_TENANT_ID: 'salesnet-default' } }));
jest.mock('../../integrations/sgp/billing', () => ({
  hasOpenInvoice: jest.fn(),
}));
jest.mock('../../integrations/sgp', () => ({
  suspendCustomer: jest.fn(),
}));
jest.mock('../../automations/billing-allowlist', () => ({
  resolveDueSoonCustomers: jest.fn(),
  resolveOverdueCustomers: jest.fn(),
  isCpfSendAllowed: jest.fn(() => true),
  logSkippedOutsideAllowlist: jest.fn(),
}));
jest.mock('../../lib/billing-dispatch-jobs', () => ({
  createPendingJob: jest.fn(),
  markJobPaid: jest.fn(),
  buildIdempotencyKey: jest.fn((c, s, d) => `${c}:${s}:${d}`),
}));
jest.mock('../../services/billing-sender', () => ({ sendDispatchJob: jest.fn() }));
jest.mock('../../templates', () => ({
  resolveTemplate: jest.fn((name, context) => `Template ${name} with ${JSON.stringify(context)}`),
}));

import * as sgpBilling from '../../integrations/sgp/billing';
import * as sgp from '../../integrations/sgp';
import * as billingAllowlist from '../../automations/billing-allowlist';
import * as dispatchJobs from '../../lib/billing-dispatch-jobs';
import * as billingSender from '../../services/billing-sender';
import * as templates from '../../templates';
import { runBillingJobD3, runBillingJobD0, runBillingJobOverdueD3, runBillingJobSuspendD5 } from '../../automations/billing-reminders';

beforeEach(() => jest.clearAllMocks());

describe('runBillingJobD3', () => {
  it('creates a pending job, confirms the invoice is still open, and sends', async () => {
    (billingAllowlist.resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '12345678909', pixCode: 'pix123' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue({ id: 'j1' });
    (sgpBilling.hasOpenInvoice as jest.Mock).mockResolvedValue(true);
    (billingSender.sendDispatchJob as jest.Mock).mockResolvedValue({ status: 'sent', providerMessageId: 'wamid-1' });

    await runBillingJobD3();

    expect(billingAllowlist.resolveDueSoonCustomers).toHaveBeenCalledWith(3);
    expect(dispatchJobs.createPendingJob).toHaveBeenCalledWith(expect.objectContaining({ contractId: 'c1', stage: 'd3' }));
    expect(sgpBilling.hasOpenInvoice).toHaveBeenCalledWith('c1');
    expect(billingSender.sendDispatchJob).toHaveBeenCalledWith('j1', 'salesnet-default', '+5585999990001', expect.any(String));
  });

  it('skips when createPendingJob returns null — already scheduled today (idempotency)', async () => {
    (billingAllowlist.resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '12345678909' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue(null);

    await runBillingJobD3();

    expect(sgpBilling.hasOpenInvoice).not.toHaveBeenCalled();
    expect(billingSender.sendDispatchJob).not.toHaveBeenCalled();
  });

  it('marks the job paid and does NOT send when the invoice is no longer open', async () => {
    (billingAllowlist.resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '12345678909' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue({ id: 'j1' });
    (sgpBilling.hasOpenInvoice as jest.Mock).mockResolvedValue(false);

    await runBillingJobD3();

    expect(dispatchJobs.markJobPaid).toHaveBeenCalledWith('j1');
    expect(billingSender.sendDispatchJob).not.toHaveBeenCalled();
  });

  it('skips when CPF is outside allowlist', async () => {
    (billingAllowlist.resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '99999999999' },
    ]);
    (billingAllowlist.isCpfSendAllowed as jest.Mock).mockReturnValueOnce(false);

    await runBillingJobD3();

    expect(dispatchJobs.createPendingJob).not.toHaveBeenCalled();
    expect(billingAllowlist.logSkippedOutsideAllowlist).toHaveBeenCalledWith('c1', '+5585999990001', 'd3');
  });
});

describe('runBillingJobD0', () => {
  it('creates a pending job, confirms the invoice is still open, and sends', async () => {
    (billingAllowlist.resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c2', recipientId: 'r2', name: 'João', phone: '+5585999990002', dueDate: '2026-07-20', amount: 100, document: '12345678910', pixCode: 'pix456' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue({ id: 'j2' });
    (sgpBilling.hasOpenInvoice as jest.Mock).mockResolvedValue(true);
    (billingSender.sendDispatchJob as jest.Mock).mockResolvedValue({ status: 'sent', providerMessageId: 'wamid-2' });

    await runBillingJobD0();

    expect(billingAllowlist.resolveDueSoonCustomers).toHaveBeenCalledWith(0);
    expect(dispatchJobs.createPendingJob).toHaveBeenCalledWith(expect.objectContaining({ contractId: 'c2', stage: 'd0' }));
    expect(billingSender.sendDispatchJob).toHaveBeenCalledWith('j2', 'salesnet-default', '+5585999990002', expect.any(String));
  });

  it('skips when createPendingJob returns null — already scheduled today (idempotency)', async () => {
    (billingAllowlist.resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c2', recipientId: 'r2', name: 'João', phone: '+5585999990002', dueDate: '2026-07-20', amount: 100, document: '12345678910' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue(null);

    await runBillingJobD0();

    expect(sgpBilling.hasOpenInvoice).not.toHaveBeenCalled();
    expect(billingSender.sendDispatchJob).not.toHaveBeenCalled();
  });
});

describe('runBillingJobOverdueD3', () => {
  it('creates a pending job, confirms the invoice is still open, and sends', async () => {
    (billingAllowlist.resolveOverdueCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c3', recipientId: 'r3', name: 'Ana', phone: '+5585999990003', amountDue: 150, document: '12345678911', pixCode: 'pix789' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue({ id: 'j3' });
    (sgpBilling.hasOpenInvoice as jest.Mock).mockResolvedValue(true);
    (billingSender.sendDispatchJob as jest.Mock).mockResolvedValue({ status: 'sent', providerMessageId: 'wamid-3' });

    await runBillingJobOverdueD3();

    expect(billingAllowlist.resolveOverdueCustomers).toHaveBeenCalledWith(3);
    expect(dispatchJobs.createPendingJob).toHaveBeenCalledWith(expect.objectContaining({ contractId: 'c3', stage: 'overdue_d3' }));
    expect(billingSender.sendDispatchJob).toHaveBeenCalledWith('j3', 'salesnet-default', '+5585999990003', expect.any(String));
  });

  it('skips when createPendingJob returns null — already scheduled today (idempotency)', async () => {
    (billingAllowlist.resolveOverdueCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c3', recipientId: 'r3', name: 'Ana', phone: '+5585999990003', amountDue: 150, document: '12345678911' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue(null);

    await runBillingJobOverdueD3();

    expect(sgpBilling.hasOpenInvoice).not.toHaveBeenCalled();
    expect(billingSender.sendDispatchJob).not.toHaveBeenCalled();
  });
});

describe('runBillingJobSuspendD5', () => {
  it('creates a pending job, confirms the invoice is still open, sends, and calls suspendCustomer', async () => {
    (billingAllowlist.resolveOverdueCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c4', recipientId: 'r4', name: 'Bruno', phone: '+5585999990004', amountDue: 200, document: '12345678912', pixCode: 'pixABC' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue({ id: 'j4' });
    (sgpBilling.hasOpenInvoice as jest.Mock).mockResolvedValue(true);
    (billingSender.sendDispatchJob as jest.Mock).mockResolvedValue({ status: 'sent', providerMessageId: 'wamid-4' });
    (sgp.suspendCustomer as jest.Mock).mockResolvedValue({ customerId: 'c4', status: 'suspended' });

    await runBillingJobSuspendD5();

    expect(billingAllowlist.resolveOverdueCustomers).toHaveBeenCalledWith(5);
    expect(dispatchJobs.createPendingJob).toHaveBeenCalledWith(expect.objectContaining({ contractId: 'c4', stage: 'suspended_d5' }));
    expect(billingSender.sendDispatchJob).toHaveBeenCalledWith('j4', 'salesnet-default', '+5585999990004', expect.any(String));
    expect(sgp.suspendCustomer).toHaveBeenCalledWith('c4');
  });

  it('skips when createPendingJob returns null — never calls suspendCustomer', async () => {
    (billingAllowlist.resolveOverdueCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c4', recipientId: 'r4', name: 'Bruno', phone: '+5585999990004', amountDue: 200, document: '12345678912' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue(null);

    await runBillingJobSuspendD5();

    expect(sgpBilling.hasOpenInvoice).not.toHaveBeenCalled();
    expect(billingSender.sendDispatchJob).not.toHaveBeenCalled();
    expect(sgp.suspendCustomer).not.toHaveBeenCalled();
  });

  it('marks the job paid and does NOT suspend when the invoice is no longer open', async () => {
    (billingAllowlist.resolveOverdueCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c4', recipientId: 'r4', name: 'Bruno', phone: '+5585999990004', amountDue: 200, document: '12345678912' },
    ]);
    (dispatchJobs.createPendingJob as jest.Mock).mockResolvedValue({ id: 'j4' });
    (sgpBilling.hasOpenInvoice as jest.Mock).mockResolvedValue(false);

    await runBillingJobSuspendD5();

    expect(dispatchJobs.markJobPaid).toHaveBeenCalledWith('j4');
    expect(billingSender.sendDispatchJob).not.toHaveBeenCalled();
    expect(sgp.suspendCustomer).not.toHaveBeenCalled();
  });

  it('skips when CPF is outside allowlist, never suspending', async () => {
    (billingAllowlist.resolveOverdueCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c4', recipientId: 'r4', name: 'Bruno', phone: '+5585999990004', amountDue: 200, document: '99999999999' },
    ]);
    (billingAllowlist.isCpfSendAllowed as jest.Mock).mockReturnValueOnce(false);

    await runBillingJobSuspendD5();

    expect(dispatchJobs.createPendingJob).not.toHaveBeenCalled();
    expect(billingSender.sendDispatchJob).not.toHaveBeenCalled();
    expect(sgp.suspendCustomer).not.toHaveBeenCalled();
    expect(billingAllowlist.logSkippedOutsideAllowlist).toHaveBeenCalledWith('c4', '+5585999990004', 'suspended_d5');
  });
});
