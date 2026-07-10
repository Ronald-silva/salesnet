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
  openTicket: jest.fn(),
  getCustomerInvoices: jest.fn(),
  getCustomerById: jest.fn(),
}));
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import {
  getCurrentInvoice,
  generatePixKey,
  getConnectionStatus,
  openTicket,
  getCustomerInvoices,
} from '../../integrations/sgp';
import { supabase } from '../../config/supabase';

beforeEach(() => jest.clearAllMocks());

type SofiaTicketRow = {
  id: string;
  tipo: string;
  descricao: string;
  status: string;
  sgp_chamado_id: string | null;
  created_at: string;
  updated_at: string;
};

// Tickets vivem em sofia_tickets (Supabase); SGP getCustomerTickets é stub
function mockSofiaTickets(
  listResult: { data: SofiaTicketRow[] | null; error: unknown } = { data: [], error: null },
  insertResult: { data: SofiaTicketRow | null; error: unknown } = { data: null, error: null },
) {
  const insert = jest.fn().mockReturnThis();
  const builder = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(listResult),
    insert,
    single: jest.fn().mockResolvedValue(insertResult),
  };
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'sofia_tickets') return builder;
    return {};
  });
  return builder;
}

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
  it('returns tickets from sofia_tickets mapped to the API shape', async () => {
    mockSofiaTickets({
      data: [{
        id: 't1',
        tipo: 'technical',
        descricao: 'no signal',
        status: 'aberto',
        sgp_chamado_id: 'SGP-77',
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
      }],
      error: null,
    });

    const res = await request(buildApp()).get('/api/client/tickets');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 't1',
      type: 'technical',
      description: 'no signal',
      status: 'open',
      protocol: 'SGP-77',
    });
  });

  it('returns 500 when the sofia_tickets query fails', async () => {
    mockSofiaTickets({ data: null, error: new Error('permission denied') });

    const res = await request(buildApp()).get('/api/client/tickets');

    expect(res.status).toBe(500);
  });
});

describe('POST /api/client/tickets', () => {
  const insertedRow: SofiaTicketRow = {
    id: 't2',
    tipo: 'technical',
    descricao: 'no internet',
    status: 'aberto',
    sgp_chamado_id: 'SGP-123',
    created_at: '2026-07-01T10:00:00Z',
    updated_at: '2026-07-01T10:00:00Z',
  };

  it('opens the ticket in SGP and persists it in sofia_tickets', async () => {
    (openTicket as jest.Mock).mockResolvedValue({ protocolo: 'SGP-123' });
    const builder = mockSofiaTickets(undefined, { data: insertedRow, error: null });

    const res = await request(buildApp())
      .post('/api/client/tickets')
      .send({ type: 'technical', description: 'no internet' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 't2',
      type: 'technical',
      description: 'no internet',
      status: 'open',
      protocol: 'SGP-123',
    });
    expect(openTicket).toHaveBeenCalledWith('cust1', 'technical', 'no internet');
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      contrato: 'cust1',
      phone: '+5585999990001',
      tipo: 'technical',
      descricao: 'no internet',
      status: 'aberto',
      sgp_chamado_id: 'SGP-123',
    }));
  });

  it('still creates the ticket when SGP openTicket fails (best-effort)', async () => {
    (openTicket as jest.Mock).mockRejectedValue(new Error('SGP timeout'));
    const builder = mockSofiaTickets(undefined, {
      data: { ...insertedRow, sgp_chamado_id: null },
      error: null,
    });

    const res = await request(buildApp())
      .post('/api/client/tickets')
      .send({ type: 'technical', description: 'no internet' });

    expect(res.status).toBe(201);
    expect(res.body.protocol).toBeNull();
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ sgp_chamado_id: null }),
    );
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
