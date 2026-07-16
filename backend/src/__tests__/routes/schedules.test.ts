jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));
jest.mock('../../middleware/adminAuth', () => ({
  adminAuthMiddleware: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../../integrations/sgp', () => ({
  getCustomerByPhone: jest.fn().mockRejectedValue(new Error('not found')),
}));
jest.mock('../../agent/bring-forward-flow', () => ({
  offerBringForward: jest.fn().mockResolvedValue({ ok: true, phone: '+5585999990001' }),
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import request from 'supertest';
import express from 'express';
import { schedulesRouter } from '../../routes/schedules';
import { supabase } from '../../config/supabase';
import { offerBringForward } from '../../agent/bring-forward-flow';

// Builder encadeável e thenable — mesmo padrão usado em visit-followup.test.ts.
function chain(result: { data?: unknown; error: unknown; count?: number }): any {
  const obj: any = {
    select: jest.fn(() => obj),
    eq: jest.fn(() => obj),
    order: jest.fn(() => obj),
    range: jest.fn(() => obj),
    limit: jest.fn(() => obj),
    update: jest.fn(() => obj),
    single: jest.fn().mockResolvedValue(result),
    then: (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject),
  };
  return obj;
}

function mockVisits(result: { data?: unknown; error: unknown; count?: number }) {
  const builder = chain(result);
  (supabase.from as jest.Mock).mockReturnValue(builder);
  return builder;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/schedules', schedulesRouter);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/admin/schedules', () => {
  it('supports the legacy scheduled_visits schema without tenant_id', async () => {
    const builder = mockVisits({ data: [], error: null, count: 0 });

    const res = await request(buildApp()).get('/api/admin/schedules');

    expect(res.status).toBe(200);
    expect(builder.eq).not.toHaveBeenCalledWith('tenant_id', 'default');
  });
});

describe('GET /api/admin/schedules/today', () => {
  it('supports the legacy scheduled_visits schema without tenant_id', async () => {
    const builder = mockVisits({ data: [], error: null });

    const res = await request(buildApp()).get('/api/admin/schedules/today');

    expect(res.status).toBe(200);
    expect(builder.eq).not.toHaveBeenCalledWith('tenant_id', 'default');
  });
});

describe('PATCH /api/admin/schedules/:id', () => {
  it('updates a visit in the legacy scheduled_visits schema without tenant_id', async () => {
    const builder = mockVisits({ data: { id: 'v1' }, error: null });

    const res = await request(buildApp())
      .patch('/api/admin/schedules/v1')
      .send({ status: 'done' });

    expect(res.status).toBe(200);
    expect(builder.eq).not.toHaveBeenCalledWith('tenant_id', 'default');
  });
});

describe('PATCH /api/admin/schedules/:id/reschedule', () => {
  it('reschedules a visit in the legacy scheduled_visits schema without tenant_id', async () => {
    const builder = mockVisits({ data: { id: 'v1' }, error: null });

    const res = await request(buildApp())
      .patch('/api/admin/schedules/v1/reschedule')
      .send({ visit_date: '2026-07-15', period: 'afternoon' });

    expect(res.status).toBe(200);
    expect(builder.eq).not.toHaveBeenCalledWith('tenant_id', 'default');
  });
});

describe('DELETE /api/admin/schedules/:id', () => {
  it('cancels a visit in the legacy scheduled_visits schema without tenant_id', async () => {
    const builder = mockVisits({ data: { id: 'v1' }, error: null });

    const res = await request(buildApp()).delete('/api/admin/schedules/v1');

    expect(res.status).toBe(200);
    expect(builder.eq).not.toHaveBeenCalledWith('tenant_id', 'default');
  });
});

describe('POST /api/admin/schedules/:id/oferecer-antecipacao', () => {
  it('delegates to offerBringForward with the tenant id', async () => {
    const res = await request(buildApp()).post('/api/admin/schedules/v1/oferecer-antecipacao');

    expect(res.status).toBe(200);
    expect(offerBringForward).toHaveBeenCalledWith('v1', 'default');
  });
});
