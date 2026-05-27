/**
 * WhatsApp Provider Abstraction Layer
 *
 * Desacopla o sistema de qualquer provider específico (Evolution Go, Twilio, etc).
 * Para adicionar um novo provider: implemente esta interface e registre no ProviderRegistry.
 */

// ─── Instance Management ─────────────────────────────────────────────────────

export interface InstanceConfig {
  /** Nome único da instância no provider */
  instanceName: string;
  /** URL do webhook que o provider vai chamar */
  webhookUrl?: string;
  /** ID do tenant (empresa/provedor) dono desta instância */
  tenantId: string;
  /** Número WhatsApp (opcional, preenchido após conexão) */
  phoneNumber?: string;
  /** Se true, já retorna QR code na criação */
  qrcode?: boolean;
  /** Token de autenticação por instância (Evolution Go) */
  token?: string;
}

export interface InstanceInfo {
  instanceName: string;
  status: InstanceStatus;
  qrCode?: string;
  pairingCode?: string;
  /** Token retornado na criação (Evolution Go) */
  token?: string;
}

export interface InstanceStatus {
  connected: boolean;
  state: 'open' | 'close' | 'connecting';
  phoneNumber?: string;
  lastSeen?: Date;
}

export interface QRCodeResult {
  qrCode: string;        // base64 ou URL
  pairingCode?: string;  // código numérico alternativo
  expiresAt?: Date;
}

export interface ConnectionResult {
  success: boolean;
  qrCode?: string;
  pairingCode?: string;
  message?: string;
}

// ─── Messaging ───────────────────────────────────────────────────────────────

export interface SendResult {
  messageId: string;
  timestamp: Date;
  status: 'queued' | 'sent' | 'error';
}

export interface MediaPayload {
  mimetype: string;
  /** URL pública ou base64 */
  data: string;
  caption?: string;
  fileName?: string;
}

export interface TemplatePayload {
  templateName: string;
  variables: Record<string, string>;
  language?: string;
}

// ─── Webhook Events ───────────────────────────────────────────────────────────

export type WebhookEventType =
  | 'message_received'
  | 'message_sent'
  | 'message_delivered'
  | 'message_read'
  | 'message_deleted'
  | 'connection_update'
  | 'qrcode_update'
  | 'unknown';

export interface ParsedWebhookEvent {
  type: WebhookEventType;
  instanceName: string;
  data: {
    /** Número do remetente (format: 5585999990000@s.whatsapp.net) */
    from?: string;
    /** Número normalizado E.164 (+5585999990000) */
    fromPhone?: string;
    /** Nome do remetente no WhatsApp */
    profileName?: string;
    /** Corpo da mensagem */
    body?: string;
    /** ID da mensagem */
    messageId?: string;
    /** Mídia (se houver) */
    media?: {
      mimetype: string;
      url?: string;
      caption?: string;
    };
    /** Status de conexão */
    connectionState?: InstanceStatus['state'];
    /** QR code (evento qrcode_update) */
    qrCode?: string;
    /** Payload bruto original */
    raw: unknown;
  };
  timestamp: Date;
}

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface WhatsAppProvider {
  /** Identificador único do provider */
  readonly name: string;

  // ── Instance lifecycle ──

  createInstance(config: InstanceConfig): Promise<InstanceInfo>;
  deleteInstance(instanceName: string): Promise<void>;
  connectInstance(instanceName: string): Promise<ConnectionResult>;
  disconnectInstance(instanceName: string): Promise<void>;
  getInstanceStatus(instanceName: string): Promise<InstanceStatus>;
  getQRCode(instanceName: string): Promise<QRCodeResult>;
  listInstances(): Promise<InstanceInfo[]>;

  // ── Messaging ──

  sendText(instanceName: string, to: string, body: string): Promise<SendResult>;
  sendMedia(instanceName: string, to: string, media: MediaPayload): Promise<SendResult>;
  sendTemplate(instanceName: string, to: string, tpl: TemplatePayload): Promise<SendResult>;

  // ── Webhook ──

  /** Valida autenticidade do payload (assinatura, API key, etc) */
  validateWebhook(rawBody: unknown, headers: Record<string, string>): boolean;
  /** Transforma payload bruto em evento normalizado (pode fazer I/O para transcrição/visão) */
  parseWebhook(rawBody: unknown, headers: Record<string, string>): Promise<ParsedWebhookEvent>;
}
