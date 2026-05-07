jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    TWILIO_AUTH_TOKEN: 'authtest',
    TWILIO_WHATSAPP_NUMBER: '5585996032957',
    TWILIO_ACCOUNT_SID: 'ACtest',
    PORT: 3001,
    SGP_BASE_URL: 'http://sgp.test',
    SGP_API_TOKEN: 'sgptoken',
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_SERVICE_ROLE_KEY: 'supabasekey',
    ANTHROPIC_API_KEY: 'anthropickey',
  },
}));

import express from 'express';
import request from 'supertest';
import webhookRouter from '../../integrations/twilio/webhook';
import { messageBus } from '../../services/message-bus';

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use('/webhook/twilio', webhookRouter);

describe('POST /webhook/twilio', () => {
  it('responds 200 immediately', async () => {
    const res = await request(app)
      .post('/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+5585999990000', Body: 'Olá', ProfileName: 'João' });

    expect(res.status).toBe(200);
  });

  it('emits incoming_message with normalized phone', async () => {
    const handler = jest.fn();
    messageBus.once('incoming_message', handler);

    await request(app)
      .post('/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+5585999990000', Body: 'Oi', ProfileName: 'Maria' });

    expect(handler).toHaveBeenCalledWith({
      phone:       '+5585999990000',
      body:        'Oi',
      profileName: 'Maria',
    });
  });

  it('strips whatsapp: prefix from From field', async () => {
    const handler = jest.fn();
    messageBus.once('incoming_message', handler);

    await request(app)
      .post('/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+5585888880000', Body: 'test' });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+5585888880000' }),
    );
  });

  it('handles missing ProfileName gracefully', async () => {
    const handler = jest.fn();
    messageBus.once('incoming_message', handler);

    await request(app)
      .post('/webhook/twilio')
      .type('form')
      .send({ From: 'whatsapp:+5585777770000', Body: 'hello' });

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ profileName: undefined }),
    );
  });
});
