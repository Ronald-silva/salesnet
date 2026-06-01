jest.mock('../../config/env', () => ({
  env: {
    DEFAULT_TENANT_ID: 'default',
    SGP_BASE_URL: 'https://example.com',
    SGP_API_TOKEN: 'x',
    SGP_APP_NAME: 'test',
    SUPABASE_URL: 'https://example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    NODE_ENV: 'test',
  },
}));

import {
  alreadySentToday,
  logNotification,
  runBillingJobD3,
  runBillingJobD0,
  runBillingJobOverdueD3,
  runBillingJobSuspendD5,
} from '../../automations/billing-reminders';

jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../integrations/sgp', () => ({
  getCustomersDueInDays: jest.fn(),
  getOverdueCustomers: jest.fn(),
  suspendCustomer: jest.fn(),
  generatePixKey: jest.fn(),
  getCurrentInvoice: jest.fn(),
}));

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: {
    sendTemplate: jest.fn(),
  },
}));

import { supabase } from '../../config/supabase';
import { getCustomersDueInDays, getOverdueCustomers, suspendCustomer, generatePixKey, getCurrentInvoice } from '../../integrations/sgp';
import { whatsappService } from '../../services/whatsapp-service';

beforeEach(() => {
  jest.clearAllMocks();
});

function mockSupabaseChain(overrides: Record<string, jest.Mock> = {}) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue({ error: null }),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  (supabase.from as jest.Mock).mockReturnValue(chain);
  return chain;
}

describe('alreadySentToday', () => {
  it('returns true when a row exists for customer+type today', async () => {
    const chain = mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
    });
    const result = await alreadySentToday('cust1', 'd3');
    expect(result).toBe(true);
    expect(chain.eq).toHaveBeenCalledWith('customer_id', 'cust1');
    expect(chain.eq).toHaveBeenCalledWith('type', 'd3');
  });

  it('returns false when no row exists', async () => {
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });
    const result = await alreadySentToday('cust1', 'd3');
    expect(result).toBe(false);
  });
});

describe('logNotification', () => {
  it('inserts a row into billing_notifications', async () => {
    const chain = mockSupabaseChain();
    await logNotification('cust1', '+5585999999999', 'd3');
    expect(supabase.from).toHaveBeenCalledWith('billing_notifications');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'cust1', phone: '+5585999999999', type: 'd3' })
    );
  });
});

describe('runBillingJobD3', () => {
  it('sends template and logs for each due-soon customer', async () => {
    const customers = [
      { customerId: 'c1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-05-10', amount: 70 },
    ];
    (getCustomersDueInDays as jest.Mock).mockResolvedValue(customers);
    (getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', amount: 70, dueDate: '2026-05-10' });
    (generatePixKey as jest.Mock).mockResolvedValue({ pixKey: 'pix123', invoiceId: 'inv1' });
    const chain = mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobD3();

    expect(getCustomersDueInDays).toHaveBeenCalledWith(3);
    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0].phone,
      'billing_reminder_d3',
      expect.objectContaining({ nome: 'Maria' })
    );
    expect(chain.insert).toHaveBeenCalled();
  });

  it('skips customer already notified today', async () => {
    const customers = [
      { customerId: 'c2', name: 'João', phone: '+5585999990002', dueDate: '2026-05-10', amount: 60 },
    ];
    (getCustomersDueInDays as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
    });

    await runBillingJobD3();

    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
  });
});

describe('runBillingJobD0', () => {
  it('sends d0 template for due-today customers not yet notified', async () => {
    const customers = [
      { customerId: 'c3', name: 'Ana', phone: '+5585999990003', dueDate: '2026-05-07', amount: 90 },
    ];
    (getCustomersDueInDays as jest.Mock).mockResolvedValue(customers);
    (getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv3', amount: 90, dueDate: '2026-05-07' });
    (generatePixKey as jest.Mock).mockResolvedValue({ pixKey: 'pix456', invoiceId: 'inv3' });
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobD0();

    expect(getCustomersDueInDays).toHaveBeenCalledWith(0);
    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0].phone,
      'billing_reminder_d0',
      expect.objectContaining({ nome: 'Ana' })
    );
  });

  it('skips customer already notified today', async () => {
    const customers = [
      { customerId: 'c3', name: 'Ana', phone: '+5585999990003', dueDate: '2026-05-07', amount: 90 },
    ];
    (getCustomersDueInDays as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
    });

    await runBillingJobD0();

    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
  });
});

describe('runBillingJobOverdueD3', () => {
  it('sends overdue template for 3-day overdue customers', async () => {
    const customers = [
      { customerId: 'c4', name: 'Pedro', phone: '+5585999990004', daysOverdue: 3, amountDue: 70 },
    ];
    (getOverdueCustomers as jest.Mock).mockResolvedValue(customers);
    (getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv4', amount: 70, dueDate: '2026-05-04' });
    (generatePixKey as jest.Mock).mockResolvedValue({ pixKey: 'pix789', invoiceId: 'inv4' });
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobOverdueD3();

    expect(getOverdueCustomers).toHaveBeenCalledWith(3);
    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0].phone,
      'billing_overdue_d3',
      expect.objectContaining({ nome: 'Pedro' })
    );
  });

  it('skips customer already notified today', async () => {
    const customers = [
      { customerId: 'c4', name: 'Pedro', phone: '+5585999990004', daysOverdue: 3, amountDue: 70 },
    ];
    (getOverdueCustomers as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
    });

    await runBillingJobOverdueD3();

    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
  });
});

describe('runBillingJobSuspendD5', () => {
  it('sends suspension template then suspends customer after 5 days overdue', async () => {
    const customers = [
      { customerId: 'c5', name: 'Clara', phone: '+5585999990005', daysOverdue: 5, amountDue: 60 },
    ];
    (getOverdueCustomers as jest.Mock).mockResolvedValue(customers);
    (getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv5', amount: 60, dueDate: '2026-05-02' });
    (generatePixKey as jest.Mock).mockResolvedValue({ pixKey: 'pixABC', invoiceId: 'inv5' });
    const callOrder: string[] = [];
    (whatsappService.sendTemplate as jest.Mock).mockImplementation(async () => { callOrder.push('sendTemplate'); });
    (suspendCustomer as jest.Mock).mockImplementation(async () => { callOrder.push('suspendCustomer'); return { customerId: 'c5', status: 'suspended', updatedAt: '' }; });
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobSuspendD5();

    expect(getOverdueCustomers).toHaveBeenCalledWith(5);
    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0].phone,
      'billing_suspended_d5',
      expect.objectContaining({ nome: 'Clara' })
    );
    expect(suspendCustomer).toHaveBeenCalledWith('c5');
    expect(callOrder).toEqual(['sendTemplate', 'suspendCustomer']);
  });

  it('skips customer already notified today', async () => {
    const customers = [
      { customerId: 'c5', name: 'Clara', phone: '+5585999990005', daysOverdue: 5, amountDue: 60 },
    ];
    (getOverdueCustomers as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
    });

    await runBillingJobSuspendD5();

    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
    expect(suspendCustomer).not.toHaveBeenCalled();
  });
});
