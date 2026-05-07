import { runUpsellCampaign } from '../../automations/campaigns/upsell';

jest.mock('../../integrations/sgp', () => ({
  getCustomersByPlan: jest.fn(),
  getCustomerTickets: jest.fn(),
}));
jest.mock('../../integrations/twilio', () => ({
  sendMessage: jest.fn(),
}));
jest.mock('../../automations/campaigns/shared', () => ({
  alreadySentCampaign: jest.fn(),
  logCampaignSend: jest.fn(),
}));

import { getCustomersByPlan, getCustomerTickets } from '../../integrations/sgp';
import { sendMessage } from '../../integrations/twilio';
import { alreadySentCampaign, logCampaignSend } from '../../automations/campaigns/shared';

beforeEach(() => jest.clearAllMocks());

const activatedAt61DaysAgo = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 61);
  return d.toISOString();
})();

const activatedAt30DaysAgo = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
})();

describe('runUpsellCampaign', () => {
  it('sends upsell message to eligible 20Mbps customer', async () => {
    const customer = {
      id: 'c1',
      name: 'Maria',
      phone: '+5585999990001',
      status: 'active',
      activatedAt: activatedAt61DaysAgo,
      plan: { id: 'p1', name: '20Mbps', downloadMbps: 20, uploadMbps: 10, monthlyPrice: 50 },
    };
    (getCustomersByPlan as jest.Mock)
      .mockResolvedValueOnce([customer])
      .mockResolvedValueOnce([]);
    (getCustomerTickets as jest.Mock).mockResolvedValue([]);
    (alreadySentCampaign as jest.Mock).mockResolvedValue(false);
    (logCampaignSend as jest.Mock).mockResolvedValue(undefined);
    (sendMessage as jest.Mock).mockResolvedValue(undefined);

    await runUpsellCampaign();

    expect(sendMessage).toHaveBeenCalledWith(
      customer.phone,
      expect.stringContaining('30Mbps')
    );
    expect(logCampaignSend).toHaveBeenCalledWith('c1', 'upsell');
  });

  it('skips customer activated less than 60 days ago', async () => {
    const customer = {
      id: 'c2',
      name: 'João',
      phone: '+5585999990002',
      status: 'active',
      activatedAt: activatedAt30DaysAgo,
      plan: { id: 'p1', name: '20Mbps', downloadMbps: 20, uploadMbps: 10, monthlyPrice: 50 },
    };
    (getCustomersByPlan as jest.Mock)
      .mockResolvedValueOnce([customer])
      .mockResolvedValueOnce([]);
    (alreadySentCampaign as jest.Mock).mockResolvedValue(false);

    await runUpsellCampaign();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('skips customer already sent upsell within 30 days', async () => {
    const customer = {
      id: 'c3',
      name: 'Ana',
      phone: '+5585999990003',
      status: 'active',
      activatedAt: activatedAt61DaysAgo,
      plan: { id: 'p1', name: '20Mbps', downloadMbps: 20, uploadMbps: 10, monthlyPrice: 50 },
    };
    (getCustomersByPlan as jest.Mock)
      .mockResolvedValueOnce([customer])
      .mockResolvedValueOnce([]);
    (alreadySentCampaign as jest.Mock).mockResolvedValue(true);

    await runUpsellCampaign();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('skips customer with open support tickets', async () => {
    const customer = {
      id: 'c4',
      name: 'Pedro',
      phone: '+5585999990004',
      status: 'active',
      activatedAt: activatedAt61DaysAgo,
      plan: { id: 'p1', name: '30Mbps', downloadMbps: 30, uploadMbps: 15, monthlyPrice: 60 },
    };
    (getCustomersByPlan as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([customer]);
    (alreadySentCampaign as jest.Mock).mockResolvedValue(false);
    (getCustomerTickets as jest.Mock).mockResolvedValue([
      { id: 't1', customerId: 'c4', type: 'technical', description: 'no signal', status: 'open', createdAt: '' },
    ]);

    await runUpsellCampaign();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
