import request from 'supertest';
import express from 'express';
import type { IncomingMessage } from 'http';

jest.mock('../../config/env', () => ({
  env: { DEFAULT_TENANT_ID: 'default' },
}));

jest.mock('../../services/instance-manager', () => ({
  instanceManager: { findByName: jest.fn(), handleConnectionEvent: jest.fn() },
}));

jest.mock('../../integrations/whatsapp/provider-registry', () => ({
  providerRegistry: { get: jest.fn() },
}));

jest.mock('../../services/event-bus', () => ({
  eventBus: { enqueue: jest.fn().mockResolvedValue(undefined) },
}));

import { webhookRouter } from '../../routes/webhook-router';
import { instanceManager } from '../../services/instance-manager';
import { providerRegistry } from '../../integrations/whatsapp/provider-registry';
import { eventBus } from '../../services/event-bus';

function buildApp() {
  const app = express();
  app.use(express.json({
    verify: (req: IncomingMessage, _res, buf: Buffer) => {
      (req as IncomingMessage & { rawBody?: Buffer }).rawBody = buf;
    },
  }));
  app.use('/webhook/whatsapp', webhookRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  (instanceManager.findByName as jest.Mock).mockResolvedValue({
    tenantId: 'default',
    provider: 'evolution-go',
    instanceToken: 'tok',
  });
});

describe('POST /webhook/whatsapp/:instanceName — fast ACK', () => {
  it('responds 200 before slow downstream processing (parseWebhook) settles', async () => {
    let releaseParse: (() => void) | undefined;
    const parseWebhookPromise = new Promise((resolve) => {
      releaseParse = () => resolve({ type: 'unknown', instanceName: 'salesnet', data: {}, timestamp: new Date() });
    });

    const parseWebhook = jest.fn().mockReturnValue(parseWebhookPromise);
    (providerRegistry.get as jest.Mock).mockReturnValue({
      validateWebhook: jest.fn().mockReturnValue(true),
      parseWebhook,
    });

    // Não aguardamos releaseParse — se o handler estivesse bloqueando a resposta
    // nisso (como fazia antes do ACK rápido), esta promise nunca resolveria e o
    // teste estouraria o timeout do supertest em vez de retornar 200 rápido.
    const res = await request(buildApp())
      .post('/webhook/whatsapp/salesnet')
      .send({ event: 'Message', instanceName: 'salesnet', data: {} });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    // parseWebhook foi chamado, mas a resposta HTTP não esperou por ele.
    expect(parseWebhook).toHaveBeenCalled();
    expect(eventBus.enqueue).not.toHaveBeenCalled();

    releaseParse?.();
    await parseWebhookPromise;
  });

  it('rejects with 401 before any downstream processing when signature is invalid', async () => {
    const parseWebhook = jest.fn();
    (providerRegistry.get as jest.Mock).mockReturnValue({
      validateWebhook: jest.fn().mockReturnValue(false),
      parseWebhook,
    });

    const res = await request(buildApp())
      .post('/webhook/whatsapp/salesnet')
      .send({ event: 'Message', instanceName: 'salesnet', data: {} });

    expect(res.status).toBe(401);
    expect(parseWebhook).not.toHaveBeenCalled();
    expect(eventBus.enqueue).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown instance without touching the provider', async () => {
    (instanceManager.findByName as jest.Mock).mockResolvedValue(null);

    const res = await request(buildApp())
      .post('/webhook/whatsapp/unknown-instance')
      .send({ event: 'Message', instanceName: 'unknown-instance', data: {} });

    expect(res.status).toBe(404);
    expect(providerRegistry.get).not.toHaveBeenCalled();
  });
});
