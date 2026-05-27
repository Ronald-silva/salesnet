import { createHmac } from 'crypto';
import request from 'supertest';
import express from 'express';
import type { IncomingMessage } from 'http';

const mockEnv = {
  SGP_WEBHOOK_SECRET: undefined as string | undefined,
  DEFAULT_TENANT_ID: 'default',
};

jest.mock('../../config/env', () => ({
  env: mockEnv,
}));

jest.mock('../../integrations/sgp', () => ({
  reactivateCustomer: jest.fn(),
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));

import { paymentWebhookRouter } from '../../automations/payment-webhook';
import { reactivateCustomer } from '../../integrations/sgp';
import { whatsappService } from '../../services/whatsapp-service';

beforeEach(() => {
  jest.clearAllMocks();
  mockEnv.SGP_WEBHOOK_SECRET = undefined;
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

describe('POST /webhook/sgp/payment-confirmed', () => {
  it('reactivates customer and sends confirmation message', async () => {
    (reactivateCustomer as jest.Mock).mockResolvedValue({
      customerId: 'cust1',
      status: 'active',
      updatedAt: '2026-05-07T10:00:00Z',
    });
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send({ customerId: 'cust1', phone: '+5585999990001', amount: 70 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(reactivateCustomer).toHaveBeenCalledWith('cust1');
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      'default',
      '+5585999990001',
      expect.stringContaining('pagamento'),
    );
  });

  it('returns 400 when customerId or phone is missing', async () => {
    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send({ customerId: 'cust1' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(reactivateCustomer).not.toHaveBeenCalled();
  });

  it('returns 500 when reactivation fails', async () => {
    (reactivateCustomer as jest.Mock).mockRejectedValue(new Error('SGP timeout'));

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send({ customerId: 'cust2', phone: '+5585999990002', amount: 60 });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe('SGP timeout');
  });

  it('returns 401 when secret is set and signature is missing', async () => {
    mockEnv.SGP_WEBHOOK_SECRET = 'test-secret';
    const body = { customerId: 'cust1', phone: '+5585999990001', amount: 70 };

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send(body);

    expect(res.status).toBe(401);
    expect(reactivateCustomer).not.toHaveBeenCalled();
  });

  it('returns 401 when secret is set and signature is invalid', async () => {
    mockEnv.SGP_WEBHOOK_SECRET = 'test-secret';
    const body = { customerId: 'cust1', phone: '+5585999990001', amount: 70 };

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .set('x-sgp-signature', 'invalid')
      .send(body);

    expect(res.status).toBe(401);
    expect(reactivateCustomer).not.toHaveBeenCalled();
  });

  it('accepts request when secret is set and signature is valid', async () => {
    mockEnv.SGP_WEBHOOK_SECRET = 'test-secret';
    const body = { customerId: 'cust1', phone: '+5585999990001', amount: 70 };
    (reactivateCustomer as jest.Mock).mockResolvedValue({
      customerId: 'cust1',
      status: 'active',
      updatedAt: '2026-05-07T10:00:00Z',
    });
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .set('x-sgp-signature', signBody(body, 'test-secret'))
      .send(body);

    expect(res.status).toBe(200);
    expect(reactivateCustomer).toHaveBeenCalledWith('cust1');
  });

  it('returns 500 when sendText fails', async () => {
    (reactivateCustomer as jest.Mock).mockResolvedValue({
      customerId: 'cust3',
      status: 'active',
      updatedAt: '2026-05-07T10:00:00Z',
    });
    (whatsappService.sendText as jest.Mock).mockRejectedValue(new Error('WhatsApp unavailable'));

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send({ customerId: 'cust3', phone: '+5585999990003', amount: 70 });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
