jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../integrations/sgp', () => ({
  getCustomersDueInDays: jest.fn(),
  getCurrentInvoice: jest.fn(),
  generatePixKey: jest.fn(),
}));

jest.mock('../../integrations/sgp/billing', () => ({
  getHabitualLatePayerIds: jest.fn(),
}));

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));

jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));

import { supabase } from '../../config/supabase';
import * as sgp from '../../integrations/sgp';
import * as sgpBilling from '../../integrations/sgp/billing';
import { whatsappService } from '../../services/whatsapp-service';
import { runBillingCadenceD5, runBillingCadenceD2 } from '../../automations/billing-cadence';

beforeEach(() => jest.clearAllMocks());

function mockHabituals(customerIds: string[]) {
  // Build habitual set from given ids
  const habSet = new Set(customerIds);
  (sgpBilling.getHabitualLatePayerIds as jest.Mock).mockResolvedValue(habSet);

  // Mock supabase for alreadySentCadence and logCadenceNotification calls
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
    // c1 appears twice (habitual), c2 does not appear
    mockHabituals(['c1', 'c1']);

    (sgp.getCustomersDueInDays as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90 },
      { customerId: 'c2', name: 'Maria', phone: '+5585999990002', dueDate: '2026-06-01', amount: 70 },
    ]);
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'open' });
    (sgp.generatePixKey as jest.Mock).mockResolvedValue({ pixKey: '00020126abc' });

    await runBillingCadenceD5();

    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('João')
    );
  });

  it('includes PIX key in the message', async () => {
    mockHabituals(['c1', 'c1']);
    (sgp.getCustomersDueInDays as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90 },
    ]);
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'open' });
    (sgp.generatePixKey as jest.Mock).mockResolvedValue({ pixKey: '00020126abc' });

    await runBillingCadenceD5();

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.stringContaining('00020126abc')
    );
  });
});

describe('runBillingCadenceD2', () => {
  it('sends D-2 message mentioning 2 dias to habitual late payers', async () => {
    mockHabituals(['c1', 'c1']);
    (sgp.getCustomersDueInDays as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João Silva', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90 },
    ]);
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'open' });
    (sgp.generatePixKey as jest.Mock).mockResolvedValue({ pixKey: '00020126abc' });

    await runBillingCadenceD2();

    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('2 dias')
    );
  });

  it('does not send to non-habitual payers', async () => {
    mockHabituals([]); // no habituals
    (sgp.getCustomersDueInDays as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90 },
    ]);

    await runBillingCadenceD2();

    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });
});
