/**
 * WhatsApp Service (Facade)
 *
 * Ponto único de acesso para envio de mensagens WhatsApp.
 * Encapsula: resolução de provider, resolução de instância, rate limiting e humanização.
 *
 * Todo o sistema deve usar esta classe — nunca importar providers diretamente.
 */

import { providerRegistry } from '../integrations/whatsapp/provider-registry';
import type { SendResult, MediaPayload } from '../integrations/whatsapp/whatsapp-provider';
import { rateLimiter } from './rate-limiter';
import { instanceManager } from './instance-manager';
import { resolveTemplate, type TemplateName } from '../templates';

class WhatsAppService {
  /**
   * Envia mensagem de texto para um número.
   * @param tenantId  ID do tenant (empresa) — usa 'default' em modo single-tenant
   * @param to        Número E.164 ou só dígitos brasileiros
   * @param body      Texto da mensagem
   */
  async sendText(tenantId: string, to: string, body: string): Promise<SendResult> {
    const instance = await instanceManager.resolveInstance(tenantId);
    const provider = providerRegistry.getForTenant(tenantId);

    return rateLimiter.waitAndSend(instance.instanceName, () =>
      provider.sendText(instance.instanceName, to, body),
    );
  }

  /**
   * Envia template de mensagem (billing, campanhas, etc).
   * Templates são resolvidos localmente → texto → sendText.
   * Isso elimina a dependência de Template SIDs do Twilio.
   */
  async sendTemplate(
    tenantId: string,
    to: string,
    templateName: TemplateName,
    variables: Record<string, string>,
  ): Promise<SendResult> {
    const text = resolveTemplate(templateName, variables);
    return this.sendText(tenantId, to, text);
  }

  /**
   * Envia mídia (imagem, documento, áudio).
   */
  async sendMedia(tenantId: string, to: string, media: MediaPayload): Promise<SendResult> {
    const instance = await instanceManager.resolveInstance(tenantId);
    const provider = providerRegistry.getForTenant(tenantId);

    return rateLimiter.waitAndSend(instance.instanceName, () =>
      provider.sendMedia(instance.instanceName, to, media),
    );
  }
}

export const whatsappService = new WhatsAppService();
