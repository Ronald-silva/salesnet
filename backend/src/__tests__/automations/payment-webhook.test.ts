import request from 'supertest';
import express from 'express';
import { paymentWebhookRouter } from '../../automations/payment-webhook';

jest.mock('../../integrations/sgp', () => ({
  reactivateCustomer: jest.fn(),
}));
jest.mock('../../integrations/twilio', () => ({
  sendMessage: jest.fn(),
}));

import { reactivateCustomer } from '../../integrations/sgp';
import { sendMessage } from '../../integrations/twilio';

beforeEach(() => {
  jest.clearAllMocks();
});

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/webhook/sgp', paymentWebhookRouter);
  return app;
}

describe('POST /webhook/sgp/payment-confirmed', () => {
  it('reactivates customer and sends confirmation message', async () => {
    (reactivateCustomer as jest.Mock).mockResolvedValue({
      customerId: 'cust1',
      status: 'active',
      updatedAt: '2026-05-07T10:00:00Z',
    });
    (sendMessage as jest.Mock).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send({ customerId: 'cust1', phone: '+5585999990001', amount: 70 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(reactivateCustomer).toHaveBeenCalledWith('cust1');
    expect(sendMessage).toHaveBeenCalledWith(
      '+5585999990001',
      expect.stringContaining('pagamento')
    );
  });

  it('returns 400 when customerId or phone is missing', async () => {
    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send({ customerId: 'cust1' });

    expect(res.status).toBe(400);
    expect(reactivateCustomer).not.toHaveBeenCalled();
  });

  it('returns 500 when reactivation fails', async () => {
    (reactivateCustomer as jest.Mock).mockRejectedValue(new Error('SGP timeout'));

    const res = await request(buildApp())
      .post('/webhook/sgp/payment-confirmed')
      .send({ customerId: 'cust2', phone: '+5585999990002', amount: 60 });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});
