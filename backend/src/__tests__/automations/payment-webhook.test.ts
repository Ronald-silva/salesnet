import { createHash, createHmac } from 'crypto';
import request from 'supertest';
import express from 'express';
import type { IncomingMessage } from 'http';

const mockEnv = {
  SGP_WEBHOOK_SECRET: undefined as string | undefined,
  DEFAULT_TENANT_ID: 'default',
  ADMIN_ALERT_PHONE: undefined as string | undefined,
};

jest.mock('../../config/env', () => ({
  env: mockEnv,
}));

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { paymentWebhookRouter } from '../../automations/payment-webhook';
import { whatsappService } from '../../services/whatsapp-service';
import { supabase } from '../../config/supabase';

const DEFAULT_SECRET = 'test-secret';
const ADMIN_PHONE = '5585996032957';

const dedupInsert = jest.fn();

function mockDedup(result: { error: { code?: string; message?: string } | null } = { error: null }) {
  dedupInsert.mockResolvedValue(result);
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'processed_webhook_ids') {
      return { insert: dedupInsert };
    }
    return {};
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.SGP_WEBHOOK_SECRET = DEFAULT_SECRET;
  mockEnv.ADMIN_ALERT_PHONE = ADMIN_PHONE;
  (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);
  mockDedup();
});

function buildApp() {
  const app = express();
  app.use(express.json({
    verify: (req: IncomingMessage, _res, buf: Buffer) => {
      (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
    },
  }));
  app.use('/webhook/sgp', paymentWebhookRouter);
  return app;
}

function signBody(body: Record<string, unknown>, secret: string): string {
  const raw = Buffer.from(JSON.stringify(body));
  return createHmac('sha256', secret).update(raw).digest('hex');
}

function signedRequest(app: ReturnType<typeof buildApp>, body: Record<string, unknown>) {
  return request(app)
    .post('/webhook/sgp/payment-confirmed')
    .set('x-sgp-signature', signBody(body, DEFAULT_SECRET))
    .send(body);
}

const validBody = { customerId: 'cust1', phone: '+5585999990001', amount: 70 };

describe('POST /webhook/sgp/payment-confirmed — HMAC validation', () => {
  it('rejects everything when SGP_WEBHOOK_SECRET is not configured (fail-secure)', async () => {
    mockEnv.SGP_WEBHOOK_SECRET = undefined;

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .set('x-sgp-signature', signBody(validBody, DEFAULT_SECRET))
      .send(validBody);

    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('returns 401 when signature is missing', async () => {
    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send(validBody);

    expect(res.status).toBe(401);
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('returns 401 when signature is invalid', async () => {
    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .set('x-sgp-signature', 'invalid')
      .send(validBody);

    expect(res.status).toBe(401);
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('accepts the sha256= prefix on the signature header', async () => {
    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .set('x-sgp-signature', `sha256=${signBody(validBody, DEFAULT_SECRET)}`)
      .send(validBody);

    expect(res.status).toBe(200);
  });
});

describe('POST /webhook/sgp/payment-confirmed — replay protection', () => {
  it('records the raw-body fingerprint in processed_webhook_ids', async () => {
    const res = await signedRequest(buildApp(), validBody);

    expect(res.status).toBe(200);
    const expectedFingerprint = createHash('sha256')
      .update(Buffer.from(JSON.stringify(validBody)))
      .digest('hex');
    expect(dedupInsert).toHaveBeenCalledWith({ fingerprint: expectedFingerprint, source: 'sgp' });
  });

  it('returns 200 without reprocessing when the payload is a replay (23505)', async () => {
    mockDedup({ error: { code: '23505', message: 'duplicate key' } });

    const res = await signedRequest(buildApp(), validBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('continues processing when the dedup insert fails with a non-duplicate error (best-effort)', async () => {
    mockDedup({ error: { code: '42501', message: 'permission denied' } });

    const res = await signedRequest(buildApp(), validBody);

    expect(res.status).toBe(200);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      'default',
      validBody.phone,
      expect.stringContaining('pagamento'),
    );
  });
});

describe('POST /webhook/sgp/payment-confirmed — payment confirmation flow', () => {
  it('alerts the operator for manual reactivation and confirms to the client', async () => {
    const res = await signedRequest(buildApp(), validBody);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const calls = (whatsappService.sendText as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      'default',
      ADMIN_PHONE,
      expect.stringContaining('reativar manualmente'),
    ]);
    expect(calls[0][2]).toContain('cust1');
    expect(calls[1]).toEqual([
      'default',
      validBody.phone,
      expect.stringContaining('pagamento'),
    ]);
  });

  it('skips the admin alert when ADMIN_ALERT_PHONE is not configured', async () => {
    mockEnv.ADMIN_ALERT_PHONE = undefined;

    const res = await signedRequest(buildApp(), validBody);

    expect(res.status).toBe(200);
    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      'default',
      validBody.phone,
      expect.stringContaining('pagamento'),
    );
  });

  it('still confirms to the client when the admin alert fails (best-effort)', async () => {
    (whatsappService.sendText as jest.Mock)
      .mockRejectedValueOnce(new Error('admin unreachable'))
      .mockResolvedValueOnce(undefined);

    const res = await signedRequest(buildApp(), validBody);

    expect(res.status).toBe(200);
    expect(whatsappService.sendText).toHaveBeenCalledTimes(2);
  });

  it('formats the confirmed amount with pt-BR comma decimal separator, not a dot', async () => {
    const body = { customerId: 'cust1', phone: '+5585999990001', amount: 89.9 };

    const res = await signedRequest(buildApp(), body);

    expect(res.status).toBe(200);
    const calls = (whatsappService.sendText as jest.Mock).mock.calls;
    expect(calls[1][2]).toContain('R$ 89,90');
    expect(calls[1][2]).not.toContain('89.90');
  });

  it('returns 400 when customerId or phone is missing', async () => {
    const res = await signedRequest(buildApp(), { customerId: 'cust1' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('returns 500 when the client confirmation message fails', async () => {
    mockEnv.ADMIN_ALERT_PHONE = undefined;
    (whatsappService.sendText as jest.Mock).mockRejectedValue(new Error('WhatsApp unavailable'));

    const res = await signedRequest(buildApp(), validBody);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('payment confirmation failed');
  });
});
