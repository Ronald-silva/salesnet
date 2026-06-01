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

import request from 'supertest';
import express from 'express';
import { authRouter } from '../../routes/auth';

jest.mock('../../integrations/sgp', () => ({
  getCustomerByPhone: jest.fn(),
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { getCustomerByPhone } from '../../integrations/sgp';
import { whatsappService } from '../../services/whatsapp-service';
import { supabase } from '../../config/supabase';

beforeEach(() => jest.clearAllMocks());

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

function mockSupabase(
  upsertResult = { error: null },
  singleResult: { data: { code: string; expires_at: string } | null; error: unknown } = { data: null, error: { code: 'PGRST116' } }
) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'otp_codes') {
      return {
        upsert: jest.fn().mockResolvedValue(upsertResult),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue(singleResult),
      };
    }
    if (table === 'client_sessions') {
      return { insert: jest.fn().mockResolvedValue({ error: null }) };
    }
    return {};
  });
}

const mockCustomer = {
  id: 'cust1',
  name: 'Maria',
  phone: '+5585999990001',
  status: 'active',
  document: '123.456.789-00',
  address: { street: 'Rua A', number: '1', neighborhood: 'Jardim Guanabara', city: 'Fortaleza', state: 'CE', zipCode: '60000-000' },
};

describe('POST /api/auth/request-otp', () => {
  it('sends OTP to valid customer phone', async () => {
    (getCustomerByPhone as jest.Mock).mockResolvedValue(mockCustomer);
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
    mockSupabase();

    const res = await request(buildApp())
      .post('/api/auth/request-otp')
      .send({ phone: '85999990001' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('85999990001'),
      expect.stringContaining('código')
    );
  });

  it('returns 404 when phone not found in SGP', async () => {
    (getCustomerByPhone as jest.Mock).mockRejectedValue(new Error('not found'));

    const res = await request(buildApp())
      .post('/api/auth/request-otp')
      .send({ phone: '85000000000' });

    expect(res.status).toBe(404);
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('returns 400 when phone is missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/request-otp')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/verify-otp', () => {
  it('returns session token when OTP is valid', async () => {
    (getCustomerByPhone as jest.Mock).mockResolvedValue(mockCustomer);
    mockSupabase(
      { error: null },
      { data: { code: '123456', expires_at: new Date(Date.now() + 60000).toISOString() }, error: null }
    );

    const res = await request(buildApp())
      .post('/api/auth/verify-otp')
      .send({ phone: '85999990001', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 401 when OTP is wrong or expired', async () => {
    mockSupabase({ error: null }, { data: null, error: { code: 'PGRST116' } });

    const res = await request(buildApp())
      .post('/api/auth/verify-otp')
      .send({ phone: '85999990001', code: '000000' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when phone or code is missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/verify-otp')
      .send({ phone: '85999990001' });

    expect(res.status).toBe(400);
  });
});
