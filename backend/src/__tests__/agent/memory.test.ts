const mockFrom = jest.fn();

jest.mock('../../config/supabase', () => ({
  supabase: { from: mockFrom },
}));

jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'salesnet-default' },
}));

import { getThread, saveMessage, isHumanMode, setHumanMode } from '../../agent/memory';

const PHONE = '+5585999990000';
const TENANT = 'salesnet-default';
const THREAD = {
  id: 'uuid-1',
  phone: PHONE,
  tenant_id: TENANT,
  messages: [],
  human_mode: false,
  churn_risk: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function selectChain(result: { data: unknown; error?: unknown }) {
  const chain: {
    eq: jest.Mock;
    maybeSingle: jest.Mock;
    single: jest.Mock;
  } = {
    eq: jest.fn(),
    maybeSingle: jest.fn().mockResolvedValue(result),
    single: jest.fn().mockResolvedValue(result),
  };
  chain.eq.mockReturnValue(chain);
  return { select: jest.fn().mockReturnValue(chain) };
}

describe('getThread', () => {
  it('returns existing thread when found', async () => {
    mockFrom.mockReturnValue(selectChain({ data: THREAD, error: null }));

    const result = await getThread(PHONE, TENANT);
    expect(result).toEqual(THREAD);
  });

  it('creates and returns new thread when not found', async () => {
    const newThread = { ...THREAD, id: 'uuid-2' };
    mockFrom
      .mockReturnValueOnce(selectChain({ data: null, error: null }))
      .mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: newThread, error: null }),
          }),
        }),
      });

    const result = await getThread(PHONE, TENANT);
    expect(result).toEqual(newThread);
  });
});

describe('saveMessage', () => {
  it('appends message to thread and updates DB', async () => {
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    });

    mockFrom
      .mockReturnValueOnce(selectChain({ data: THREAD, error: null }))
      .mockReturnValueOnce({ update: mockUpdate });

    await saveMessage(PHONE, 'user', 'Olá!', TENANT);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Olá!' }),
        ]),
      }),
    );
  });
});

describe('isHumanMode', () => {
  it('returns true when human_mode is true', async () => {
    mockFrom.mockReturnValue(selectChain({ data: { human_mode: true }, error: null }));

    expect(await isHumanMode(PHONE, TENANT)).toBe(true);
  });

  it('returns false when thread does not exist', async () => {
    mockFrom.mockReturnValue(selectChain({ data: null, error: null }));

    expect(await isHumanMode(PHONE, TENANT)).toBe(false);
  });
});

describe('setHumanMode', () => {
  it('upserts human_mode on thread scoped by tenant', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    await setHumanMode(PHONE, true, TENANT);

    expect(mockUpsert).toHaveBeenCalledWith(
      { phone: PHONE, tenant_id: TENANT, human_mode: true },
      { onConflict: 'tenant_id,phone' },
    );
  });
});
