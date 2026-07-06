jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { supabase } from '../../config/supabase';
import { isSlotAvailable, nextAvailableSlots } from '../../agent/visit-scheduling';

// Builder encadeável e thenable — mesmo padrão usado em visit-followup.test.ts.
function chain(result: { data?: unknown; error: unknown }): any {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    gte: jest.fn(() => obj),
    lte: jest.fn(() => obj),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

function mockOccupancy(rows: unknown[]) {
  const builder = chain({ data: rows, error: null });
  (supabase.from as jest.Mock).mockReturnValue(builder);
  return builder;
}

beforeEach(() => jest.clearAllMocks());

describe('visit-scheduling — tenant scoping', () => {
  it('scopes isSlotAvailable occupancy query by tenant_id', async () => {
    const builder = mockOccupancy([]);

    await isSlotAvailable('2026-07-10', 'morning');

    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 'default');
  });

  it('scopes nextAvailableSlots occupancy query by tenant_id', async () => {
    const builder = mockOccupancy([]);

    await nextAvailableSlots('2026-07-10', 1, 3);

    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 'default');
  });
});
