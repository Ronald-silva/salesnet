jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../agent/visit-scheduling', () => ({
  ...jest.requireActual('../../agent/visit-scheduling'),
  isSlotAvailable: jest.fn().mockResolvedValue(true),
}));

import { supabase } from '../../config/supabase';
import { offerBringForward, handleBringForwardReply } from '../../agent/bring-forward-flow';

const TENANT_ID = 'tenant-x';

// Builder encadeável e thenable — mesmo padrão usado em visit-followup.test.ts,
// mas com `single`/`maybeSingle` resolvendo uma linha específica.
function chain(row: unknown): any {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    gte: jest.fn(() => obj),
    order: jest.fn(() => obj),
    limit: jest.fn(() => obj),
    update: jest.fn(() => obj),
    single: jest.fn().mockResolvedValue({ data: row, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
    then: (resolve: any, reject: any) =>
      Promise.resolve({ data: row, error: null }).then(resolve, reject),
  };
  return obj;
}

const visitRow = {
  id: 'v1',
  customer_id: 'c1',
  phone: '+5585999990001',
  visit_date: '2026-07-10',
  period: 'morning',
  status: 'scheduled',
  type: 'manutencao',
  bring_forward_status: null,
  bring_forward_offered_at: null,
};

beforeEach(() => jest.clearAllMocks());

describe('bring-forward-flow — tenant scoping', () => {
  it('scopes offerBringForward select and update by tenant_id', async () => {
    const builder = chain(visitRow);
    (supabase.from as jest.Mock).mockReturnValue(builder);

    await offerBringForward('v1', TENANT_ID);

    expect(builder.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
  });

  it('scopes the pending-offer lookup and the accepted-branch update by tenant_id', async () => {
    const offeredRow = { ...visitRow, bring_forward_status: 'offered' };
    const builder = chain(offeredRow);
    (supabase.from as jest.Mock).mockReturnValue(builder);

    await handleBringForwardReply('+5585999990001', 'sim', TENANT_ID);

    expect(builder.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
  });

  it('scopes the declined-branch update by tenant_id', async () => {
    const offeredRow = { ...visitRow, bring_forward_status: 'offered' };
    const builder = chain(offeredRow);
    (supabase.from as jest.Mock).mockReturnValue(builder);

    await handleBringForwardReply('+5585999990001', 'nao', TENANT_ID);

    expect(builder.eq).toHaveBeenCalledWith('tenant_id', TENANT_ID);
  });
});
