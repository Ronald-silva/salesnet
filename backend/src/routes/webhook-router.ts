/**
 * Webhook Router — Unificado
 *
 * Recebe webhooks de qualquer provider WhatsApp.
 * Endpoints:
 *   POST /webhook/whatsapp/:instanceName  — Evolution Go e futuros providers
 *   POST /webhook/twilio                  — Legacy compat (redireciona aqui)
 */

import { Router, Request, Response } from 'express';
import { instanceManager } from '../services/instance-manager';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';
import { eventBus } from '../services/event-bus';
import type { DomainEvent } from '../services/event-bus';
import type { ParsedWebhookEvent } from '../integrations/whatsapp/whatsapp-provider';

const router = Router();

/**
 * POST /webhook/whatsapp/:instanceName
 * Webhook principal para Evolution Go (e qualquer provider futuro).
 */
router.post('/:instanceName', async (req: Request, res: Response) => {
  const instanceName = String(req.params['instanceName']);

  // Responder 200 imediatamente (Evolution precisa de resposta rápida)
  res.status(200).json({ ok: true });

  try {
    const instance = await instanceManager.findByName(instanceName);
    if (!instance) {
      console.warn(`[webhook] Unknown instance: ${instanceName}`);
      return;
    }

    const provider = providerRegistry.get(instance.provider);

    // Validar assinatura/autenticação do provider
    const headers = req.headers as Record<string, string>;
    if (!provider.validateWebhook(req.body, headers)) {
      console.warn(`[webhook] Invalid signature for instance ${instanceName}`);
      return;
    }

    // Normalizar payload → evento de domínio
    const parsed: ParsedWebhookEvent = provider.parseWebhook(req.body, headers);

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
    if (parsed.type === 'message_received' && !parsed.data.fromPhone) return;
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

    const parsed = provider.parseWebhook(req.body, headers);

    if (parsed.data.fromPhone && parsed.data.body) {
      eventBus.emitIncomingMessage({
        phone: parsed.data.fromPhone,
        body: parsed.data.body,
        profileName: parsed.data.profileName,
      });
    }
  } catch (err) {
    console.error('[webhook:twilio] Error:', err);
  }
});

export { router as webhookRouter };
export { router as twilioLegacyRouter };
