import { runChurnRiskCampaign } from '../../automations/campaigns/churn-risk';

jest.mock('../../integrations/sgp', () => ({
  getAllActiveCustomers: jest.fn(),
  getCustomerTickets: jest.fn(),
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));
jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../automations/campaigns/shared', () => ({
  alreadySentCampaign: jest.fn().mockResolvedValue(false),
  logCampaignSend: jest.fn().mockResolvedValue(undefined),
}));

import { getAllActiveCustomers, getCustomerTickets } from '../../integrations/sgp';
import { whatsappService } from '../../services/whatsapp-service';
import { supabase } from '../../config/supabase';

beforeEach(() => jest.clearAllMocks());

const baseCustomer = {
  id: 'c1',
  name: 'Maria',
  phone: '+5585999990001',
  status: 'active',
};

function ticketThisMonth(id: string, status = 'open', type = 'technical') {
  return {
    id,
    customerId: 'c1',
    type,
    description: 'issue',
    status,
    createdAt: new Date().toISOString(),
  };
}

function ticketDaysAgo(id: string, days: number, type = 'technical', status = 'open') {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return { id, customerId: 'c1', type, description: 'issue', status, createdAt: d.toISOString() };
}

function setupSupabaseMock(billingRows: { sent_at: string }[] = []) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'billing_notifications') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockResolvedValue({ data: billingRows, error: null }),
      };
    }
    return {
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
  });
}

describe('runChurnRiskCampaign', () => {
  it('flags and messages customer with 5+ open tickets this month (high risk)', async () => {
    (getAllActiveCustomers as jest.Mock).mockResolvedValue([baseCustomer]);
    (getCustomerTickets as jest.Mock).mockResolvedValue([
      ticketThisMonth('t1'),
      ticketThisMonth('t2'),
      ticketThisMonth('t3'),
      ticketThisMonth('t4'),
      ticketThisMonth('t5'),
    ]);
    setupSupabaseMock([]);

    await runChurnRiskCampaign();

    expect(supabase.from).toHaveBeenCalledWith('churn_risks');
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      'default',
      baseCustomer.phone,
      expect.stringContaining('técnico'),
    );
  });

  it('flags customer with cancellation ticket in last 7 days (high risk)', async () => {
    (getAllActiveCustomers as jest.Mock).mockResolvedValue([baseCustomer]);
    (getCustomerTickets as jest.Mock).mockResolvedValue([
      ticketDaysAgo('t1', 3, 'cancelamento'),
    ]);
    setupSupabaseMock([]);

    await runChurnRiskCampaign();

    expect(supabase.from).toHaveBeenCalledWith('churn_risks');
    expect(whatsappService.sendText).toHaveBeenCalled();
  });

  it('does not message customer with medium churn risk (3-4 tickets)', async () => {
    (getAllActiveCustomers as jest.Mock).mockResolvedValue([baseCustomer]);
    (getCustomerTickets as jest.Mock).mockResolvedValue([
      ticketThisMonth('t1'),
      ticketThisMonth('t2'),
      ticketThisMonth('t3'),
    ]);
    setupSupabaseMock([]);

    await runChurnRiskCampaign();

    expect(supabase.from).toHaveBeenCalledWith('churn_risks');
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('skips customer with no risk factors', async () => {
    (getAllActiveCustomers as jest.Mock).mockResolvedValue([baseCustomer]);
    (getCustomerTickets as jest.Mock).mockResolvedValue([]);
    setupSupabaseMock([]);

    await runChurnRiskCampaign();

    expect(supabase.from).not.toHaveBeenCalledWith('churn_risks');
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });
});
