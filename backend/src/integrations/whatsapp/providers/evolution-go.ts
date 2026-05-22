/**
 * Evolution Go Provider
 *
 * Implementação do WhatsAppProvider para a Evolution API (Node.js ou Go).
 * Compatível com Evolution API v2.x.
 *
 * Docs: https://doc.evolution-api.com
 */

import axios, { AxiosInstance } from 'axios';
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
  WebhookEventType,
} from '../whatsapp-provider';

interface EvolutionInstanceResponse {
  instance: {
    instanceName: string;
    state?: string;
    status?: string;
  };
  qrcode?: {
    code?: string;
    base64?: string;
  };
  hash?: {
    apikey?: string;
  };
}

interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data?: {
    key?: {
      remoteJid?: string;
      id?: string;
    };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string; mimetype?: string };
      documentMessage?: { caption?: string; mimetype?: string; fileName?: string };
    };
    messageType?: string;
    pushName?: string;
    instanceName?: string;
    qrcode?: {
      code?: string;
      base64?: string;
    };
    state?: string;
  };
  date_time?: string;
}

/** Normaliza JID WhatsApp → número E.164 */
function jidToPhone(jid: string): string {
  const number = jid.replace(/@[^@]+$/, '').replace(/[^0-9]/g, '');
  return `+${number}`;
}

/** Normaliza número qualquer → JID WhatsApp */
function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `${normalized}@s.whatsapp.net`;
}

function mapConnectionState(state?: string): InstanceStatus['state'] {
  switch (state?.toLowerCase()) {
    case 'open':        return 'open';
    case 'connecting':  return 'connecting';
    default:            return 'close';
  }
}

function mapEventType(event: string): WebhookEventType {
  switch (event) {
    case 'messages.upsert':     return 'message_received';
    case 'send.message':        return 'message_sent';
    case 'messages.update':     return 'message_delivered';
    case 'messages.delete':     return 'message_deleted';
    case 'connection.update':   return 'connection_update';
    case 'qrcode.updated':      return 'qrcode_update';
    default:                    return 'unknown';
  }
}

export interface EvolutionGoConfig {
  baseUrl: string;
  apiKey: string;
  /** Timeout em ms (padrão: 30000) */
  timeout?: number;
}

export class EvolutionGoProvider implements WhatsAppProvider {
  readonly name = 'evolution-go';
  private http: AxiosInstance;

  constructor(private config: EvolutionGoConfig) {
    this.http = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ''),
      timeout: config.timeout ?? 30_000,
      headers: {
        apikey: config.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  // ─── Instance Lifecycle ───────────────────────────────────────────────────

  async createInstance(cfg: InstanceConfig): Promise<InstanceInfo> {
    const { data } = await this.http.post<EvolutionInstanceResponse>('/instance/create', {
      instanceName: cfg.instanceName,
      qrcode: cfg.qrcode ?? true,
      webhook: cfg.webhookUrl,
      webhookByEvents: true,
      events: [
        'APPLICATION_STARTUP',
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'MESSAGES_DELETE',
        'SEND_MESSAGE',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
      ],
    });

    return {
      instanceName: data.instance.instanceName,
      status: {
        connected: false,
        state: 'close',
      },
      qrCode: data.qrcode?.base64 ?? data.qrcode?.code,
    };
  }

  async deleteInstance(instanceName: string): Promise<void> {
    await this.http.delete(`/instance/delete/${instanceName}`);
  }

  async connectInstance(instanceName: string): Promise<ConnectionResult> {
    const { data } = await this.http.get<{ qrcode?: { base64?: string; code?: string }; pairingCode?: string }>(
      `/instance/connect/${instanceName}`,
    );

    return {
      success: true,
      qrCode: data.qrcode?.base64 ?? data.qrcode?.code,
      pairingCode: data.pairingCode,
    };
  }

  async disconnectInstance(instanceName: string): Promise<void> {
    await this.http.delete(`/instance/logout/${instanceName}`);
  }

  async getInstanceStatus(instanceName: string): Promise<InstanceStatus> {
    const { data } = await this.http.get<{
      instance?: { state?: string; owner?: string };
    }>(`/instance/connectionState/${instanceName}`);

    const state = mapConnectionState(data.instance?.state);
    return {
      connected: state === 'open',
      state,
      phoneNumber: data.instance?.owner ? jidToPhone(data.instance.owner) : undefined,
    };
  }

  async getQRCode(instanceName: string): Promise<QRCodeResult> {
    const { data } = await this.http.get<{
      qrcode?: { base64?: string; code?: string };
      pairingCode?: string;
    }>(`/instance/connect/${instanceName}`);

    if (!data.qrcode?.base64 && !data.qrcode?.code) {
      throw new Error(`No QR code available for instance ${instanceName}`);
    }

    return {
      qrCode: (data.qrcode.base64 ?? data.qrcode.code) as string,
      pairingCode: data.pairingCode,
    };
  }

  async listInstances(): Promise<InstanceInfo[]> {
    const { data } = await this.http.get<{ instance: { instanceName: string; state?: string } }[]>(
      '/instance/fetchInstances',
    );

    return data.map((item) => ({
      instanceName: item.instance.instanceName,
      status: {
        connected: item.instance.state === 'open',
        state: mapConnectionState(item.instance.state),
      },
    }));
  }

  // ─── Messaging ────────────────────────────────────────────────────────────

  async sendText(instanceName: string, to: string, body: string): Promise<SendResult> {
    const { data } = await this.http.post<{ key?: { id?: string } }>(
      `/message/sendText/${instanceName}`,
      {
        number: phoneToJid(to),
        text: body,
      },
    );

    return {
      messageId: data.key?.id ?? `evo-${Date.now()}`,
      timestamp: new Date(),
      status: 'sent',
    };
  }

  async sendMedia(instanceName: string, to: string, media: MediaPayload): Promise<SendResult> {
    const isBase64 = media.data.startsWith('data:') || !media.data.startsWith('http');

    const { data } = await this.http.post<{ key?: { id?: string } }>(
      `/message/sendMedia/${instanceName}`,
      {
        number: phoneToJid(to),
        mediatype: media.mimetype.split('/')[0],   // 'image', 'video', 'document'
        mimetype: media.mimetype,
        caption: media.caption ?? '',
        fileName: media.fileName,
        media: isBase64 ? media.data : undefined,
        url: !isBase64 ? media.data : undefined,
      },
    );

    return {
      messageId: data.key?.id ?? `evo-media-${Date.now()}`,
      timestamp: new Date(),
      status: 'sent',
    };
  }

  async sendTemplate(instanceName: string, to: string, tpl: TemplatePayload): Promise<SendResult> {
    // Evolution Go não tem templates nativos Twilio-style;
    // templates são implementados como mensagens de texto pré-formatadas.
    // O WhatsAppService é responsável por resolver o template → texto.
    throw new Error(
      'EvolutionGoProvider.sendTemplate: use WhatsAppService.sendTemplate which resolves templates before calling provider',
    );
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  validateWebhook(rawBody: unknown, headers: Record<string, string>): boolean {
    // Evolution Go usa apikey no header ou não assina — verificar header se configurado
    const headerKey = headers['apikey'] ?? headers['x-api-key'] ?? '';
    if (this.config.apiKey && headerKey) {
      return headerKey === this.config.apiKey;
    }
    // Se não há assinatura configurada, aceitar (restringir no firewall)
    return true;
  }

  parseWebhook(rawBody: unknown, _headers: Record<string, string>): ParsedWebhookEvent {
    const body = rawBody as EvolutionWebhookPayload;
    const eventType = mapEventType(body.event ?? '');
    const data = body.data ?? {};
    const timestamp = body.date_time ? new Date(body.date_time) : new Date();

    let fromPhone: string | undefined;
    let body_text: string | undefined;
    let profileName: string | undefined;
    let messageId: string | undefined;

    if (eventType === 'message_received') {
      const jid = data.key?.remoteJid ?? '';
      fromPhone = jid ? jidToPhone(jid) : undefined;
      messageId = data.key?.id;
      profileName = data.pushName;

      const msg = data.message;
      body_text =
        msg?.conversation ??
        msg?.extendedTextMessage?.text ??
        msg?.imageMessage?.caption ??
        msg?.documentMessage?.caption;
    }

    if (eventType === 'qrcode_update') {
      return {
        type: 'qrcode_update',
        instanceName: body.instance,
        data: {
          qrCode: data.qrcode?.base64 ?? data.qrcode?.code,
          raw: rawBody,
        },
        timestamp,
      };
    }

    if (eventType === 'connection_update') {
      return {
        type: 'connection_update',
        instanceName: body.instance,
        data: {
          connectionState: mapConnectionState(data.state),
          raw: rawBody,
        },
        timestamp,
      };
    }

    return {
      type: eventType,
      instanceName: body.instance,
      data: {
        from: data.key?.remoteJid,
        fromPhone,
        profileName,
        body: body_text,
        messageId,
        raw: rawBody,
      },
      timestamp,
    };
  }
}
