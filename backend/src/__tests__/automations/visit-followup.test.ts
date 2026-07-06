jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));
jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));

import { supabase } from '../../config/supabase';
import { whatsappService } from '../../services/whatsapp-service';
import { sendVisitReminders, sendVisitFollowups } from '../../automations/visit-followup';

beforeEach(() => jest.clearAllMocks());

// Builder thenable e encadeável — resolve independente de quantos .eq()/.lte()
// forem chamados antes do await, refletindo o filtro extra de tenant_id nas queries.
function chain(result: { data?: unknown; error: unknown }): any {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    lte: jest.fn(() => obj),
    update: jest.fn(() => chain({ error: null })),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

function mockVisits(rows: unknown[]) {
  const builder = chain({ data: rows, error: null });
  (supabase.from as jest.Mock).mockReturnValue(builder);
  return builder;
}

describe('sendVisitReminders', () => {
  it('sends reminder message for each scheduled visit today', async () => {
    mockVisits([
      { id: 'v1', phone: '+5585999990001', visit_date: '2026-05-23', period: 'morning' },
    ]);

    await sendVisitReminders();

    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('técnico')
    );
  });

  it('sends manhã for morning period', async () => {
    mockVisits([
      { id: 'v1', phone: '+5585999990001', visit_date: '2026-05-23', period: 'morning' },
    ]);

    await sendVisitReminders();

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('manhã')
    );
  });

  it('sends tarde for afternoon period', async () => {
    mockVisits([
      { id: 'v1', phone: '+5585999990001', visit_date: '2026-05-23', period: 'afternoon' },
    ]);

    await sendVisitReminders();

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('tarde')
    );
  });

  it('does nothing when no visits scheduled', async () => {
    mockVisits([]);
    await sendVisitReminders();
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('scopes the select and the reminder_sent update by tenant_id', async () => {
    const builder = mockVisits([
      { id: 'v1', phone: '+5585999990001', visit_date: '2026-05-23', period: 'morning' },
    ]);

    await sendVisitReminders();

    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 'default');
    expect(builder.update).toHaveBeenCalledWith({ reminder_sent: true });
    const updateResult = builder.update.mock.results[0].value;
    expect(updateResult.eq).toHaveBeenCalledWith('id', 'v1');
    expect(updateResult.eq).toHaveBeenCalledWith('tenant_id', 'default');
  });
});

describe('sendVisitFollowups', () => {
  it('sends followup message after visit date', async () => {
    mockVisits([
      { id: 'v1', phone: '+5585999990001', visit_date: '2026-05-22', period: 'afternoon' },
    ]);

    await sendVisitFollowups();

    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('resolvido')
    );
  });

  it('does nothing when no past visits', async () => {
    mockVisits([]);
    await sendVisitFollowups();
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('scopes the select and the followup_sent update by tenant_id', async () => {
    const builder = mockVisits([
      { id: 'v2', phone: '+5585999990002', visit_date: '2026-05-22', period: 'afternoon' },
    ]);

    await sendVisitFollowups();

    expect(builder.eq).toHaveBeenCalledWith('tenant_id', 'default');
    expect(builder.update).toHaveBeenCalledWith({ followup_sent: true });
    const updateResult = builder.update.mock.results[0].value;
    expect(updateResult.eq).toHaveBeenCalledWith('id', 'v2');
    expect(updateResult.eq).toHaveBeenCalledWith('tenant_id', 'default');
  });
});
