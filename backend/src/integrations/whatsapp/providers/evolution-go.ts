/**
 * Evolution Go Provider
 *
 * Implementação do WhatsAppProvider para o Evolution Go (API WhatsApp em Go).
 * Docs: https://docs.evolutionfoundation.com.br
 *
 * Autenticação em dois níveis:
 *   - Rotas admin (create/delete/list): header apikey = GLOBAL_API_KEY
 *   - Rotas de instância (connect/send/status/qr): header apikey = token da instância
 */

import axios, { AxiosInstance } from 'axios';
import { randomUUID } from 'crypto';
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

// ─── Evolution Go webhook payload ────────────────────────────────────────────

interface EvoGoWebhookPayload {
  event: string;
  instanceName?: string;
  instanceId?: string;
  instanceToken?: string;
  data?: {
    ID?: string;
    Timestamp?: number;
    Chat?: string;
    Sender?: string;
    PushName?: string;
    FromMe?: boolean;
    Type?: string;
    Message?: Record<string, unknown> | string;
    // QRCode event
    qrcode?: string;
    code?: string;
    // Connection event
    state?: string;
    connected?: boolean;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jidToPhone(jid: string): string {
  const number = jid.replace(/@[^@]+$/, '').replace(/[^0-9]/g, '');
  return `+${number}`;
}

function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `${normalized}@s.whatsapp.net`;
}

function mapEventType(event: string): WebhookEventType {
  switch (event) {
    case 'Message':     return 'message_received';
    case 'Connected':   return 'connection_update';
    case 'LoggedOut':   return 'connection_update';
    case 'QRCode':      return 'qrcode_update';
    case 'QRTimeout':   return 'qrcode_update';
    case 'Receipt':     return 'message_delivered';
    default:            return 'unknown';
  }
}

function extractMessageText(msg: Record<string, unknown> | string | undefined): string | undefined {
  if (!msg) return undefined;
  if (typeof msg === 'string') return msg;
  // whatsmeow protobuf-like structure
  return (
    (msg['conversation'] as string | undefined) ??
    ((msg['extendedTextMessage'] as Record<string, unknown> | undefined)?.text as string | undefined) ??
    ((msg['imageMessage'] as Record<string, unknown> | undefined)?.caption as string | undefined) ??
    ((msg['documentMessage'] as Record<string, unknown> | undefined)?.caption as string | undefined)
  );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export interface EvolutionGoConfig {
  /** URL base do Evolution Go (ex: https://evo-go.railway.app) */
  baseUrl: string;
  /** Chave global (admin) — usada apenas para criar/deletar/listar instâncias */
  apiKey: string;
  /** Token padrão da instância (EVOLUTION_INSTANCE_TOKEN) — single-tenant */
  defaultInstanceToken?: string;
  timeout?: number;
}

interface InstanceCache {
  token: string;
  webhookUrl?: string;
}

export class EvolutionGoProvider implements WhatsAppProvider {
  readonly name = 'evolution-go';
  private adminHttp: AxiosInstance;
  private cache: Map<string, InstanceCache> = new Map();

  constructor(private config: EvolutionGoConfig) {
    this.adminHttp = axios.create({
      baseURL: config.baseUrl.replace(/\/$/, ''),
      timeout: config.timeout ?? 30_000,
      headers: {
        apikey: config.apiKey,
        'Content-Type': 'application/json',
      },
    });

    // Pré-carrega token padrão se definido
    if (config.defaultInstanceToken) {
      this.cache.set('__default__', { token: config.defaultInstanceToken });
    }
  }

  /** Registra token de uma instância (chamado após createInstance ou no bootstrap) */
  setInstanceToken(instanceName: string, token: string, webhookUrl?: string): void {
    this.cache.set(instanceName, { token, webhookUrl });
  }

  private instanceHttp(instanceName: string): AxiosInstance {
    const cached = this.cache.get(instanceName) ?? this.cache.get('__default__');
    if (!cached) {
      throw new Error(
        `Evolution Go: nenhum token para instância "${instanceName}". ` +
        'Defina EVOLUTION_INSTANCE_TOKEN ou chame setInstanceToken().',
      );
    }
    return axios.create({
      baseURL: this.config.baseUrl.replace(/\/$/, ''),
      timeout: this.config.timeout ?? 30_000,
      headers: {
        apikey: cached.token,
        'Content-Type': 'application/json',
      },
    });
  }

  // ─── Instance Lifecycle ───────────────────────────────────────────────────

  async createInstance(cfg: InstanceConfig): Promise<InstanceInfo> {
    const token = cfg.token ?? randomUUID();

    const { data } = await this.adminHttp.post<{ id?: string; name?: string }>('/instance/create', {
      name: cfg.instanceName,
      token,
    });

    this.cache.set(cfg.instanceName, { token, webhookUrl: cfg.webhookUrl });

    return {
      instanceName: data.name ?? cfg.instanceName,
      status: { connected: false, state: 'close' },
      token,
    };
  }

  async deleteInstance(instanceName: string): Promise<void> {
    // Busca o ID da instância antes de deletar (Evolution Go precisa do UUID)
    const { data } = await this.adminHttp.get<Array<{ id?: string; name?: string }>>('/instance/all');
    const instance = (data ?? []).find((i) => i.name === instanceName);
    const id = instance?.id ?? instanceName;
    await this.adminHttp.delete(`/instance/delete/${id}`);
    this.cache.delete(instanceName);
  }

  async connectInstance(instanceName: string): Promise<ConnectionResult> {
    const cached = this.cache.get(instanceName) ?? this.cache.get('__default__');
    const http = this.instanceHttp(instanceName);

    await http.post('/instance/connect', {
      webhookUrl: cached?.webhookUrl ?? '',
      subscribe: ['ALL'],
      immediate: true,
    });

    return { success: true };
  }

  async disconnectInstance(instanceName: string): Promise<void> {
    const http = this.instanceHttp(instanceName);
    await http.delete('/instance/logout');
  }

  async getInstanceStatus(instanceName: string): Promise<InstanceStatus> {
    const http = this.instanceHttp(instanceName);
    const { data } = await http.get<{ connected?: boolean; loggedIn?: boolean; myJid?: string }>('/instance/status');

    const connected = data.connected ?? false;
    return {
      connected,
      state: connected ? 'open' : 'close',
      phoneNumber: data.myJid ? jidToPhone(data.myJid) : undefined,
    };
  }

  async getQRCode(instanceName: string): Promise<QRCodeResult> {
    const http = this.instanceHttp(instanceName);
    const { data } = await http.get<{ qrcode?: string; code?: string }>('/instance/qr');

    const qr = data.qrcode ?? data.code;
    if (!qr) throw new Error(`Evolution Go: QR code não disponível para "${instanceName}"`);

    return { qrCode: qr };
  }

  async listInstances(): Promise<InstanceInfo[]> {
    const { data } = await this.adminHttp.get<Array<{ name?: string; connected?: boolean }>>('/instance/all');
    return (data ?? []).map((item) => ({
      instanceName: item.name ?? '',
      status: {
        connected: item.connected ?? false,
        state: (item.connected ? 'open' : 'close') as InstanceStatus['state'],
      },
    }));
  }

  // ─── Messaging ────────────────────────────────────────────────────────────

  async sendText(instanceName: string, to: string, body: string): Promise<SendResult> {
    const http = this.instanceHttp(instanceName);
    const { data } = await http.post<{ id?: string; ID?: string }>('/send/text', {
      number: phoneToJid(to),
      text: body,
    });

    return {
      messageId: data.id ?? data.ID ?? `evo-${Date.now()}`,
      timestamp: new Date(),
      status: 'sent',
    };
  }

  async sendMedia(instanceName: string, to: string, media: MediaPayload): Promise<SendResult> {
    const http = this.instanceHttp(instanceName);
    const isBase64 = !media.data.startsWith('http');

    const { data } = await http.post<{ id?: string; ID?: string }>('/send/media', {
      number: phoneToJid(to),
      type: media.mimetype.split('/')[0],
      caption: media.caption ?? '',
      filename: media.fileName,
      ...(isBase64 ? { base64: media.data, mimetype: media.mimetype } : { url: media.data }),
    });

    return {
      messageId: data.id ?? data.ID ?? `evo-media-${Date.now()}`,
      timestamp: new Date(),
      status: 'sent',
    };
  }

  async sendTemplate(_instanceName: string, _to: string, _tpl: TemplatePayload): Promise<SendResult> {
    throw new Error(
      'EvolutionGoProvider.sendTemplate: use WhatsAppService.sendTemplate que resolve o template antes de chamar o provider',
    );
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  validateWebhook(_rawBody: unknown, _headers: Record<string, string>): boolean {
    return true;
  }

  parseWebhook(rawBody: unknown, _headers: Record<string, string>): ParsedWebhookEvent {
    const body = rawBody as EvoGoWebhookPayload;
    const event = body.event ?? '';
    const eventType: WebhookEventType = mapEventType(event);
    const instanceName = body.instanceName ?? '';
    const data = body.data ?? {};
    const timestamp = data.Timestamp ? new Date(data.Timestamp * 1000) : new Date();

    if (eventType === 'qrcode_update') {
      return {
        type: 'qrcode_update',
        instanceName,
        data: { qrCode: data.qrcode ?? data.code, raw: rawBody },
        timestamp,
      };
    }

    if (eventType === 'connection_update') {
      const state: InstanceStatus['state'] =
        event === 'Connected' ? 'open' :
        event === 'LoggedOut' ? 'close' : 'connecting';
      return {
        type: 'connection_update',
        instanceName,
        data: { connectionState: state, raw: rawBody },
        timestamp,
      };
    }

    if (eventType === 'message_received' && !data.FromMe) {
      const jid = data.Chat ?? data.Sender ?? '';
      const fromPhone = jid ? jidToPhone(jid) : undefined;
      const bodyText = extractMessageText(data.Message as Record<string, unknown> | string | undefined);

      return {
        type: 'message_received',
        instanceName,
        data: {
          from: jid,
          fromPhone,
          profileName: data.PushName,
          body: bodyText,
          messageId: data.ID,
          raw: rawBody,
        },
        timestamp,
      };
    }

    return {
      type: 'unknown',
      instanceName,
      data: { raw: rawBody },
      timestamp,
    };
  }
}
