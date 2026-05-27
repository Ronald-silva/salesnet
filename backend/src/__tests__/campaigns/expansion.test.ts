import request from 'supertest';
import express from 'express';
import { expansionRouter } from '../../automations/campaigns/expansion';

jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));
jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));

import { supabase } from '../../config/supabase';
import { whatsappService } from '../../services/whatsapp-service';

beforeEach(() => jest.clearAllMocks());

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/campaigns', expansionRouter);
  return app;
}

const waitlistEntries = [
  { phone: '+5585999990001', neighborhood: 'Jardim Guanabara' },
  { phone: '+5585999990002', neighborhood: 'Jardim Guanabara' },
];

describe('POST /api/campaigns/expansion', () => {
  it('sends message to all contacts in the specified neighborhood', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: waitlistEntries, error: null }),
    });
    (whatsappService.sendText as jest.Mock).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post('/api/campaigns/expansion')
      .send({ neighborhood: 'Jardim Guanabara', message: 'Fibra chegou no seu bairro!' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, sent: 2 });
    expect(whatsappService.sendText).toHaveBeenCalledTimes(2);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      'default',
      '+5585999990001',
      'Fibra chegou no seu bairro!',
    );
  });

  it('returns 400 if neighborhood or message is missing', async () => {
    const res = await request(buildApp())
      .post('/api/campaigns/expansion')
      .send({ neighborhood: 'Jardim Guanabara' });

    expect(res.status).toBe(400);
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });

  it('returns 200 with sent:0 when neighborhood has no waitlist entries', async () => {
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await request(buildApp())
      .post('/api/campaigns/expansion')
      .send({ neighborhood: 'Bairro Inexistente', message: 'Fibra chegou!' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, sent: 0 });
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });
});
