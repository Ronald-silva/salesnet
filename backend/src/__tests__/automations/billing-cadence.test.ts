jest.mock('../../config/env', () => ({ env: { DEFAULT_TENANT_ID: 'salesnet-default' } }));
jest.mock('../../integrations/sgp/billing', () => ({
  getHabitualLatePayerContractIds: jest.fn(),
  hasOpenInvoice: jest.fn(),
}));
jest.mock('../../automations/billing-allowlist', () => ({
  resolveDueSoonCustomers: jest.fn(),
  isCpfSendAllowed: jest.fn(() => true),
  logSkippedOutsideAllowlist: jest.fn(),
}));
jest.mock('../../lib/billing-dispatch-jobs', () => ({
  createPendingJob: jest.fn(),
  markJobPaid: jest.fn(),
  buildIdempotencyKey: jest.fn((c, s, d) => `${c}:${s}:${d}`),
}));
jest.mock('../../services/billing-sender', () => ({ sendDispatchJob: jest.fn() }));

// Import and get mocked functions via require to avoid TypeScript issues
const { getHabitualLatePayerContractIds, hasOpenInvoice } = require('../../integrations/sgp/billing');
const { resolveDueSoonCustomers } = require('../../automations/billing-allowlist');
const { createPendingJob, markJobPaid } = require('../../lib/billing-dispatch-jobs');
const { sendDispatchJob } = require('../../services/billing-sender');
const { runBillingCadenceD5 } = require('../../automations/billing-cadence');

beforeEach(() => jest.clearAllMocks());

describe('runBillingCadenceD5', () => {
  it('creates a pending job, confirms the invoice is still open, and sends', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j1' });
    hasOpenInvoice.mockResolvedValue(true);
    sendDispatchJob.mockResolvedValue({ status: 'sent', providerMessageId: 'wamid-1' });

    await runBillingCadenceD5();

    expect(createPendingJob).toHaveBeenCalledWith(expect.objectContaining({ contractId: 'c1', stage: 'd5_habitual' }));
    expect(hasOpenInvoice).toHaveBeenCalledWith('c1');
    expect(sendDispatchJob).toHaveBeenCalledWith('j1', 'salesnet-default', '+5585999990001', expect.stringContaining('Maria'));
  });

  it('skips customers not classified as habitual late payers', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set());
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '12345678909' },
    ]);

    await runBillingCadenceD5();

    expect(createPendingJob).not.toHaveBeenCalled();
  });

  it('marks the job paid and does NOT send when the invoice is no longer open', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j1' });
    hasOpenInvoice.mockResolvedValue(false);

    await runBillingCadenceD5();

    expect(markJobPaid).toHaveBeenCalledWith('j1');
    expect(sendDispatchJob).not.toHaveBeenCalled();
  });

  it('skips (no job, no send) when createPendingJob returns null — already scheduled today (idempotency)', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue(null);

    await runBillingCadenceD5();

    expect(hasOpenInvoice).not.toHaveBeenCalled();
    expect(sendDispatchJob).not.toHaveBeenCalled();
  });

  it('does NOT send when hasOpenInvoice itself fails — never treats an SGP error as confirmed debt', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-20', amount: 90, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j1' });
    hasOpenInvoice.mockRejectedValue(new Error('SGP timeout'));

    await runBillingCadenceD5();

    expect(sendDispatchJob).not.toHaveBeenCalled();
  });
});
