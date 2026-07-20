jest.mock('../../config/env', () => ({ env: { DEFAULT_TENANT_ID: 'salesnet-default' } }));
jest.mock('../../integrations/sgp/billing', () => ({
  hasOpenInvoice: jest.fn(),
}));
jest.mock('../../automations/billing-allowlist', () => ({
  resolveDueSoonCustomers: jest.fn(),
  isCpfSendAllowed: jest.fn(() => true),
  logSkippedOutsideAllowlist: jest.fn(),
}));
jest.mock('../../lib/billing-dispatch-jobs', () => ({
  getHabitualLatePayerContractIds: jest.fn(),
  createPendingJob: jest.fn(),
  markJobPaid: jest.fn(),
  buildIdempotencyKey: jest.fn((c, s, d) => `${c}:${s}:${d}`),
}));
jest.mock('../../services/billing-sender', () => ({ sendDispatchJob: jest.fn() }));

// Import and get mocked functions via require to avoid TypeScript issues
const { hasOpenInvoice } = require('../../integrations/sgp/billing');
const { resolveDueSoonCustomers, isCpfSendAllowed, logSkippedOutsideAllowlist } = require('../../automations/billing-allowlist');
const { getHabitualLatePayerContractIds, createPendingJob, markJobPaid } = require('../../lib/billing-dispatch-jobs');
const { sendDispatchJob } = require('../../services/billing-sender');
const { runBillingCadenceD5, runBillingCadenceD2 } = require('../../automations/billing-cadence');

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

  it('formats the amount with pt-BR comma decimal separator, not a dot', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 89.9, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j1' });
    hasOpenInvoice.mockResolvedValue(true);

    await runBillingCadenceD5();

    const [, , , msg] = sendDispatchJob.mock.calls[0]!;
    expect(msg).toContain('R$ 89,90');
    expect(msg).not.toContain('89.90');
  });
});

describe('runBillingCadenceD2', () => {
  it('habitual late payer: creates a pending job with stage d2_habitual, confirms invoice still open, sends with billingRecipientId, and message has urgency language', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-17', amount: 90, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j1' });
    hasOpenInvoice.mockResolvedValue(true);
    sendDispatchJob.mockResolvedValue({ status: 'sent', providerMessageId: 'wamid-1' });

    await runBillingCadenceD2();

    expect(createPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({ billingRecipientId: 'r1', contractId: 'c1', stage: 'd2_habitual' }),
    );
    expect(hasOpenInvoice).toHaveBeenCalledWith('c1');
    expect(sendDispatchJob).toHaveBeenCalledWith(
      'j1',
      'salesnet-default',
      '+5585999990001',
      expect.stringContaining('Evite juros e risco de suspensão'),
    );
  });

  it('non-habitual (regular) customer: creates a pending job with stage d2_regular and sends the softer reminder text', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set());
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-17', amount: 90, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j1' });
    hasOpenInvoice.mockResolvedValue(true);
    sendDispatchJob.mockResolvedValue({ status: 'sent', providerMessageId: 'wamid-1' });

    await runBillingCadenceD2();

    expect(createPendingJob).toHaveBeenCalledWith(
      expect.objectContaining({ billingRecipientId: 'r1', contractId: 'c1', stage: 'd2_regular' }),
    );
    expect(sendDispatchJob).toHaveBeenCalledWith(
      'j1',
      'salesnet-default',
      '+5585999990001',
      expect.stringContaining('Só um lembrete rápido'),
    );
  });

  it('skips when CPF is outside allowlist', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-17', amount: 90, document: '99999999999' },
    ]);
    isCpfSendAllowed.mockReturnValueOnce(false);

    await runBillingCadenceD2();

    expect(createPendingJob).not.toHaveBeenCalled();
    expect(sendDispatchJob).not.toHaveBeenCalled();
    expect(logSkippedOutsideAllowlist).toHaveBeenCalledWith('c1', '+5585999990001', 'd2_habitual');
  });

  it('marks the job paid and does NOT send when the invoice is no longer open', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-17', amount: 90, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j1' });
    hasOpenInvoice.mockResolvedValue(false);

    await runBillingCadenceD2();

    expect(markJobPaid).toHaveBeenCalledWith('j1');
    expect(sendDispatchJob).not.toHaveBeenCalled();
  });

  it('skips (no job, no send) when createPendingJob returns null — already scheduled today (idempotency)', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-07-17', amount: 90, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue(null);

    await runBillingCadenceD2();

    expect(hasOpenInvoice).not.toHaveBeenCalled();
    expect(sendDispatchJob).not.toHaveBeenCalled();
  });

  it('formats the amount with pt-BR comma decimal separator for both habitual and regular payers', async () => {
    getHabitualLatePayerContractIds.mockResolvedValue(new Set(['c1']));
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c1', recipientId: 'r1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 89.9, document: '12345678909' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j1' });
    hasOpenInvoice.mockResolvedValue(true);
    await runBillingCadenceD2();
    const [, , , habitualMsg] = sendDispatchJob.mock.calls[0]!;
    expect(habitualMsg).toContain('R$ 89,90');
    expect(habitualMsg).not.toContain('89.90');

    jest.clearAllMocks();
    isCpfSendAllowed.mockReturnValue(true);
    getHabitualLatePayerContractIds.mockResolvedValue(new Set());
    resolveDueSoonCustomers.mockResolvedValue([
      { customerId: 'c2', recipientId: 'r2', name: 'Maria', phone: '+5585999990002', dueDate: '2026-06-01', amount: 89.9, document: '98765432100' },
    ]);
    createPendingJob.mockResolvedValue({ id: 'j2' });
    hasOpenInvoice.mockResolvedValue(true);
    await runBillingCadenceD2();
    const [, , , regularMsg] = sendDispatchJob.mock.calls[0]!;
    expect(regularMsg).toContain('R$ 89,90');
    expect(regularMsg).not.toContain('89.90');
  });
});
