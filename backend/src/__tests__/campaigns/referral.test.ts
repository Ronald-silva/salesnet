import { runReferralCampaign } from '../../automations/campaigns/referral';

jest.mock('../../integrations/sgp', () => ({
  getCustomersByActivationDays: jest.fn(),
  getCustomerTickets: jest.fn(),
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));
jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));
jest.mock('../../automations/campaigns/shared', () => ({
  alreadySentCampaign: jest.fn(),
  logCampaignSend: jest.fn(),
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { getCustomersByActivationDays, getCustomerTickets } from '../../integrations/sgp';
import { whatsappService } from '../../services/whatsapp-service';
import { alreadySentCampaign, logCampaignSend } from '../../automations/campaigns/shared';
import { supabase } from '../../config/supabase';

function mockSupabaseChain(overrides: Record<string, jest.Mock> = {}) {
  const chain = {
    upsert: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
  (supabase.from as jest.Mock).mockReturnValue(chain);
  return chain;
}

beforeEach(() => jest.clearAllMocks());

const customer = {
  id: 'c1',
  name: 'Maria',
  phone: '+5585999990001',
  status: 'active',
};

describe('runReferralCampaign', () => {
  it('sends referral message and saves link for eligible customer', async () => {
    (getCustomersByActivationDays as jest.Mock).mockResolvedValue([customer]);
    (getCustomerTickets as jest.Mock).mockResolvedValue([]);
    (alreadySentCampaign as jest.Mock).mockResolvedValue(false);
    (logCampaignSend as jest.Mock).mockResolvedValue(undefined);
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
    const chain = mockSupabaseChain();

    await runReferralCampaign();

    expect(getCustomersByActivationDays).toHaveBeenCalledWith(30);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'c1' }),
      expect.objectContaining({ onConflict: 'customer_id' }),
    );
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      'default',
      customer.phone,
      expect.stringContaining('indicar'),
    );
    expect(logCampaignSend).toHaveBeenCalledWith('c1', 'referral');
  });

  it('skips customer already sent referral', async () => {
    (getCustomersByActivationDays as jest.Mock).mockResolvedValue([customer]);
    (alreadySentCampaign as jest.Mock).mockResolvedValue(true);

    await runReferralCampaign();

    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('skips customer with open tickets', async () => {
    (getCustomersByActivationDays as jest.Mock).mockResolvedValue([customer]);
    (alreadySentCampaign as jest.Mock).mockResolvedValue(false);
    (getCustomerTickets as jest.Mock).mockResolvedValue([
      { id: 't1', customerId: 'c1', type: 'technical', description: '', status: 'open', createdAt: '' },
    ]);

    await runReferralCampaign();

    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('generates deterministic referral code for the same customer_id', async () => {
    const { generateReferralCode } = await import('../../automations/campaigns/referral');
    const code1 = generateReferralCode('cust-abc');
    const code2 = generateReferralCode('cust-abc');
    expect(code1).toBe(code2);
    expect(code1).toHaveLength(8);
  });
});
