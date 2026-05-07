const mockFrom = jest.fn();

jest.mock('../../config/supabase', () => ({
  supabase: { from: mockFrom },
}));

import { getThread, saveMessage, isHumanMode, setHumanMode } from '../../agent/memory';

const PHONE = '+5585999990000';
const THREAD = {
  id: 'uuid-1',
  phone: PHONE,
  messages: [],
  human_mode: false,
  churn_risk: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('getThread', () => {
  it('returns existing thread when found', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: THREAD, error: null }),
        }),
      }),
    });

    const result = await getThread(PHONE);
    expect(result).toEqual(THREAD);
  });

  it('creates and returns new thread when not found', async () => {
    const newThread = { ...THREAD, id: 'uuid-2' };
    mockFrom
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      })
      .mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: newThread, error: null }),
          }),
        }),
      });

    const result = await getThread(PHONE);
    expect(result).toEqual(newThread);
  });
});

describe('saveMessage', () => {
  it('appends message to thread and updates DB', async () => {
    const mockUpdate = jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });

    mockFrom
      .mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({ data: THREAD, error: null }),
          }),
        }),
      })
      .mockReturnValueOnce({ update: mockUpdate });

    await saveMessage(PHONE, 'user', 'Olá!');

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
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: { human_mode: true }, error: null }),
        }),
      }),
    });

    expect(await isHumanMode(PHONE)).toBe(true);
  });

  it('returns false when thread does not exist', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    expect(await isHumanMode(PHONE)).toBe(false);
  });
});

describe('setHumanMode', () => {
  it('upserts human_mode on thread', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ upsert: mockUpsert });

    await setHumanMode(PHONE, true);

    expect(mockUpsert).toHaveBeenCalledWith(
      { phone: PHONE, human_mode: true },
      { onConflict: 'phone' },
    );
  });
});
