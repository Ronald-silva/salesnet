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
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { env } from '../../../config/env';
import { normalizePhone, phoneFromWhatsAppJid, toWhatsAppSendDigits } from '../../../lib/phone';
import { transcribeAudio } from '../../../agent/transcribe';
import { analyzeImage, formatImageBody } from '../../../agent/vision';
import {
  detectMediaType,
  fetchAndDecryptWAMedia,
  extractBase64FromResponse,
  pickField,
  type DecryptedMedia,
  type WAMediaType,
} from '../media-download';
import { secretFingerprint } from '../webhook-hmac-diagnostics';
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
  instanceToken?: string;
  data?: {
    // Message events: metadata nested under Info
    Info?: {
      ID?: string;
      Timestamp?: string;   // ISO date string e.g. "2026-05-26T22:40:36-03:00"
      Chat?: string;        // JID e.g. "558591993833@s.whatsapp.net"
      Sender?: string;
      PushName?: string;
      IsFromMe?: boolean;
      IsGroup?: boolean;
      Type?: string;
    };
    // Message events: message body at data.Message
    Message?: Record<string, unknown> | string;
    // Connection/QR events
    qrcode?: string;
    code?: string;
    state?: string;
    Connected?: boolean;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function phoneToJid(phone: string): string {
  const digits = toWhatsAppSendDigits(phone);
  if (!digits) {
    throw new Error(`invalid WhatsApp number for send: ${phone}`);
  }
  return `${digits}@s.whatsapp.net`;
}

function mapEventType(event: string): WebhookEventType {
  switch (event.toUpperCase()) {
    case 'MESSAGE':     return 'message_received';
    case 'CONNECTION':  return 'connection_update';
    case 'QRCODE':      return 'qrcode_update';
    default:            return 'unknown';
  }
}

// QR code vem como "data:image/png;base64,...|rawCode" — retorna só a parte da imagem
function parseQrCode(raw: string): string {
  return raw.split('|')[0] ?? raw;
}

/** Secrets tried for x-webhook-signature (Evolution may use webhook secret, instance token, or global API key). */
function evolutionWebhookSecrets(extra?: string[]): string[] {
  const out: string[] = [];
  const add = (value: string | undefined): void => {
    if (value && !out.includes(value)) out.push(value);
  };
  add(env.EVOLUTION_WEBHOOK_SECRET);
  add(env.EVOLUTION_INSTANCE_TOKEN);
  add(env.EVOLUTION_API_KEY);
  for (const value of extra ?? []) add(value);
  return out;
}

function preferredWebhookSecret(): string | undefined {
  return env.EVOLUTION_WEBHOOK_SECRET ?? env.EVOLUTION_INSTANCE_TOKEN;
}

function headersLower(headers: Record<string, string>): Record<string, string> {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    lower[key.toLowerCase()] = value;
  }
  return lower;
}

function getWebhookSignatureHeader(headers: Record<string, string>): string {
  const lower = headersLower(headers);
  return (
    lower['x-webhook-signature'] ??
    lower['x-signature'] ??
    lower['signature'] ??
    ''
  );
}

function getApiKeyHeader(headers: Record<string, string>): string {
  const lower = headersLower(headers);
  return lower['apikey'] ?? lower['api-key'] ?? '';
}

function secretMatchesValue(secrets: string[], value: string): boolean {
  if (!value) return false;
  for (const secret of secrets) {
    try {
      const a = Buffer.from(secret, 'utf8');
      const b = Buffer.from(value, 'utf8');
      if (a.byteLength === b.byteLength && timingSafeEqual(a, b)) return true;
    } catch {
      /* length mismatch */
    }
  }
  return false;
}

function bodyInstanceTokenMatches(rawBody: Buffer, secrets: string[]): boolean {
  try {
    const body = JSON.parse(rawBody.toString('utf8')) as { instanceToken?: string };
    if (typeof body.instanceToken === 'string' && body.instanceToken.length > 0) {
      return secretMatchesValue(secrets, body.instanceToken);
    }
  } catch {
    /* not JSON */
  }
  return false;
}

function hmacSha256Matches(rawBody: Buffer, secret: string, rawSignature: string): boolean {
  const trimmed = rawSignature.trim();
  const candidates = new Set<string>([trimmed]);
  if (trimmed.startsWith('sha256=')) {
    candidates.add(trimmed.slice(7));
  }

  const expectedHex = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBin = createHmac('sha256', secret).update(rawBody).digest();
  const expectedB64 = createHmac('sha256', secret).update(rawBody).digest('base64');

  candidates.add(`sha256=${expectedHex}`);
  candidates.add(expectedHex);
  candidates.add(expectedB64);

  for (const sig of candidates) {
    if (!sig) continue;
    try {
      const a = Buffer.from(expectedHex, 'utf8');
      const b = Buffer.from(sig, 'utf8');
      if (a.byteLength === b.byteLength && timingSafeEqual(a, b)) return true;
    } catch { /* try next encoding */ }
    try {
      const b = Buffer.from(sig, 'hex');
      if (expectedBin.byteLength === b.byteLength && timingSafeEqual(expectedBin, b)) return true;
    } catch { /* try next encoding */ }
    try {
      const a = Buffer.from(expectedB64, 'utf8');
      const b = Buffer.from(sig, 'utf8');
      if (a.byteLength === b.byteLength && timingSafeEqual(a, b)) return true;
    } catch { /* try next encoding */ }
  }

  try {
    const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
    const normalized = Buffer.from(JSON.stringify(parsed));
    if (!normalized.equals(rawBody)) {
      return hmacSha256Matches(normalized, secret, rawSignature);
    }
  } catch {
    /* not JSON */
  }

  return false;
}

let lastHmacDebugAt = 0;

function logHmacDebug(
  headers: Record<string, string>,
  rawSig: string,
  rawBody: Buffer,
  secrets: string[],
): void {
  const now = Date.now();
  if (now - lastHmacDebugAt < 60_000) return;
  lastHmacDebugAt = now;

  const sigHeaders = Object.keys(headers).filter((k) =>
    /sign|hmac|webhook/i.test(k),
  );
  const sigPreview = rawSig.length > 32 ? `${rawSig.slice(0, 32)}...` : rawSig;
  console.warn(
    `[webhook-hmac] debug: sigHeaders=[${sigHeaders.join(', ')}] sigLen=${rawSig.length} ` +
      `sigPreview=${sigPreview} bodyBytes=${rawBody.length} secretsTried=${secrets.length} ` +
      `fps=${secrets.map((s) => secretFingerprint(s)).join(',')}`,
  );
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

    const webhookSecret = preferredWebhookSecret();
    if (webhookSecret) {
      console.log(
        `[evolution-go] connectInstance webhookSecret fp=${secretFingerprint(webhookSecret)} len=${webhookSecret.length}`,
      );
    } else {
      console.warn('[evolution-go] connectInstance: no webhookSecret — Evolution may not sign webhooks');
    }
    await http.post('/instance/connect', {
      webhookUrl: cached?.webhookUrl ?? '',
      ...(webhookSecret ? { webhookSecret } : {}),
      subscribe: ['ALL'],
      immediate: true,
    });

    return { success: true };
  }

  /** Logs webhook URL registered in Evolution (admin API). Does not expose webhook secret. */
  async logRemoteWebhookConfig(instanceName: string): Promise<void> {
    try {
      const { data } = await this.adminHttp.get<EvoGoResponse<EvoGoInstance[]>>('/instance/all');
      const inst = (data.data ?? []).find((i) => i.name === instanceName);
      if (!inst) {
        console.warn(`[webhook-hmac] instance "${instanceName}" not found in Evolution /instance/all`);
        return;
      }
      console.log(
        `[webhook-hmac] Evolution registered webhook URL: ${inst.webhook || '(empty)'}`,
      );
      console.log(`[webhook-hmac] Evolution instance connected: ${inst.connected ?? false}`);
    } catch (err) {
      console.warn('[webhook-hmac] could not read Evolution /instance/all:', (err as Error).message);
    }
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
      phoneNumber: jid ? normalizePhone(jid) : undefined,
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

  validateWebhook(
    rawBody: unknown,
    headers: Record<string, string>,
    options?: { extraSecrets?: string[] },
  ): boolean {
    if (env.EVOLUTION_WEBHOOK_SKIP_HMAC === true) {
      console.warn(
        '[webhook] EVOLUTION_WEBHOOK_SKIP_HMAC=true — HMAC validation disabled (temporary only)',
      );
      return true;
    }

    const secrets = evolutionWebhookSecrets(options?.extraSecrets);
    if (secrets.length === 0) return true;
    if (!(rawBody instanceof Buffer)) return true;

    const rawSig = getWebhookSignatureHeader(headers);

    // Evolution Go (Foundation) usually does NOT send x-webhook-signature on outbound webhooks.
    if (!rawSig) {
      const apikey = getApiKeyHeader(headers);
      if (apikey) {
        if (secretMatchesValue(secrets, apikey)) return true;
        console.warn('[webhook] apikey header present but does not match configured secrets');
        return false;
      }
      if (bodyInstanceTokenMatches(rawBody, secrets)) return true;
      return true;
    }

    const matched = secrets.find((secret) => hmacSha256Matches(rawBody, secret, rawSig));
    if (!matched) {
      logHmacDebug(headers, rawSig, rawBody, secrets);
      const sigPreview = rawSig.length > 24 ? `${rawSig.slice(0, 24)}...` : rawSig;
      console.warn(
        `[webhook] Invalid HMAC (tried ${secrets.length} secret(s); sig=${sigPreview}, ` +
          `bodyBytes=${rawBody.length}).`,
      );
      return false;
    }

    return true;
  }

  async parseWebhook(rawBody: unknown, _headers: Record<string, string>): Promise<ParsedWebhookEvent> {
    const body = rawBody as EvoGoWebhookPayload;
    const event = body.event ?? '';
    const eventType: WebhookEventType = mapEventType(event);
    const instanceName = body.instanceName ?? '';
    const data = body.data ?? {};

    // Evolution Go nests message metadata under data.Info in some versions;
    // other versions (or media events) put fields directly on data.
    const info = data.Info ?? {};
    const chatJid   = info.Chat     ?? (data as unknown as { Chat?: string }).Chat     ?? '';
    const senderJid = info.Sender   ?? (data as unknown as { Sender?: string }).Sender ?? '';
    const pushName  = info.PushName ?? (data as unknown as { PushName?: string }).PushName;
    const msgId     = info.ID       ?? (data as unknown as { ID?: string }).ID;
    const isFromMe  = info.IsFromMe ?? (data as unknown as { IsFromMe?: boolean }).IsFromMe ?? false;
    const rawTs     = info.Timestamp ?? (data as unknown as { Timestamp?: string }).Timestamp;
    const timestamp = rawTs ? new Date(rawTs) : new Date();

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

    if (eventType === 'message_received' && !isFromMe) {
      const jid = senderJid || chatJid;
      const msg = data.Message as Record<string, unknown> | undefined;
      const msgType = info.Type ?? '';

      const messageBody = await this.resolveMessageBody(msgType, msg, instanceName);

      return {
        type: 'message_received',
        instanceName,
        data: {
          from: jid,
          fromPhone: jid ? phoneFromWhatsAppJid(jid) ?? undefined : undefined,
          profileName: pushName,
          body: messageBody,
          messageId: msgId,
          raw: rawBody,
        },
        timestamp,
      };
    }

    return { type: 'unknown', instanceName, data: { raw: rawBody }, timestamp };
  }

  // ─── Media resolution ──────────────────────────────────────────────────────

  /** Converte a Message proto recebida em texto processável pelo agente. */
  private async resolveMessageBody(
    msgType: string,
    msg: Record<string, unknown> | undefined,
    instanceName: string,
  ): Promise<string | undefined> {
    if (!msg) return undefined;

    const conversation = msg['conversation'] as string | undefined;
    if (conversation) return conversation;
    const extended = (msg['extendedTextMessage'] as Record<string, unknown> | undefined)?.text as
      | string
      | undefined;
    if (extended) return extended;

    const detected = detectMediaType(msg);
    if (!detected) {
      // Sem mídia conhecida e sem texto — pode ser sticker, reação, etc.
      return `[mensagem do tipo ${msgType || 'desconhecido'} não suportada — responda pedindo para enviar em texto]`;
    }

    const { type, media } = detected;
    const caption = pickField(media, ['caption', 'Caption']) as string | undefined;

    if (type === 'image') {
      const decrypted = await this.downloadMedia(type, media, msg, instanceName);
      if (decrypted) {
        const analysis = await analyzeImage(decrypted);
        const body = formatImageBody(analysis, caption);
        console.log(`[media] image resolved (${decrypted.buffer.length} bytes): ${body.slice(0, 120)}`);
        return body;
      }
      const fallback = caption ? `[imagem] ${caption}` : '[imagem não processada]';
      console.warn(`[media] image download failed; caption=${caption ?? '-'}`);
      return fallback;
    }

    if (type === 'audio') {
      const decrypted = await this.downloadMedia(type, media, msg, instanceName);
      if (decrypted) {
        const transcript = await transcribeAudio(decrypted);
        const body = `[áudio] ${transcript}`;
        console.log(`[media] audio resolved (${decrypted.buffer.length} bytes): ${body.slice(0, 120)}`);
        return body;
      }
      console.warn('[media] audio download/decrypt failed');
      return '[áudio não processado — peça ao cliente para reenviar ou escrever]';
    }

    if (type === 'video') {
      return caption
        ? `[vídeo] ${caption}`
        : '[vídeo recebido — não consigo assistir; peça ao cliente para descrever por texto]';
    }

    // document
    const fileName = pickField(media, ['fileName', 'title', 'Title']) as string | undefined;
    return `[documento recebido${fileName ? `: ${fileName}` : ''} — peça as informações por texto se precisar]`;
  }

  /**
   * Obtém os bytes da mídia. Estratégia: (1) baixa o `.enc` e descriptografa
   * localmente (funciona pra todos os tipos); (2) fallback só pra imagem via
   * `/message/downloadimage` do Evolution Go (server-side).
   */
  private async downloadMedia(
    type: WAMediaType,
    media: Record<string, unknown>,
    fullMessage: Record<string, unknown>,
    instanceName: string,
  ): Promise<DecryptedMedia | null> {
    try {
      const result = await fetchAndDecryptWAMedia(media, type);
      if (result && result.buffer.length > 0) return result;
    } catch (err) {
      console.warn(`[media] client-side download/decrypt failed (${type}):`, err);
    }

    if (type === 'image') {
      try {
        const { data } = await this.instanceHttp(instanceName).post<unknown>(
          '/message/downloadimage',
          { message: fullMessage },
        );
        const b64 = extractBase64FromResponse(data);
        if (b64) {
          const mimetype = (pickField(media, ['mimetype', 'Mimetype']) as string) ?? 'image/jpeg';
          return { buffer: Buffer.from(b64, 'base64'), mimetype };
        }
      } catch (err) {
        console.warn('[media] /message/downloadimage fallback failed:', err);
      }
    }

    console.warn(
      `[media] could not obtain ${type} media; available fields: [${Object.keys(media).join(', ')}]`,
    );
    return null;
  }
}
