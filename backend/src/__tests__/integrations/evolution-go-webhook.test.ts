import { createHmac } from 'crypto';
import { EvolutionGoProvider } from '../../integrations/whatsapp/providers/evolution-go';

jest.mock('../../config/env', () => ({
  env: {
    EVOLUTION_WEBHOOK_SKIP_HMAC: false,
    EVOLUTION_WEBHOOK_SECRET: 'webhook-secret',
    EVOLUTION_INSTANCE_TOKEN: 'instance-token',
    EVOLUTION_API_KEY: 'api-key',
  },
}));

function provider() {
  return new EvolutionGoProvider({
    baseUrl: 'https://evolution.example.com',
    apiKey: 'api-key',
  });
}

describe('EvolutionGoProvider.validateWebhook', () => {
  const rawBody = Buffer.from(JSON.stringify({
    event: 'MESSAGE',
    instanceName: 'salesnet',
    data: {},
  }));

  it('rejects webhooks without HMAC, apikey, or instanceToken', () => {
    expect(provider().validateWebhook(rawBody, {}, { extraSecrets: ['instance-token'] })).toBe(false);
  });

  it('accepts a valid apikey header for Evolution Go compatibility', () => {
    expect(provider().validateWebhook(rawBody, { apikey: 'api-key' })).toBe(true);
  });

  it('accepts a valid instanceToken in the payload', () => {
    const bodyWithToken = Buffer.from(JSON.stringify({
      event: 'MESSAGE',
      instanceName: 'salesnet',
      instanceToken: 'instance-token',
      data: {},
    }));

    expect(provider().validateWebhook(bodyWithToken, {}, { extraSecrets: ['instance-token'] })).toBe(true);
  });

  it('accepts a valid HMAC signature', () => {
    const signature = createHmac('sha256', 'webhook-secret').update(rawBody).digest('hex');

    expect(provider().validateWebhook(rawBody, { 'x-webhook-signature': signature })).toBe(true);
  });
});
