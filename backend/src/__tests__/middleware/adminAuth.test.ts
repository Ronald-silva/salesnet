import express from 'express';
import request from 'supertest';
import { adminAuthMiddleware } from '../../middleware/adminAuth';
import { supabase } from '../../config/supabase';

jest.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
  },
}));

function buildApp() {
  const app = express();
  app.get('/admin-only', adminAuthMiddleware, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('adminAuthMiddleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('authorizes admin role from app_metadata', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'admin@example.com', app_metadata: { role: 'admin' } } },
      error: null,
    });

    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
  });

  it('does not authorize admin role from user_metadata', async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({
      data: { user: { id: 'u1', email: 'user@example.com', user_metadata: { role: 'admin' } } },
      error: null,
    });

    const res = await request(buildApp())
      .get('/admin-only')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'admin role required' });
  });
});
