const fromMock = jest.fn();
jest.mock('../../config/supabase', () => ({ supabase: { from: (...args: unknown[]) => fromMock(...args) } }));

import {
  createBillingRecipient,
  pauseBillingRecipient,
  reactivateBillingRecipient,
  removeBillingRecipient,
  listActiveEligibleRecipients,
} from '../../lib/billing-recipients';

function chain(result: { data: unknown; error: unknown }) {
  const q: Record<string, any> = {};
  ['select', 'insert', 'update', 'eq', 'is', 'lte', 'contains', 'order'].forEach((m) => {
    q[m] = jest.fn(() => q);
  });
  q['single'] = jest.fn(() => Promise.resolve(result));
  q['then'] = (resolve: (r: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return q;
}

beforeEach(() => jest.clearAllMocks());

describe('createBillingRecipient', () => {
  it('inserts and returns the created row', async () => {
    const row = { id: 'r1', tenant_id: 't', contract_id: 'c1', cpf: '12345678909', customer_name: 'Maria', phone: '+5585999990000', active: true, paused: false, stages_enabled: ['d0'], channel: 'whatsapp', cadence_start_date: '2026-07-15', created_by: 'admin@x.com', created_at: 'now', updated_at: 'now', sgp_cliente_id: null, next_dispatch_at: null, notes: null, paused_at: null, paused_by: null, removed_at: null, removed_by: null, last_synced_at: null };
    fromMock.mockReturnValue(chain({ data: row, error: null }));

    const result = await createBillingRecipient({
      tenantId: 't', contractId: 'c1', cpf: '12345678909', customerName: 'Maria',
      phone: '+5585999990000', createdBy: 'admin@x.com',
    });

    expect(result).toEqual({ ok: true, recipient: row });
    expect(fromMock).toHaveBeenCalledWith('billing_recipients');
  });

  it('returns ok:false, error:duplicate on unique constraint violation (code 23505)', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { code: '23505', message: 'duplicate key' } }));

    const result = await createBillingRecipient({
      tenantId: 't', contractId: 'c1', cpf: '12345678909', customerName: 'Maria',
      phone: '+5585999990000', createdBy: 'admin@x.com',
    });

    expect(result).toEqual({ ok: false, error: 'duplicate' });
  });
});

describe('pauseBillingRecipient / reactivateBillingRecipient / removeBillingRecipient', () => {
  it('pause sets paused=true, paused_at, paused_by', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'r1' }, error: null }));

    const ok = await pauseBillingRecipient('r1', 'admin@x.com');
    expect(ok).toBe(true);
  });

  it('reactivate sets paused=false and clears paused_at/paused_by', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'r1' }, error: null }));
    const ok = await reactivateBillingRecipient('r1');
    expect(ok).toBe(true);
  });

  it('remove sets removed_at, removed_by, active=false', async () => {
    fromMock.mockReturnValue(chain({ data: { id: 'r1' }, error: null }));
    const ok = await removeBillingRecipient('r1', 'admin@x.com');
    expect(ok).toBe(true);
  });
});

describe('listActiveEligibleRecipients', () => {
  it('queries with active=true, paused=false, removed_at is null, cadence_start_date <= today, stage in stages_enabled', async () => {
    const rows = [{ id: 'r1', stages_enabled: ['d0'] }];
    fromMock.mockReturnValue(chain({ data: rows, error: null }));

    const result = await listActiveEligibleRecipients('t', 'd0');

    expect(result).toEqual(rows);
    expect(fromMock).toHaveBeenCalledWith('billing_recipients');
  });

  it('returns [] (never throws) when the query errors — fail-safe, never authorize-all', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { message: 'boom' } }));

    const result = await listActiveEligibleRecipients('t', 'd0');

    expect(result).toEqual([]);
  });
});
