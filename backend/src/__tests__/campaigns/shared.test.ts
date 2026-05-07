import { alreadySentCampaign, logCampaignSend } from '../../automations/campaigns/shared';

jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../config/supabase';

function mockChain(overrides: Record<string, jest.Mock> = {}) {
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

beforeEach(() => jest.clearAllMocks());

describe('alreadySentCampaign', () => {
  it('returns true when a send record exists within the window', async () => {
    mockChain({
      single: jest.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
    });
    expect(await alreadySentCampaign('c1', 'upsell', 30)).toBe(true);
  });

  it('returns false when no send record exists', async () => {
    mockChain({
      single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    });
    expect(await alreadySentCampaign('c1', 'upsell', 30)).toBe(false);
  });
});

describe('logCampaignSend', () => {
  it('inserts a row into campaign_sends', async () => {
    const chain = mockChain();
    await logCampaignSend('c1', 'upsell');
    expect(supabase.from).toHaveBeenCalledWith('campaign_sends');
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 'c1', type: 'upsell' })
    );
  });

  it('logs error on insert failure without throwing', async () => {
    mockChain({
      insert: jest.fn().mockResolvedValue({ error: { message: 'db error' } }),
    });
    await expect(logCampaignSend('c1', 'upsell')).resolves.not.toThrow();
  });
});
