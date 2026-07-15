import request from 'supertest';
import express from 'express';

jest.mock('../../middleware/adminAuth', () => ({
  adminAuthMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { adminEmail?: string }).adminEmail = 'admin@salesnet.test';
    next();
  },
}));

const listBillingRecipients = jest.fn();
const createBillingRecipient = jest.fn();
const pauseBillingRecipient = jest.fn();
const reactivateBillingRecipient = jest.fn();
const removeBillingRecipient = jest.fn();
const getBillingRecipientById = jest.fn();
jest.mock('../../lib/billing-recipients', () => ({
  listBillingRecipients: (...args: unknown[]) => listBillingRecipients(...args),
  createBillingRecipient: (...args: unknown[]) => createBillingRecipient(...args),
  pauseBillingRecipient: (...args: unknown[]) => pauseBillingRecipient(...args),
  reactivateBillingRecipient: (...args: unknown[]) => reactivateBillingRecipient(...args),
  removeBillingRecipient: (...args: unknown[]) => removeBillingRecipient(...args),
  getBillingRecipientById: (...args: unknown[]) => getBillingRecipientById(...args),
  updateBillingRecipientConfig: jest.fn(),
}));

const listJobsForRecipient = jest.fn();
const createPendingJob = jest.fn();
jest.mock('../../lib/billing-dispatch-jobs', () => ({
  listJobsForRecipient: (...args: unknown[]) => listJobsForRecipient(...args),
  createPendingJob: (...args: unknown[]) => createPendingJob(...args),
  buildIdempotencyKey: (contractId: string, stage: string, scheduledFor: string) => `${contractId}:${stage}:${scheduledFor}`,
}));

const sendDispatchJob = jest.fn();
jest.mock('../../services/billing-sender', () => ({
  sendDispatchJob: (...args: unknown[]) => sendDispatchJob(...args),
}));

jest.mock('../../integrations/sgp', () => ({
  getCustomerByCpf: jest.fn(),
  getCustomerByPhone: jest.fn(),
  getCustomerById: jest.fn(),
  getCurrentInvoice: jest.fn(),
}));

import { billingRecipientsRouter } from '../../routes/billing-recipients';

function buildApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/billing-recipients', billingRecipientsRouter);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/admin/billing-recipients', () => {
  it('lists active recipients by default', async () => {
    listBillingRecipients.mockResolvedValue([{ id: 'r1', cpf: '12345678909' }]);

    const response = await request(buildApp()).get('/api/admin/billing-recipients');

    expect(response.status).toBe(200);
    expect(listBillingRecipients).toHaveBeenCalledWith(expect.any(String), 'active');
  });
});

describe('POST /api/admin/billing-recipients', () => {
  it('creates with created_by from adminEmail and a normalized CPF', async () => {
    createBillingRecipient.mockResolvedValue({ ok: true, recipient: { id: 'r1' } });

    const response = await request(buildApp())
      .post('/api/admin/billing-recipients')
      .send({ contractId: 'c1', cpf: '123.456.789-09', customerName: 'Maria', phone: '+5585999990000' });

    expect(response.status).toBe(201);
    expect(createBillingRecipient).toHaveBeenCalledWith(expect.objectContaining({
      contractId: 'c1', cpf: '12345678909', createdBy: 'admin@salesnet.test',
    }));
  });

  it('returns 409 on duplicate', async () => {
    createBillingRecipient.mockResolvedValue({ ok: false, error: 'duplicate' });

    const response = await request(buildApp())
      .post('/api/admin/billing-recipients')
      .send({ contractId: 'c1', cpf: '12345678909', customerName: 'Maria', phone: '+5585999990000' });

    expect(response.status).toBe(409);
  });
});

describe('PATCH /api/admin/billing-recipients/:id', () => {
  it('pauses when body.paused=true', async () => {
    pauseBillingRecipient.mockResolvedValue(true);

    const response = await request(buildApp()).patch('/api/admin/billing-recipients/r1').send({ paused: true });

    expect(response.status).toBe(200);
    expect(pauseBillingRecipient).toHaveBeenCalledWith('r1', 'admin@salesnet.test');
  });

  it('reactivates when body.paused=false', async () => {
    reactivateBillingRecipient.mockResolvedValue(true);

    const response = await request(buildApp()).patch('/api/admin/billing-recipients/r1').send({ paused: false });

    expect(response.status).toBe(200);
    expect(reactivateBillingRecipient).toHaveBeenCalledWith('r1');
  });
});

describe('DELETE /api/admin/billing-recipients/:id', () => {
  it('removes with removed_by from adminEmail', async () => {
    removeBillingRecipient.mockResolvedValue(true);

    const response = await request(buildApp()).delete('/api/admin/billing-recipients/r1');

    expect(response.status).toBe(200);
    expect(removeBillingRecipient).toHaveBeenCalledWith('r1', 'admin@salesnet.test');
  });
});

describe('POST /api/admin/billing-recipients/:id/test-send', () => {
  it('requires confirm:true, rejecting otherwise', async () => {
    const response = await request(buildApp())
      .post('/api/admin/billing-recipients/r1/test-send')
      .send({ message: 'oi' });

    expect(response.status).toBe(400);
    expect(sendDispatchJob).not.toHaveBeenCalled();
  });

  it('sends once when confirm:true and blocks a second click within the TTL window', async () => {
    getBillingRecipientById.mockResolvedValue({ id: 'r1', contract_id: 'c1', phone: '+5585999990000' });
    createPendingJob.mockResolvedValue({ id: 'j1' });
    sendDispatchJob.mockResolvedValue({ status: 'sent', providerMessageId: 'wamid-1' });

    const app = buildApp();
    const first = await request(app).post('/api/admin/billing-recipients/r1/test-send').send({ confirm: true, message: 'teste' });
    const second = await request(app).post('/api/admin/billing-recipients/r1/test-send').send({ confirm: true, message: 'teste' });

    expect(first.status).toBe(200);
    expect(sendDispatchJob).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(429);
  });
});
