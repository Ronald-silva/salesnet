/**
 * Webhook Router — Unificado
 *
 * Recebe webhooks de qualquer provider WhatsApp.
 * Endpoints:
 *   POST /webhook/whatsapp/:instanceName  — Evolution Go e futuros providers
 *   POST /webhook/twilio                  — Legacy compat (redireciona aqui)
 */

import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { instanceManager } from '../services/instance-manager';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';
import { eventBus } from '../services/event-bus';
import type { DomainEvent } from '../services/event-bus';
import type { ParsedWebhookEvent } from '../integrations/whatsapp/whatsapp-provider';

type RawRequest = Request & { rawBody?: Buffer };

const router = Router();

/**
 * POST /webhook/whatsapp/:instanceName
 * Webhook principal para Evolution Go (e qualquer provider futuro).
 */
router.post('/:instanceName', async (req: Request, res: Response) => {
  const instanceName = String(req.params['instanceName']);
  const headers = req.headers as Record<string, string>;

  try {
    const instance = await instanceManager.findByName(instanceName);
    if (!instance) {
      console.warn(`[webhook] Unknown instance: ${instanceName}`);
      res.status(404).json({ ok: false });
      return;
    }

    const provider = providerRegistry.get(instance.provider);

    // Validate signature with raw bytes BEFORE sending 200 or processing
    const rawBody = (req as RawRequest).rawBody ?? Buffer.alloc(0);
    const extraSecrets = instance.instanceToken ? [instance.instanceToken] : [];
    if (!provider.validateWebhook(rawBody, headers, { extraSecrets })) {
      const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      console.warn(
        `[webhook] Rejected for instance "${instanceName}" from ${ip} (bad HMAC or apikey)`,
      );
      res.status(401).json({ ok: false });
      return;
    }

    // Respond 200 immediately so Evolution Go does not time out
    const webhookEventType = (req.body as { event?: string })?.event ?? 'unknown';
    console.log(`[webhook] ▶ ${instanceName} event=${webhookEventType}`);
    res.status(200).json({ ok: true });

    // Normalizar payload → evento de domínio (pode fazer I/O: transcrição de áudio, visão)
    const parsed: ParsedWebhookEvent = await provider.parseWebhook(req.body, headers);

    // Atualizar status de conexão no banco
    if (parsed.type === 'connection_update' && parsed.data.connectionState) {
      await instanceManager.handleConnectionEvent(instanceName, parsed.data.connectionState);
    }

    // Para message_received, normaliza payload para o formato esperado por onIncomingMessage
    const eventPayload =
      parsed.type === 'message_received' && parsed.data.fromPhone && parsed.data.body
        ? {
            phone: parsed.data.fromPhone,
            body: parsed.data.body,
            profileName: parsed.data.profileName,
            messageId: parsed.data.messageId,
          }
        : parsed.data;

    // Só enfileira mensagens recebidas que tenham telefone e corpo
    if (parsed.type === 'message_received' && !parsed.data.fromPhone) {
      console.warn(
        `[webhook] message_received without valid phone instance=${instanceName} from=${parsed.data.from ?? '-'}`,
      );
      return;
    }
    if (parsed.type === 'message_received' && !parsed.data.body) return;

    const event: DomainEvent = {
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: parsed.type === 'message_received'
        ? 'whatsapp.message.received'
        : parsed.type === 'connection_update'
        ? 'whatsapp.connection.update'
        : parsed.type === 'qrcode_update'
        ? 'whatsapp.qrcode.update'
        : 'whatsapp.message.sent',
      tenantId: instance.tenantId,
      instanceName: String(instanceName),
      payload: eventPayload,
      timestamp: parsed.timestamp,
    };

    await eventBus.enqueue(event);
  } catch (err) {
    console.error(`[webhook] Error processing ${instanceName}:`, err);
  }
});

/**
 * POST /webhook/twilio (legacy compat)
 * Mantém compatibilidade com Twilio durante a transição.
 */
router.post('/', async (req: Request, res: Response) => {
  res.status(200).send('');

  try {
    const provider = providerRegistry.get('twilio');
    const headers = req.headers as Record<string, string>;

    if (!provider.validateWebhook(req.body, headers)) {
      console.warn('[webhook:twilio] Invalid signature');
      return;
    }

    const parsed = await provider.parseWebhook(req.body, headers);

    if (parsed.data.fromPhone && parsed.data.body) {
      eventBus.emitIncomingMessage(
        {
          phone: parsed.data.fromPhone,
          body: parsed.data.body,
          tenantId: env.DEFAULT_TENANT_ID,
          profileName: parsed.data.profileName,
        },
        env.DEFAULT_TENANT_ID,
      );
    }
  } catch (err) {
    console.error('[webhook:twilio] Error:', err);
  }
});

export { router as webhookRouter };
export { router as twilioLegacyRouter };
