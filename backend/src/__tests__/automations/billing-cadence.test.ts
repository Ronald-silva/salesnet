jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../integrations/sgp/billing', () => ({
  getHabitualLatePayerIds: jest.fn(),
}));

jest.mock('../../automations/billing-allowlist', () => ({
  resolveDueSoonCustomers: jest.fn(),
  isCpfSendAllowed: jest.fn(),
  logSkippedOutsideAllowlist: jest.fn(),
}));

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));

jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));

import { supabase } from '../../config/supabase';
import * as sgpBilling from '../../integrations/sgp/billing';
import { resolveDueSoonCustomers, isCpfSendAllowed, logSkippedOutsideAllowlist } from '../../automations/billing-allowlist';
import { whatsappService } from '../../services/whatsapp-service';
import { runBillingCadenceD5, runBillingCadenceD2 } from '../../automations/billing-cadence';

beforeEach(() => {
  jest.clearAllMocks();
  (isCpfSendAllowed as jest.Mock).mockReturnValue(true); // allowlist inactive by default in these tests
});

function mockHabituals(customerIds: string[]) {
  const habSet = new Set(customerIds);
  (sgpBilling.getHabitualLatePayerIds as jest.Mock).mockResolvedValue(habSet);

  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null }),
    insert: jest.fn().mockResolvedValue({ error: null }),
  });
}

describe('runBillingCadenceD5', () => {
  it('sends message only to habitual late payers', async () => {
    mockHabituals(['c1', 'c1']);

    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90, document: '12345678909', pixCode: '00020126abc' },
      { customerId: 'c2', name: 'Maria', phone: '+5585999990002', dueDate: '2026-06-01', amount: 70, document: '98765432100', pixCode: '00020126xyz' },
    ]);

    await runBillingCadenceD5();

    expect(resolveDueSoonCustomers).toHaveBeenCalledWith(5);
    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('João')
    );
  });

  it('includes PIX key in the message when present', async () => {
    mockHabituals(['c1', 'c1']);
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90, document: '12345678909', pixCode: '00020126abc' },
    ]);

    await runBillingCadenceD5();

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining('00020126abc')
    );
  });

  it('omits the PIX line when pixCode is missing (best-effort, never blocks the message)', async () => {
    mockHabituals(['c1', 'c1']);
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90, document: '12345678909' },
    ]);

    await runBillingCadenceD5();

    const [, , msg] = (whatsappService.sendText as jest.Mock).mock.calls[0]!;
    expect(msg).not.toMatch(/pix/i);
  });

  it('skips and logs when the customer CPF is outside the send allowlist', async () => {
    mockHabituals(['c1', 'c1']);
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'Fora', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90, document: '99999999999' },
    ]);
    (isCpfSendAllowed as jest.Mock).mockReturnValue(false);

    await runBillingCadenceD5();

    expect(whatsappService.sendText).not.toHaveBeenCalled();
    expect(logSkippedOutsideAllowlist).toHaveBeenCalledWith('c1', '+5585999990001', 'd5_habitual');
  });
});

describe('runBillingCadenceD2', () => {
  it('sends D-2 message mentioning 2 dias to habitual late payers', async () => {
    mockHabituals(['c1', 'c1']);
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90, document: '12345678909', pixCode: '00020126abc' },
    ]);

    await runBillingCadenceD2();

    expect(resolveDueSoonCustomers).toHaveBeenCalledWith(2);
    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('2 dias')
    );
  });

  it('sends reminder to non-habitual payers too (different message)', async () => {
    mockHabituals([]); // no habituals
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90, document: '12345678909', pixCode: '00020126abc' },
    ]);

    await runBillingCadenceD2();

    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('2 dias'),
    );
    expect(whatsappService.sendText).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining('suspensa'),
    );
  });

  it('skips and logs when the customer CPF is outside the send allowlist', async () => {
    mockHabituals([]);
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'Fora', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90, document: '99999999999' },
    ]);
    (isCpfSendAllowed as jest.Mock).mockReturnValue(false);

    await runBillingCadenceD2();

    expect(whatsappService.sendText).not.toHaveBeenCalled();
    expect(logSkippedOutsideAllowlist).toHaveBeenCalledWith('c1', '+5585999990001', 'd2_regular');
  });
});
