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

type OtpRow = { code: string; expires_at: string; attempts: number };

function mockSupabase(
  upsertResult = { error: null },
  singleResult: { data: OtpRow | null; error: unknown } = { data: null, error: { code: 'PGRST116' } }
) {
  const otpBuilder = {
    upsert: jest.fn().mockResolvedValue(upsertResult),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(singleResult),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
  };
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'otp_codes') {
      return otpBuilder;
    }
    if (table === 'client_sessions') {
      return { insert: jest.fn().mockResolvedValue({ error: null }) };
    }
    return {};
  });
  return otpBuilder;
}

function validOtpRow(overrides: Partial<OtpRow> = {}): OtpRow {
  return {
    code: '123456',
    expires_at: new Date(Date.now() + 60000).toISOString(),
    attempts: 0,
    ...overrides,
  };
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
  it('returns session token and deletes the OTP when code is valid', async () => {
    (getCustomerByPhone as jest.Mock).mockResolvedValue(mockCustomer);
    const otp = mockSupabase({ error: null }, { data: validOtpRow(), error: null });

    const res = await request(buildApp())
      .post('/api/auth/verify-otp')
      .send({ phone: '85999990001', code: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
    // OTP é de uso único — reuso do mesmo código deve ser impossível
    expect(otp.delete).toHaveBeenCalled();
  });

  it('returns 401 when OTP is wrong or expired', async () => {
    mockSupabase({ error: null }, { data: null, error: { code: 'PGRST116' } });

    const res = await request(buildApp())
      .post('/api/auth/verify-otp')
      .send({ phone: '85999990001', code: '000000' });

    expect(res.status).toBe(401);
  });

  describe('brute-force lockout (migration 035)', () => {
    it('increments attempts on a wrong code below the limit', async () => {
      const otp = mockSupabase({ error: null }, { data: validOtpRow({ attempts: 1 }), error: null });

      const res = await request(buildApp())
        .post('/api/auth/verify-otp')
        .send({ phone: '85999990001', code: '999999' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid code');
      expect(otp.update).toHaveBeenCalledWith({ attempts: 2 });
      expect(otp.delete).not.toHaveBeenCalled();
    });

    it('invalidates the OTP immediately on the 5th wrong attempt', async () => {
      const otp = mockSupabase({ error: null }, { data: validOtpRow({ attempts: 4 }), error: null });

      const res = await request(buildApp())
        .post('/api/auth/verify-otp')
        .send({ phone: '85999990001', code: '999999' });

      expect(res.status).toBe(401);
      expect(otp.update).toHaveBeenCalledWith({
        attempts: 5,
        expires_at: new Date(0).toISOString(),
      });
    });

    it('returns 429 when attempts already reached the limit, even with the correct code', async () => {
      const otp = mockSupabase({ error: null }, { data: validOtpRow({ attempts: 5 }), error: null });

      const res = await request(buildApp())
        .post('/api/auth/verify-otp')
        .send({ phone: '85999990001', code: '123456' });

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('too many attempts');
      expect(otp.update).not.toHaveBeenCalled();
      expect(otp.delete).not.toHaveBeenCalled();
      expect(getCustomerByPhone).not.toHaveBeenCalled();
    });

    it('request-otp resets attempts to 0 in the upsert', async () => {
      (getCustomerByPhone as jest.Mock).mockResolvedValue(mockCustomer);
      (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
      const otp = mockSupabase();

      const res = await request(buildApp())
        .post('/api/auth/request-otp')
        .send({ phone: '85999990001' });

      expect(res.status).toBe(200);
      expect(otp.upsert).toHaveBeenCalledWith(expect.objectContaining({ attempts: 0 }));
    });
  });

  it('returns 400 when phone or code is missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/verify-otp')
      .send({ phone: '85999990001' });

    expect(res.status).toBe(400);
  });
});
