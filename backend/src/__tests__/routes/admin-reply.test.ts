jest.mock('../../config/env', () => ({
  env: {
    DEFAULT_TENANT_ID: 'default',
    SGP_BASE_URL: 'https://example.com',
    SGP_API_TOKEN: 'x',
    SGP_APP_NAME: 'test',
    SUPABASE_URL: 'https://example.com',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    NODE_ENV: 'test',
  },
}));

jest.mock('../../middleware/adminAuth', () => ({
  adminAuthMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../../integrations/sgp', () => ({
  getCustomerByPhone: jest.fn(),
  getCustomerById: jest.fn(),
  getCurrentInvoice: jest.fn(),
  getCustomerByCpf: jest.fn(),
  generatePixKey: jest.fn(),
  redactSensitiveFields: jest.fn((v: unknown) => v),
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../integrations/whatsapp/provider-registry', () => ({
  providerRegistry: { get: jest.fn(), getForTenant: jest.fn() },
}));
jest.mock('../../integrations/whatsapp/providers/evolution-go', () => ({
  EvolutionGoProvider: jest.fn(),
}));
jest.mock('../../agent/skill', () => ({
  getSkillConfig: jest.fn(),
  clearSkillConfigCache: jest.fn(),
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import request from 'supertest';
import express from 'express';
import { adminRouter } from '../../routes/admin';
import { supabase } from '../../config/supabase';
import { whatsappService } from '../../services/whatsapp-service';

beforeEach(() => jest.clearAllMocks());

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
}

const thread = {
  id: 'thread1',
  phone: '+5585999990001',
  tenant_id: 'default',
  messages: [],
  human_mode: true,
  churn_risk: false,
  notes: null,
  cpf: null,
  status: 'active',
  starred: false,
  closed_at: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

function mockSupabase(opts: { lastLogId?: string | null; updateSpy?: jest.Mock } = {}) {
  const threadUpdate = jest.fn().mockReturnThis();
  const threadEq = jest.fn().mockReturnThis();
  const threadSingle = jest.fn().mockResolvedValue({ data: thread, error: null });

  const logUpdateEq = jest.fn().mockResolvedValue({ error: null });
  const logUpdate = opts.updateSpy ?? jest.fn().mockReturnValue({ eq: logUpdateEq });
  const logSelect = jest.fn().mockReturnThis();
  const logEq = jest.fn().mockReturnThis();
  const logOrder = jest.fn().mockReturnThis();
  const logLimit = jest.fn().mockReturnThis();
  const logMaybeSingle = jest.fn().mockResolvedValue({
    data: opts.lastLogId === undefined ? { id: 'log1' } : opts.lastLogId ? { id: opts.lastLogId } : null,
    error: null,
  });

  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'conversation_threads') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: threadEq,
        in: jest.fn().mockReturnThis(),
        single: threadSingle,
        update: threadUpdate,
      };
    }
    if (table === 'interaction_logs') {
      return {
        select: logSelect,
        eq: logEq,
        order: logOrder,
        limit: logLimit,
        maybeSingle: logMaybeSingle,
        update: logUpdate,
      };
    }
    return {};
  });

  return { logUpdate, logUpdateEq };
}

describe('POST /api/admin/conversations/:id/reply', () => {
  it('sends the message without touching interaction_logs when no copilot meta is sent', async () => {
    const { logUpdate } = mockSupabase();

    const res = await request(buildApp())
      .post('/api/admin/conversations/thread1/reply')
      .send({ message: 'Olá!' });

    expect(res.status).toBe(200);
    expect(whatsappService.sendText).toHaveBeenCalledWith('default', thread.phone, 'Olá!');
    expect(logUpdate).not.toHaveBeenCalled();
  });

  it('marks copilot_used on the most recent interaction_log when the suggestion is used as-is', async () => {
    const { logUpdate, logUpdateEq } = mockSupabase({ lastLogId: 'log42' });

    const res = await request(buildApp())
      .post('/api/admin/conversations/thread1/reply')
      .send({ message: 'Sua fatura vence dia 10.', copilot_used: true });

    expect(res.status).toBe(200);
    expect(logUpdate).toHaveBeenCalledWith({ copilot_used: true });
    expect(logUpdateEq).toHaveBeenCalledWith('id', 'log42');
  });

  it('marks copilot_edited when the operator edits the suggestion before sending', async () => {
    const { logUpdate } = mockSupabase({ lastLogId: 'log42' });

    const res = await request(buildApp())
      .post('/api/admin/conversations/thread1/reply')
      .send({ message: 'Editado pelo atendente.', copilot_edited: true });

    expect(res.status).toBe(200);
    expect(logUpdate).toHaveBeenCalledWith({ copilot_edited: true });
  });

  it('does not fail the request when there is no prior interaction_log for the phone', async () => {
    mockSupabase({ lastLogId: null });

    const res = await request(buildApp())
      .post('/api/admin/conversations/thread1/reply')
      .send({ message: 'Oi', copilot_used: true });

    expect(res.status).toBe(200);
  });
});
