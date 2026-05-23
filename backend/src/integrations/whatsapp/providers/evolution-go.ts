/**
 * Evolution Go Provider
 *
 * Implementação do WhatsAppProvider para o Evolution Go.
 * Docs: https://docs.evolutionfoundation.com.br
 *
 * Endpoints confirmados via teste direto (2026-05-22):
 *   - Admin (global apikey): POST /instance/create, GET /instance/all, DELETE /instance/delete/:id
 *   - Instância (instance token): POST /instance/connect, GET /instance/qr,
 *     GET /instance/status, POST /send/text, POST /send/media, DELETE /instance/logout
 *   - Todas as respostas: { data: ..., message: "success" }
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

// ─── Tipos da API Evolution Go ────────────────────────────────────────────────

interface EvoGoResponse<T> {
  data: T;
  message: string;
}

interface EvoGoInstance {
  id: string;
  name: string;
  token: string;
  webhook: string;
  jid: string;
  qrcode: string;
  connected: boolean;
}

interface EvoGoStatus {
  Connected: boolean;
  LoggedIn: boolean;
  Name: string;
}

interface EvoGoWebhookPayload {
  event: string;
  instanceName?: string;
  instanceId?: string;
  data?: {
    ID?: string;
    Timestamp?: number;
    Chat?: string;
    Sender?: string;
    PushName?: string;
    FromMe?: boolean;
    Type?: string;
    Message?: Record<string, unknown> | string;
    qrcode?: string;
    code?: string;
    state?: string;
    Connected?: boolean;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jidToPhone(jid: string): string {
  return `+${jid.replace(/@[^@]+$/, '').replace(/[^0-9]/g, '')}`;
}

function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `${normalized}@s.whatsapp.net`;
}

function mapEventType(event: string): WebhookEventType {
  switch (event) {
    case 'MESSAGE':     return 'message_received';
    case 'CONNECTION':  return 'connection_update';
    case 'QRCODE':      return 'qrcode_update';
    default:            return 'unknown';
  }
}

function extractMessageText(msg: Record<string, unknown> | string | undefined): string | undefined {
  if (!msg) return undefined;
  if (typeof msg === 'string') return msg;
  return (
    (msg['conversation'] as string | undefined) ??
    ((msg['extendedTextMessage'] as Record<string, unknown> | undefined)?.text as string | undefined) ??
    ((msg['imageMessage'] as Record<string, unknown> | undefined)?.caption as string | undefined)
  );
}

// QR code vem como "data:image/png;base64,...|rawCode" — retorna só a parte da imagem
function parseQrCode(raw: string): string {
  return raw.split('|')[0] ?? raw;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface EvolutionGoConfig {
  baseUrl: string;
  apiKey: string;
  defaultInstanceToken?: string;
  timeout?: number;
}

interface InstanceCache {
  token: string;
  webhookUrl?: string;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export class EvolutionGoProvider implements WhatsAppProvider {
  readonly name = 'evolution-go';
  private adminHttp: AxiosInstance;
  private cache: Map<string, InstanceCache> = new Map();

  constructor(private config: EvolutionGoConfig) {
    this.adminHttp = this.makeHttp(config.apiKey);
    if (config.defaultInstanceToken) {
      this.cache.set('__default__', { token: config.defaultInstanceToken });
    }
  }

  private makeHttp(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseUrl.replace(/\/$/, ''),
      timeout: this.config.timeout ?? 30_000,
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    });
  }

  setInstanceToken(instanceName: string, token: string, webhookUrl?: string): void {
    this.cache.set(instanceName, { token, webhookUrl });
  }

  private instanceHttp(instanceName: string): AxiosInstance {
    const cached = this.cache.get(instanceName) ?? this.cache.get('__default__');
    if (!cached) {
      throw new Error(
        `Evolution Go: nenhum token para "${instanceName}". Defina EVOLUTION_INSTANCE_TOKEN.`,
      );
    }
    return this.makeHttp(cached.token);
  }

  // ─── Instance Lifecycle ───────────────────────────────────────────────────

  async createInstance(cfg: InstanceConfig): Promise<InstanceInfo> {
    const token = cfg.token ?? randomUUID();
    const { data } = await this.adminHttp.post<EvoGoResponse<EvoGoInstance>>('/instance/create', {
      name: cfg.instanceName,
      token,
    });

    this.cache.set(cfg.instanceName, { token, webhookUrl: cfg.webhookUrl });

    return {
      instanceName: data.data.name,
      status: { connected: false, state: 'close' },
      token,
    };
  }

  async deleteInstance(instanceName: string): Promise<void> {
    const { data } = await this.adminHttp.get<EvoGoResponse<EvoGoInstance[]>>('/instance/all');
    const instance = (data.data ?? []).find((i) => i.name === instanceName);
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
    await this.instanceHttp(instanceName).delete('/instance/logout');
  }

  async getInstanceStatus(instanceName: string): Promise<InstanceStatus> {
    const { data } = await this.instanceHttp(instanceName)
      .get<EvoGoResponse<EvoGoStatus>>('/instance/status');

    const connected = (data.data.Connected && data.data.LoggedIn) ?? false;
    const jid = data.data.Name ?? '';
    return {
      connected,
      state: connected ? 'open' : 'close',
      phoneNumber: jid ? jidToPhone(jid) : undefined,
    };
  }

  async getQRCode(instanceName: string): Promise<QRCodeResult> {
    // Tenta /instance/qr primeiro; se vazio, busca do campo qrcode em /instance/all
    const { data } = await this.instanceHttp(instanceName)
      .get<EvoGoResponse<{ qrcode?: string }>>('/instance/qr');

    let raw = data.data?.qrcode;

    if (!raw) {
      const { data: all } = await this.adminHttp
        .get<EvoGoResponse<EvoGoInstance[]>>('/instance/all');
      raw = (all.data ?? []).find((i) => i.name === instanceName)?.qrcode;
    }

    if (!raw) throw new Error(`QR code não disponível para "${instanceName}"`);

    return { qrCode: parseQrCode(raw) };
  }

  async listInstances(): Promise<InstanceInfo[]> {
    const { data } = await this.adminHttp.get<EvoGoResponse<EvoGoInstance[]>>('/instance/all');
    return (data.data ?? []).map((item) => ({
      instanceName: item.name,
      status: {
        connected: item.connected ?? false,
        state: (item.connected ? 'open' : 'close') as InstanceStatus['state'],
      },
    }));
  }

  // ─── Messaging ────────────────────────────────────────────────────────────

  async sendText(instanceName: string, to: string, body: string): Promise<SendResult> {
    const { data } = await this.instanceHttp(instanceName)
      .post<EvoGoResponse<{ id?: string; ID?: string }>>('/send/text', {
        number: phoneToJid(to),
        text: body,
      });

    return {
      messageId: data.data?.id ?? data.data?.ID ?? `evo-${Date.now()}`,
      timestamp: new Date(),
      status: 'sent',
    };
  }

  async sendMedia(instanceName: string, to: string, media: MediaPayload): Promise<SendResult> {
    const isBase64 = !media.data.startsWith('http');
    const { data } = await this.instanceHttp(instanceName)
      .post<EvoGoResponse<{ id?: string; ID?: string }>>('/send/media', {
        number: phoneToJid(to),
        type: media.mimetype.split('/')[0],
        caption: media.caption ?? '',
        filename: media.fileName,
        ...(isBase64
          ? { base64: media.data, mimetype: media.mimetype }
          : { url: media.data }),
      });

    return {
      messageId: data.data?.id ?? data.data?.ID ?? `evo-media-${Date.now()}`,
      timestamp: new Date(),
      status: 'sent',
    };
  }

  async sendTemplate(_instanceName: string, _to: string, _tpl: TemplatePayload): Promise<SendResult> {
    throw new Error('Use WhatsAppService.sendTemplate — resolve o template antes de chamar o provider');
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
      const state: InstanceStatus['state'] = data.Connected ? 'open' : 'close';
      return {
        type: 'connection_update',
        instanceName,
        data: { connectionState: state, raw: rawBody },
        timestamp,
      };
    }

    if (eventType === 'message_received' && !data.FromMe) {
      const jid = data.Chat ?? data.Sender ?? '';
      return {
        type: 'message_received',
        instanceName,
        data: {
          from: jid,
          fromPhone: jid ? jidToPhone(jid) : undefined,
          profileName: data.PushName,
          body: extractMessageText(data.Message as Record<string, unknown> | string | undefined),
          messageId: data.ID,
          raw: rawBody,
        },
        timestamp,
      };
    }

    return { type: 'unknown', instanceName, data: { raw: rawBody }, timestamp };
  }
}
