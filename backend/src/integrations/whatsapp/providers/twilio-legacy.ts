/**
 * Twilio Legacy Provider
 *
 * Adapta o código Twilio existente para a interface WhatsAppProvider.
 * Mantém compatibilidade durante a transição para Evolution Go.
 * Não adicionar novas funcionalidades aqui — apenas compatibilidade.
 */

import twilio from 'twilio';
import { validateRequest } from 'twilio';
import type {
  WhatsAppProvider,
  InstanceConfig,
  InstanceInfo,
  InstanceStatus,
  QRCodeResult,
  ConnectionResult,
  SendResult,
  MediaPayload,
  TemplatePayload,
  ParsedWebhookEvent,
} from '../whatsapp-provider';

export interface TwilioLegacyConfig {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
}

export class TwilioLegacyProvider implements WhatsAppProvider {
  readonly name = 'twilio';
  private client: ReturnType<typeof twilio>;
  private fromNumber: string;

  constructor(private config: TwilioLegacyConfig) {
    this.client = twilio(config.accountSid, config.authToken);
    const n = config.whatsappNumber;
    this.fromNumber = `whatsapp:${n.startsWith('+') ? n : `+${n}`}`;
  }

  // ─── Instance Lifecycle (N/A para Twilio — single instance) ──────────────

  async createInstance(_cfg: InstanceConfig): Promise<InstanceInfo> {
    return {
      instanceName: 'twilio-default',
      status: { connected: true, state: 'open' },
    };
  }

  async deleteInstance(_instanceName: string): Promise<void> {
    // No-op
  }

  async connectInstance(_instanceName: string): Promise<ConnectionResult> {
    return { success: true, message: 'Twilio always connected' };
  }

  async disconnectInstance(_instanceName: string): Promise<void> {
    // No-op
  }

  async getInstanceStatus(_instanceName: string): Promise<InstanceStatus> {
    return { connected: true, state: 'open' };
  }

  async getQRCode(_instanceName: string): Promise<QRCodeResult> {
    throw new Error('Twilio provider does not support QR codes');
  }

  async listInstances(): Promise<InstanceInfo[]> {
    return [{ instanceName: 'twilio-default', status: { connected: true, state: 'open' } }];
  }

  // ─── Messaging ────────────────────────────────────────────────────────────

  private toWhatsappNumber(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    const e164 = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
    return `whatsapp:${e164}`;
  }

  async sendText(_instanceName: string, to: string, body: string): Promise<SendResult> {
    const msg = await this.client.messages.create({
      from: this.fromNumber,
      to: this.toWhatsappNumber(to),
      body,
    });
    return { messageId: msg.sid, timestamp: new Date(), status: 'sent' };
  }

  async sendMedia(_instanceName: string, to: string, media: MediaPayload): Promise<SendResult> {
    const msg = await this.client.messages.create({
      from: this.fromNumber,
      to: this.toWhatsappNumber(to),
      body: media.caption ?? '',
      mediaUrl: [media.data],
    } as Parameters<typeof this.client.messages.create>[0]);
    return { messageId: msg.sid, timestamp: new Date(), status: 'sent' };
  }

  async sendTemplate(_instanceName: string, to: string, tpl: TemplatePayload): Promise<SendResult> {
    // Twilio usa Content SID como templateName
    const msg = await this.client.messages.create({
      from: this.fromNumber,
      to: this.toWhatsappNumber(to),
      contentSid: tpl.templateName,
      contentVariables: JSON.stringify(tpl.variables),
    } as Parameters<typeof this.client.messages.create>[0]);
    return { messageId: msg.sid, timestamp: new Date(), status: 'sent' };
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  validateWebhook(rawBody: unknown, headers: Record<string, string>): boolean {
    const signature = headers['x-twilio-signature'] ?? '';
    const url = headers['x-original-url'] ?? '';
    if (!signature || !url) return true; // dev mode
    return validateRequest(
      this.config.authToken,
      signature,
      url,
      rawBody as Record<string, string>,
    );
  }

  async parseWebhook(rawBody: unknown, _headers: Record<string, string>): Promise<ParsedWebhookEvent> {
    const body = rawBody as Record<string, string>;
    const From = body['From'] ?? '';
    const Body = body['Body'] ?? '';
    const ProfileName = body['ProfileName'];

    const fromPhone = From.replace('whatsapp:', '');

    return {
      type: 'message_received',
      instanceName: 'twilio-default',
      data: {
        from: From,
        fromPhone,
        profileName: ProfileName,
        body: Body,
        raw: rawBody,
      },
      timestamp: new Date(),
    };
  }
}
