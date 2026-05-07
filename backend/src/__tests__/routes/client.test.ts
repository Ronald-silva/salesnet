import request from 'supertest';
import express from 'express';
import { clientRouter } from '../../routes/client';

jest.mock('../../middleware/clientAuth', () => ({
  clientAuthMiddleware: (req: any, _res: any, next: any) => {
    req.customerId = 'cust1';
    req.customerPhone = '+5585999990001';
    next();
  },
}));
jest.mock('../../integrations/sgp', () => ({
  getCurrentInvoice: jest.fn(),
  generatePixKey: jest.fn(),
  getConnectionStatus: jest.fn(),
  getCustomerTickets: jest.fn(),
  openTicket: jest.fn(),
  getCustomerInvoices: jest.fn(),
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import {
  getCurrentInvoice,
  generatePixKey,
  getConnectionStatus,
  getCustomerTickets,
  openTicket,
  getCustomerInvoices,
} from '../../integrations/sgp';
import { supabase } from '../../config/supabase';

beforeEach(() => jest.clearAllMocks());

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/client', clientRouter);
  return app;
}

describe('GET /api/client/invoice', () => {
  it('returns invoice with pix key', async () => {
    (getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', customerId: 'cust1', amount: 70, dueDate: '2026-05-10', status: 'open' });
    (generatePixKey as jest.Mock).mockResolvedValue({ pixKey: 'pix123', invoiceId: 'inv1' });

    const res = await request(buildApp()).get('/api/client/invoice');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 'inv1', pixKey: 'pix123' });
  });
});

describe('GET /api/client/connection', () => {
  it('returns connection status', async () => {
    (getConnectionStatus as jest.Mock).mockResolvedValue({ customerId: 'cust1', online: true, currentDownloadMbps: 45 });

    const res = await request(buildApp()).get('/api/client/connection');

    expect(res.status).toBe(200);
    expect(res.body.online).toBe(true);
  });
});

describe('GET /api/client/tickets', () => {
  it('returns list of tickets', async () => {
    (getCustomerTickets as jest.Mock).mockResolvedValue([
      { id: 't1', customerId: 'cust1', type: 'technical', description: 'no signal', status: 'open', createdAt: '' },
    ]);

    const res = await request(buildApp()).get('/api/client/tickets');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('POST /api/client/tickets', () => {
  it('creates a new ticket', async () => {
    (openTicket as jest.Mock).mockResolvedValue({ ticketId: 't2', status: 'open', createdAt: '' });

    const res = await request(buildApp())
      .post('/api/client/tickets')
      .send({ type: 'technical', description: 'no internet' });

    expect(res.status).toBe(201);
    expect(res.body.ticketId).toBe('t2');
  });

  it('returns 400 when type or description is missing', async () => {
    const res = await request(buildApp())
      .post('/api/client/tickets')
      .send({ type: 'technical' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/client/referral', () => {
  it('returns referral link and stats', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({
        data: [{ code: 'abc12345', conversions: 2, created_at: '' }],
        error: null,
      }),
    });

    const res = await request(buildApp()).get('/api/client/referral');

    expect(res.status).toBe(200);
    expect(res.body.link).toContain('abc12345');
    expect(res.body.conversions).toBe(2);
  });

  it('returns link: null when no referral link exists yet', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await request(buildApp()).get('/api/client/referral');

    expect(res.status).toBe(200);
    expect(res.body.link).toBeNull();
  });
});

describe('GET /api/client/invoices', () => {
  it('returns list of invoices', async () => {
    (getCustomerInvoices as jest.Mock).mockResolvedValue([
      { id: 'inv1', customerId: 'cust1', amount: 70, dueDate: '2026-05-10', status: 'paid' },
    ]);

    const res = await request(buildApp()).get('/api/client/invoices');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});
