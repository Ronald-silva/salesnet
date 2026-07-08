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
  suspendCustomer: jest.fn(),
}));

jest.mock('../../automations/billing-allowlist', () => ({
  resolveDueSoonCustomers: jest.fn(),
  resolveOverdueCustomers: jest.fn(),
  isCpfSendAllowed: jest.fn(),
  logSkippedOutsideAllowlist: jest.fn(),
}));

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: {
    sendTemplate: jest.fn(),
  },
}));

import { supabase } from '../../config/supabase';
import { suspendCustomer } from '../../integrations/sgp';
import {
  resolveDueSoonCustomers,
  resolveOverdueCustomers,
  isCpfSendAllowed,
  logSkippedOutsideAllowlist,
} from '../../automations/billing-allowlist';
import { whatsappService } from '../../services/whatsapp-service';

beforeEach(() => {
  jest.clearAllMocks();
  (isCpfSendAllowed as jest.Mock).mockReturnValue(true); // allowlist inactive by default in these tests
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
  it('sends template using the invoice pixCode already resolved (no PIX endpoint call)', async () => {
    const customers = [
      { customerId: 'c1', name: 'Maria', phone: '+5585999990001', dueDate: '2026-05-10', amount: 70, document: '12345678909', pixCode: 'pix123' },
    ];
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue(customers);
    const chain = mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobD3();

    expect(resolveDueSoonCustomers).toHaveBeenCalledWith(3);
    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0]!.phone,
      'billing_reminder_d3',
      expect.objectContaining({ nome: 'Maria', chave_pix: 'pix123' })
    );
    expect(chain.insert).toHaveBeenCalled();
  });

  it('sends with an empty chave_pix when the invoice has no cached codigopix (best-effort, never blocks the message)', async () => {
    const customers = [
      { customerId: 'c1b', name: 'Bruno', phone: '+5585999990010', dueDate: '2026-05-10', amount: 70, document: '12345678909' },
    ];
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobD3();

    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0]!.phone,
      'billing_reminder_d3',
      expect.objectContaining({ chave_pix: '' })
    );
  });

  it('skips customer already notified today', async () => {
    const customers = [
      { customerId: 'c2', name: 'João', phone: '+5585999990002', dueDate: '2026-05-10', amount: 60, document: '12345678909' },
    ];
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
    });

    await runBillingJobD3();

    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
  });

  it('skips and logs when the customer CPF is outside the send allowlist', async () => {
    const customers = [
      { customerId: 'c1c', name: 'Fora', phone: '+5585999990099', dueDate: '2026-05-10', amount: 70, document: '99999999999' },
    ];
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue(customers);
    (isCpfSendAllowed as jest.Mock).mockReturnValue(false);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobD3();

    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
    expect(logSkippedOutsideAllowlist).toHaveBeenCalledWith('c1c', '+5585999990099', 'd3');
  });
});

describe('runBillingJobD0', () => {
  it('sends d0 template for due-today customers not yet notified', async () => {
    const customers = [
      { customerId: 'c3', name: 'Ana', phone: '+5585999990003', dueDate: '2026-05-07', amount: 90, document: '12345678909', pixCode: 'pix456' },
    ];
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobD0();

    expect(resolveDueSoonCustomers).toHaveBeenCalledWith(0);
    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0]!.phone,
      'billing_reminder_d0',
      expect.objectContaining({ nome: 'Ana', chave_pix: 'pix456' })
    );
  });

  it('skips customer already notified today', async () => {
    const customers = [
      { customerId: 'c3', name: 'Ana', phone: '+5585999990003', dueDate: '2026-05-07', amount: 90, document: '12345678909' },
    ];
    (resolveDueSoonCustomers as jest.Mock).mockResolvedValue(customers);
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
      { customerId: 'c4', name: 'Pedro', phone: '+5585999990004', daysOverdue: 3, amountDue: 70, document: '12345678909', pixCode: 'pix789' },
    ];
    (resolveOverdueCustomers as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobOverdueD3();

    expect(resolveOverdueCustomers).toHaveBeenCalledWith(3);
    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0]!.phone,
      'billing_overdue_d3',
      expect.objectContaining({ nome: 'Pedro', chave_pix: 'pix789' })
    );
  });

  it('skips customer already notified today', async () => {
    const customers = [
      { customerId: 'c4', name: 'Pedro', phone: '+5585999990004', daysOverdue: 3, amountDue: 70, document: '12345678909' },
    ];
    (resolveOverdueCustomers as jest.Mock).mockResolvedValue(customers);
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
      { customerId: 'c5', name: 'Clara', phone: '+5585999990005', daysOverdue: 5, amountDue: 60, document: '12345678909', pixCode: 'pixABC' },
    ];
    (resolveOverdueCustomers as jest.Mock).mockResolvedValue(customers);
    const callOrder: string[] = [];
    (whatsappService.sendTemplate as jest.Mock).mockImplementation(async () => { callOrder.push('sendTemplate'); });
    (suspendCustomer as jest.Mock).mockImplementation(async () => { callOrder.push('suspendCustomer'); return { customerId: 'c5', status: 'suspended', updatedAt: '' }; });
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobSuspendD5();

    expect(resolveOverdueCustomers).toHaveBeenCalledWith(5);
    expect(whatsappService.sendTemplate).toHaveBeenCalledWith(
      expect.any(String),
      customers[0]!.phone,
      'billing_suspended_d5',
      expect.objectContaining({ nome: 'Clara' })
    );
    expect(suspendCustomer).toHaveBeenCalledWith('c5');
    expect(callOrder).toEqual(['sendTemplate', 'suspendCustomer']);
  });

  it('skips customer already notified today', async () => {
    const customers = [
      { customerId: 'c5', name: 'Clara', phone: '+5585999990005', daysOverdue: 5, amountDue: 60, document: '12345678909' },
    ];
    (resolveOverdueCustomers as jest.Mock).mockResolvedValue(customers);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'existing' }, error: null }),
    });

    await runBillingJobSuspendD5();

    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
    expect(suspendCustomer).not.toHaveBeenCalled();
  });

  it('skips and logs when the customer CPF is outside the send allowlist, never suspending', async () => {
    const customers = [
      { customerId: 'c5b', name: 'Fora', phone: '+5585999990098', daysOverdue: 5, amountDue: 60, document: '99999999999' },
    ];
    (resolveOverdueCustomers as jest.Mock).mockResolvedValue(customers);
    (isCpfSendAllowed as jest.Mock).mockReturnValue(false);
    mockSupabaseChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });

    await runBillingJobSuspendD5();

    expect(whatsappService.sendTemplate).not.toHaveBeenCalled();
    expect(suspendCustomer).not.toHaveBeenCalled();
    expect(logSkippedOutsideAllowlist).toHaveBeenCalledWith('c5b', '+5585999990098', 'suspended_d5');
  });
});
