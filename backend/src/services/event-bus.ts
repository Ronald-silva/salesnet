/**
 * Event Bus
 *
 * Sistema de eventos desacoplado que substitui e estende o message-bus.ts.
 * Compatível com o message-bus existente (onIncomingMessage / emitIncomingMessage).
 * Preparado para integração futura com Redis/BullMQ (enqueue method).
 */

import { EventEmitter } from 'events';
import { env } from '../config/env';

// ─── Tipos de Eventos ─────────────────────────────────────────────────────────

export type EventType =
  | 'whatsapp.message.received'
  | 'whatsapp.message.sent'
  | 'whatsapp.message.delivered'
  | 'whatsapp.message.read'
  | 'whatsapp.connection.update'
  | 'whatsapp.qrcode.update'
  | 'billing.payment.confirmed'
  | 'billing.invoice.overdue'
  | 'support.ticket.created'
  | 'ai.response.generated';

export interface DomainEvent<T = unknown> {
  id: string;
  type: EventType;
  tenantId: string;
  instanceName?: string;
  payload: T;
  timestamp: Date;
}

export interface WhatsAppMessagePayload {
  phone: string;
  body: string;
  profileName?: string;
  messageId?: string;
}

// ─── Compat com message-bus.ts ────────────────────────────────────────────────

export interface IncomingMessage {
  phone: string;
  body: string;
  tenantId: string;
  profileName?: string;
  messageId?: string;
}

// ─── Event Bus ────────────────────────────────────────────────────────────────

class EventBus extends EventEmitter {
  // ── Compat API (message-bus.ts) ──

  /** Compatibilidade retroativa com message-bus.ts */
  onIncomingMessage(handler: (msg: IncomingMessage) => void): void {
    this.on('whatsapp.message.received', (event: DomainEvent<WhatsAppMessagePayload>) => {
      handler({
        phone: event.payload.phone,
        body: event.payload.body,
        tenantId: event.tenantId,
        profileName: event.payload.profileName,
        messageId: event.payload.messageId,
      });
    });
  }

  /** Compatibilidade retroativa com message-bus.ts */
  emitIncomingMessage(msg: IncomingMessage, tenantId?: string): void {
    const resolvedTenantId = tenantId ?? msg.tenantId ?? 'default';
    this.emitEvent({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'whatsapp.message.received',
      tenantId: resolvedTenantId,
      payload: { ...msg, tenantId: resolvedTenantId },
      timestamp: new Date(),
    });
  }

  // ── New Event API ──

  /** Registra handler para um tipo de evento */
  onEvent<T>(type: EventType, handler: (event: DomainEvent<T>) => void): void {
    this.on(type, handler);
  }

  /** Emite um evento de domínio */
  emitEvent<T>(event: DomainEvent<T>): void {
    this.emit(event.type, event);
    // Log detalhado em dev
    if (env.NODE_ENV !== 'production') {
      console.debug(`[event-bus] ${event.type} tenant=${event.tenantId} instance=${event.instanceName ?? '-'}`);
    }
  }

  /**
   * Enfileira evento para processamento assíncrono.
   * Por ora usa EventEmitter diretamente.
   * Futuro: integrar BullMQ/Redis aqui sem mudar a API.
   */
  async enqueue<T>(event: DomainEvent<T>): Promise<void> {
    // TODO Fase 2: this.queue.add(event.type, event)
    this.emitEvent(event);
  }
}

export const eventBus = new EventBus();

// Aumentar max listeners (múltiplos handlers por evento)
eventBus.setMaxListeners(50);
