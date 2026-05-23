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

function mockVisits(rows: unknown[]) {
  (supabase.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    lte: jest.fn().mockResolvedValue({ data: rows, error: null }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  });
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
});
