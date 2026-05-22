/**
 * Rate Limiter — Anti-Ban WhatsApp
 *
 * Controla volume de mensagens por instância para evitar banimento.
 * Implementa:
 *  - Limites por minuto/hora/dia
 *  - Delays humanizados (aleatórios) entre mensagens
 *  - Período de warmup (primeiros dias após conexão)
 */

import { supabase } from '../config/supabase';

interface RateLimitConfig {
  messagesPerMinute: number;
  messagesPerHour: number;
  messagesPerDay: number;
  /** Delay mínimo em ms entre mensagens */
  minDelayMs: number;
  /** Delay máximo em ms entre mensagens */
  maxDelayMs: number;
  /** Dias de warmup após nova conexão */
  warmupDays: number;
  /** Limite diário durante warmup */
  warmupDailyLimit: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  messagesPerMinute:  20,
  messagesPerHour:    200,
  messagesPerDay:     1_000,
  minDelayMs:         1_500,
  maxDelayMs:         5_000,
  warmupDays:         7,
  warmupDailyLimit:   50,
};

/** Contadores em memória por instância (complementa o banco) */
const inMemoryCounters = new Map<string, {
  minuteCount: number;
  minuteWindowStart: number;
  hourCount: number;
  hourWindowStart: number;
}>();

function getCounters(instanceName: string) {
  if (!inMemoryCounters.has(instanceName)) {
    const now = Date.now();
    inMemoryCounters.set(instanceName, {
      minuteCount: 0,
      minuteWindowStart: now,
      hourCount: 0,
      hourWindowStart: now,
    });
  }
  return inMemoryCounters.get(instanceName)!;
}

class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Gera delay humanizado aleatório entre min e max */
  getHumanizedDelay(): number {
    const { minDelayMs, maxDelayMs } = this.config;
    return Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
  }

  /** Verifica se pode enviar (checa limites em memória) */
  canSend(instanceName: string): boolean {
    const c = getCounters(instanceName);
    const now = Date.now();

    // Reset janela de 1 minuto
    if (now - c.minuteWindowStart > 60_000) {
      c.minuteCount = 0;
      c.minuteWindowStart = now;
    }

    // Reset janela de 1 hora
    if (now - c.hourWindowStart > 3_600_000) {
      c.hourCount = 0;
      c.hourWindowStart = now;
    }

    return (
      c.minuteCount < this.config.messagesPerMinute &&
      c.hourCount < this.config.messagesPerHour
    );
  }

  /** Registra envio nos contadores */
  recordSend(instanceName: string): void {
    const c = getCounters(instanceName);
    c.minuteCount++;
    c.hourCount++;
  }

  /**
   * Aguarda delay humanizado, verifica limite e executa fn.
   * Loga o envio no banco para controle diário.
   */
  async waitAndSend<T>(instanceName: string, fn: () => Promise<T>): Promise<T> {
    // Aguardar delay humanizado
    const delay = this.getHumanizedDelay();
    await new Promise((resolve) => setTimeout(resolve, delay));

    // Verificar limite em memória
    if (!this.canSend(instanceName)) {
      throw new Error(`Rate limit exceeded for instance ${instanceName}`);
    }

    const result = await fn();
    this.recordSend(instanceName);

    // Registrar no banco (para controle diário e observabilidade)
    this.logSendAsync(instanceName);

    return result;
  }

  private logSendAsync(instanceName: string): void {
    supabase
      .from('whatsapp_send_log')
      .insert({ instance_name: instanceName, sent_at: new Date().toISOString() })
      .then(({ error }) => {
        if (error) console.error('[rate-limiter] log error:', error.message);
      });
  }

  /** Verifica quantas msgs foram enviadas hoje por esta instância */
  async getDailyCount(instanceName: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count } = await supabase
      .from('whatsapp_send_log')
      .select('id', { count: 'exact', head: true })
      .eq('instance_name', instanceName)
      .gte('sent_at', todayStart.toISOString());

    return count ?? 0;
  }

  /** Verifica se instância está em período de warmup */
  async isInWarmup(instanceName: string, connectedAt: Date): Promise<boolean> {
    const daysSinceConnection =
      (Date.now() - connectedAt.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceConnection < this.config.warmupDays;
  }
}

export const rateLimiter = new RateLimiter();
export { RateLimiter };
