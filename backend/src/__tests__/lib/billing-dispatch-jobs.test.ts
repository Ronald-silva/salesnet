const fromMock = jest.fn();
jest.mock('../../config/supabase', () => ({ supabase: { from: (...args: unknown[]) => fromMock(...args) } }));

import {
  buildIdempotencyKey,
  createPendingJob,
  markJobSent,
  markJobFailed,
  markJobPaid,
  getHabitualLatePayerContractIds,
} from '../../lib/billing-dispatch-jobs';

function chain(result: { data: unknown; error: unknown }): Record<string, jest.Mock> {
  const q: Record<string, jest.Mock> = {};
  ['select', 'insert', 'update', 'eq', 'in', 'gte', 'order'].forEach((m) => {
    q[m] = jest.fn(() => q as unknown) as jest.Mock;
  });
  q['single'] = jest.fn(() => Promise.resolve(result)) as jest.Mock;
  q['then'] = jest.fn((resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve)) as jest.Mock;
  return q;
}

beforeEach(() => jest.clearAllMocks());

describe('buildIdempotencyKey', () => {
  it('joins contract, stage, and date with colons', () => {
    expect(buildIdempotencyKey('c1', 'd0', '2026-07-15')).toBe('c1:d0:2026-07-15');
  });
});

describe('createPendingJob', () => {
  it('inserts a pending job and returns the row', async () => {
    const row = { id: 'j1', status: 'pending', idempotency_key: 'c1:d0:2026-07-15' };
    fromMock.mockReturnValue(chain({ data: row, error: null }));

    const result = await createPendingJob({
      billingRecipientId: 'r1', contractId: 'c1', stage: 'd0', scheduledFor: '2026-07-15', phone: '+5585999990000',
    });

    expect(result).toEqual(row);
  });

  it('returns null (not an error) on idempotency_key conflict — caller treats as already-scheduled', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { code: '23505' } }));

    const result = await createPendingJob({
      billingRecipientId: 'r1', contractId: 'c1', stage: 'd0', scheduledFor: '2026-07-15', phone: '+5585999990000',
    });

    expect(result).toBeNull();
  });
});

describe('markJobSent / markJobFailed / markJobPaid', () => {
  it('markJobSent updates status=sent, sent_at, message, provider_message_id', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: null }));
    await expect(markJobSent('j1', 'texto enviado', 'wamid-123')).resolves.toBeUndefined();
    expect(fromMock).toHaveBeenCalledWith('billing_dispatch_jobs');
  });

  it('markJobFailed updates status=failed, failed_at, error_message, increments attempt_count via caller-provided count', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: null }));
    await expect(markJobFailed('j1', 'timeout')).resolves.toBeUndefined();
  });

  it('markJobPaid updates status=paid without sending', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: null }));
    await expect(markJobPaid('j1')).resolves.toBeUndefined();
  });
});

describe('getHabitualLatePayerContractIds', () => {
  it('counts sent overdue_d3/suspended_d5 per contract and keeps only those >= minOverdueCount', async () => {
    fromMock.mockReturnValue(chain({
      data: [
        { contract_id: 'c1' }, { contract_id: 'c1' },
        { contract_id: 'c2' },
      ],
      error: null,
    }));

    const ids = await getHabitualLatePayerContractIds(2, 6);

    expect(ids.has('c1')).toBe(true);
    expect(ids.has('c2')).toBe(false);
  });

  it('returns an empty set (never throws) on query error', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));
    const ids = await getHabitualLatePayerContractIds();
    expect(ids.size).toBe(0);
  });
});
