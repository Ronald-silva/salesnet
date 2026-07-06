import { Router } from 'express';
import axios from 'axios';
import { supabase } from '../config/supabase';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { getCustomerByPhone, getCustomerById, getCurrentInvoice, getCustomerByCpf, generatePixKey } from '../integrations/sgp';
import type { Customer, Invoice } from '../integrations/sgp';
import { redactSensitiveFields } from '../integrations/sgp';
import { whatsappService } from '../services/whatsapp-service';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';
import { EvolutionGoProvider } from '../integrations/whatsapp/providers/evolution-go';
import { env } from '../config/env';
import { adminTenantIds } from '../lib/admin-tenant';
import { getSkillConfig, clearSkillConfigCache } from '../agent/skill';
import type { ISPSkillConfig } from '../agent/skill/types';
import { respondSupabaseQueryError } from '../lib/supabase-query-error';
import { calculateUrgencyScore, urgencyReasons, type UrgencyFactors } from '../lib/urgency-score';

export const adminRouter = Router();

// Rate limit para o endpoint de sugestão do copiloto (1 por conversa a cada 10s)
const suggestRateLimit = new Map<string, number>();

const COPILOT_SYSTEM = `Você é um assistente de atendimento da SalesNet Telecom.
Sugira UMA resposta curta e direta para o atendente humano enviar ao cliente.

Regras da sugestão:
- Máximo 3 frases
- Tom humano e cordial (não robótico)
- Se fatura vencida: priorizar regularização, oferecer PIX
- Se problema técnico: confirmar abertura de chamado, dar protocolo
- Se dúvida de plano: informar com clareza, não pressionar upgrade
- NUNCA prometer prazo de resolução que não pode cumprir
- Responda APENAS o texto da mensagem sugerida, sem explicação`;

interface ConversationThread {
  id: string;
  phone: string;
  tenant_id: string;
  messages: unknown[];
  human_mode: boolean;
  churn_risk: boolean;
  notes: string | null;
  cpf: string | null;
  status: 'active' | 'waiting' | 'closed';
  starred: boolean;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

function adminTenantId(): string {
  return env.DEFAULT_TENANT_ID;
}

async function getThreadForAdmin(id: string | string[]): Promise<ConversationThread | null> {
  const { data, error } = await supabase
    .from('conversation_threads')
    .select('*')
    .eq('id', String(id))
    .in('tenant_id', adminTenantIds())
    .single();
  if (error || !data) return null;
  return data as ConversationThread;
}

// ── SGP customer in-memory cache (5-minute TTL) ───────────────────────────────
interface CacheEntry<T> { value: T; expiresAt: number }
const sgpCache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = sgpCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    sgpCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function cacheSet<T>(key: string, value: T, ttlMs = 5 * 60 * 1000): void {
  sgpCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function cachedCustomerByPhone(phone: string): Promise<Customer> {
  const key = `customer:${phone}`;
  const cached = cacheGet<Customer>(key);
  if (cached) return cached;
  const customer = await getCustomerByPhone(phone);
  if (!('error' in customer)) cacheSet(key, customer);
  return customer;
}
// ─────────────────────────────────────────────────────────────────────────────

/** Strip SGP portal credentials before sending customer data to the admin UI. */
function safeCustomer(c: Customer | null | undefined): Omit<Customer, 'contratoCentralLogin' | 'contratoCentralSenha'> | null {
  if (!c) return null;
  return redactSensitiveFields(c);
}

function getThreadLastText(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const last = messages[messages.length - 1] as { content?: string };
  return last?.content ?? '';
}

function getThreadLastSource(messages: unknown): 'user' | 'assistant' | 'human' | null {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const last = messages[messages.length - 1] as { role?: string; source?: string };
  if (last?.role === 'user') return 'user';
  if (last?.source === 'human') return 'human';
  if (last?.role === 'assistant') return 'assistant';
  return null;
}

function calcInvoiceDaysOverdue(invoice: { status: string; dueDate: string } | null): number {
  if (!invoice) return 0;
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return 0;
  const due = new Date(invoice.dueDate);
  const now = new Date();
  if (due >= now) return 0;
  return Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

function getMinutesSinceLastUserMessage(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string; timestamp?: string };
    if (msg.role === 'user' && msg.timestamp) {
      return Math.floor((Date.now() - new Date(msg.timestamp).getTime()) / 60_000);
    }
  }
  return 0;
}

function getFortalezaTodayStart(): string {
  // Fortaleza = UTC-3, sem DST
  const now = new Date();
  const fortalezaNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const todayStart = new Date(
    fortalezaNow.getUTCFullYear(),
    fortalezaNow.getUTCMonth(),
    fortalezaNow.getUTCDate(),
  );
  return new Date(todayStart.getTime() + 3 * 60 * 60 * 1000).toISOString();
}

function resolveRole(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const data = raw as { app_metadata?: { role?: string }; user_metadata?: { role?: string } };
  return data.app_metadata?.role ?? data.user_metadata?.role;
}

adminRouter.post('/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  let data: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['data'];
  let error: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>['error'];
  try {
    ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
  } catch (err) {
    console.error('[admin/login] supabase.auth error:', err);
    res.status(500).json({ error: 'auth service unavailable' });
    return;
  }

  if (error || !data.session || !data.user) {
    console.warn('[admin/login] auth failed:', error?.message);
    res.status(401).json({ error: 'invalid credentials' });
    return;
  }

  const role = resolveRole(data.user);
  if (role !== 'admin') {
    res.status(403).json({ error: 'admin role required' });
    return;
  }

  res.status(200).json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      role,
    },
  });
});

adminRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: 'refreshToken is required' });
    return;
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    res.status(401).json({ error: 'invalid or expired refresh token' });
    return;
  }

  const role = resolveRole(data.user);
  if (role !== 'admin') {
    res.status(403).json({ error: 'admin role required' });
    return;
  }

  res.status(200).json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
});

adminRouter.use(adminAuthMiddleware);

adminRouter.get('/conversations/stats', async (_req, res) => {
  const todayStart = getFortalezaTodayStart();
  const tenantIds = adminTenantIds();

  const [humanRes, waitingRes, botRes, totalRes, closedTodayRes, starredRes] = await Promise.all([
    supabase
      .from('conversation_threads')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .eq('human_mode', true)
      .neq('status', 'closed'),
    supabase
      .from('conversation_threads')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .eq('status', 'waiting'),
    supabase
      .from('conversation_threads')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .eq('human_mode', false)
      .eq('status', 'active'),
    supabase
      .from('conversation_threads')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .neq('status', 'closed'),
    supabase
      .from('conversation_threads')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .eq('status', 'closed')
      .gte('closed_at', todayStart),
    supabase
      .from('conversation_threads')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .eq('starred', true)
      .neq('status', 'closed'),
  ]);

  if (humanRes.error ?? waitingRes.error ?? botRes.error ?? totalRes.error) {
    res.status(500).json({ error: 'failed to load stats' });
    return;
  }

  res.status(200).json({
    human: humanRes.count ?? 0,
    waiting: waitingRes.count ?? 0,
    bot: botRes.count ?? 0,
    total: totalRes.count ?? 0,
    closedToday: closedTodayRes.count ?? 0,
    starred: starredRes.count ?? 0,
  });
});

adminRouter.get('/conversations', async (req, res) => {
  const filter = String(req.query.filter ?? 'all');
  const search = String(req.query.search ?? '').trim().toLowerCase();
  const onlyStarred = req.query.starred === 'true';

  let query = supabase
    .from('conversation_threads')
    .select('id, phone, cpf, messages, human_mode, churn_risk, status, starred, updated_at')
    .in('tenant_id', adminTenantIds())
    .order('updated_at', { ascending: false })
    .limit(150);

  if (filter === 'bot') {
    query = query.eq('human_mode', false).eq('status', 'active');
  } else if (filter === 'human') {
    query = query.eq('human_mode', true).neq('status', 'closed');
  } else if (filter === 'waiting') {
    query = query.eq('status', 'waiting');
  } else if (filter === 'churn') {
    query = query.eq('churn_risk', true).neq('status', 'closed');
  } else {
    query = query.neq('status', 'closed');
  }

  if (onlyStarred) query = query.eq('starred', true);

  const { data, error } = await query;
  if (error) {
    respondSupabaseQueryError(res, error, 'failed to fetch conversations', 'conversations fetch failed');
    return;
  }

  const rows = (data ?? []) as Array<{
    id: string;
    phone: string;
    cpf: string | null;
    messages: unknown;
    human_mode: boolean;
    churn_risk: boolean;
    status: string | null;
    starred: boolean;
    updated_at: string;
  }>;

  const phones = rows.map(r => r.phone);

  // ── Batch: session_mode por phone ──────────────────────────────────────────
  const sessionModeMap = new Map<string, string>();
  if (phones.length > 0) {
    try {
      const { data: logs } = await supabase
        .from('interaction_logs')
        .select('phone, session_mode, created_at')
        .in('phone', phones)
        .in('tenant_id', adminTenantIds())
        .order('created_at', { ascending: false })
        .limit(phones.length * 10); // escalado por phones para evitar exclusão em listas grandes
      for (const log of (logs ?? []) as Array<{ phone: string; session_mode: string | null }>) {
        if (!sessionModeMap.has(log.phone) && log.session_mode) {
          sessionModeMap.set(log.phone, log.session_mode);
        }
      }
    } catch {
      // best-effort
    }
  }

  // ── Batch: chamados abertos por phone ──────────────────────────────────────
  const openTicketsMap = new Map<string, boolean>();
  if (phones.length > 0) {
    try {
      const { data: tickets } = await supabase
        .from('sofia_tickets')
        .select('phone')
        .in('phone', phones)
        .eq('tenant_id', adminTenantId())
        .eq('status', 'aberto');
      for (const t of (tickets ?? []) as Array<{ phone: string }>) {
        openTicketsMap.set(t.phone, true);
      }
    } catch {
      // best-effort
    }
  }

  // ── Batch: NPS mais recente por phone ──────────────────────────────────────
  const npsMap = new Map<string, number>();
  if (phones.length > 0) {
    try {
      const { data: npsRows } = await supabase
        .from('nps_responses')
        .select('phone, score, created_at')
        .in('phone', phones)
        .in('tenant_id', adminTenantIds())
        .order('created_at', { ascending: false })
        .limit(phones.length * 20); // aumentado para garantir cobertura quando um phone domina
      for (const row of (npsRows ?? []) as Array<{ phone: string; score: number }>) {
        if (!npsMap.has(row.phone)) npsMap.set(row.phone, row.score);
      }
    } catch {
      // best-effort
    }
  }

  // ── Enriquecimento por row (customer + fatura seletiva + score) ────────────
  // Concorrência limitada a 10 SGP simultâneos para evitar thundering herd
  const SGP_CONCURRENCY = 10;

  type EnrichedRow = {
    id: string;
    phone: string;
    cpf: string | null;
    name: string;
    lastText: string;
    lastMessageSource: 'user' | 'assistant' | 'human' | null;
    mode: 'human' | 'bot';
    status: 'active' | 'waiting' | 'closed';
    starred: boolean;
    churnRisk: boolean;
    updatedAt: string;
    sessionMode: string | null;
    urgency_score: number;
    urgency_reasons: string[];
    invoice_days_overdue: number;
  };

  async function enrichRow(row: typeof rows[number]): Promise<EnrichedRow> {
    let name = row.phone;
    let customerId: string | null = null;

    try {
      const customer = await cachedCustomerByPhone(row.phone);
      if (!('error' in customer)) {
        name = customer.name ?? row.phone;
        customerId = customer.id;
      }
    } catch {
      // keep phone
    }

    const sessionMode = sessionModeMap.get(row.phone) ?? 'default';
    const needsInvoice = row.churn_risk || sessionMode === 'billing';

    let invoiceDaysOverdue = 0;
    if (needsInvoice && customerId) {
      const cacheKey = `invoice_days:${row.phone}`;
      const cachedDays = cacheGet<number>(cacheKey);
      if (cachedDays !== null) {
        invoiceDaysOverdue = cachedDays;
      } else {
        let invoiceTimeoutId: ReturnType<typeof setTimeout> | undefined;
        const invoiceTimeout = new Promise<never>((_, reject) => {
          invoiceTimeoutId = setTimeout(() => reject(new Error('timeout')), 2_000);
        });
        try {
          const invoice = await Promise.race([getCurrentInvoice(customerId), invoiceTimeout]);
          invoiceDaysOverdue = calcInvoiceDaysOverdue(invoice);
          cacheSet(cacheKey, invoiceDaysOverdue);
        } catch {
          // 0
        } finally {
          clearTimeout(invoiceTimeoutId);
        }
      }
    }

    const minutesSinceLastMessage = getMinutesSinceLastUserMessage(row.messages);

    const factors: UrgencyFactors = {
      isHumanMode: row.human_mode,
      invoiceDaysOverdue,
      isChurnRisk: row.churn_risk,
      hasOpenTicket: openTicketsMap.has(row.phone),
      minutesSinceLastMessage,
      sessionMode,
      npsScore: npsMap.get(row.phone) ?? null,
    };

    return {
      id: row.id,
      phone: row.phone,
      cpf: row.cpf ?? null,
      name,
      lastText: getThreadLastText(row.messages),
      lastMessageSource: getThreadLastSource(row.messages),
      mode: (row.human_mode ? 'human' : 'bot') as 'human' | 'bot',
      status: (row.status ?? 'active') as 'active' | 'waiting' | 'closed',
      starred: row.starred ?? false,
      churnRisk: row.churn_risk,
      updatedAt: row.updated_at,
      sessionMode: sessionMode !== 'default' ? sessionMode : null,
      urgency_score: calculateUrgencyScore(factors),
      urgency_reasons: urgencyReasons(factors),
      invoice_days_overdue: invoiceDaysOverdue,
    };
  }

  const enriched: EnrichedRow[] = [];
  for (let i = 0; i < rows.length; i += SGP_CONCURRENCY) {
    const chunk = rows.slice(i, i + SGP_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map(enrichRow));
    enriched.push(...chunkResults);
  }

  const searchDigits = search.replace(/\D/g, '');
  const filtered = search
    ? enriched.filter(item => {
        if (item.name.toLowerCase().includes(search)) return true;
        if (item.phone.replace(/\D/g, '').includes(searchDigits)) return true;
        if (item.cpf && searchDigits.length >= 3 && item.cpf.includes(searchDigits)) return true;
        return false;
      })
    : enriched;

  // Ordenar por urgência DESC, desempate updated_at DESC
  filtered.sort((a, b) => {
    if (b.urgency_score !== a.urgency_score) return b.urgency_score - a.urgency_score;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  res.status(200).json(filtered);
});

adminRouter.get('/conversations/:id', async (req, res) => {
  const thread = await getThreadForAdmin(req.params.id);
  if (!thread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  // session_mode da última interação registrada para este telefone
  let sessionMode: string | null = null;
  try {
    const { data: lastLog } = await supabase
      .from('interaction_logs')
      .select('session_mode')
      .eq('tenant_id', env.DEFAULT_TENANT_ID)
      .eq('phone', thread.phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    sessionMode = (lastLog as { session_mode?: string | null } | null)?.session_mode ?? null;
  } catch {
    sessionMode = null;
  }

  let customer: unknown = null;
  try {
    customer = await cachedCustomerByPhone(thread.phone);
  } catch {
    customer = null;
  }

  res.status(200).json({
    ...thread,
    session_mode: sessionMode,
    customer: safeCustomer(customer as Customer | null),
  });
});

adminRouter.patch('/conversations/:id/human-mode', async (req, res) => {
  const { active } = req.body as { active?: boolean };
  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'active boolean is required' });
    return;
  }

  const existingThread = await getThreadForAdmin(req.params.id);
  if (!existingThread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const { error } = await supabase
    .from('conversation_threads')
    .update({ human_mode: active, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', adminTenantId());

  if (error) {
    res.status(500).json({ error: 'failed to update conversation mode' });
    return;
  }

  res.status(200).json({ ok: true, active });
});

adminRouter.post('/conversations/:id/reply', async (req, res) => {
  const { message, copilot_used, copilot_edited } = req.body as {
    message?: string;
    copilot_used?: boolean;
    copilot_edited?: boolean;
  };
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const replyThread = await getThreadForAdmin(req.params.id);
  if (!replyThread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const updatedMessages = [
    ...(Array.isArray(replyThread.messages) ? replyThread.messages : []),
    { role: 'assistant', content: message, timestamp: new Date().toISOString(), source: 'human' },
  ];

  await supabase
    .from('conversation_threads')
    .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', adminTenantId());

  await whatsappService.sendText(env.DEFAULT_TENANT_ID, replyThread.phone, message);

  // Best-effort: registra o uso do copiloto no último interaction_log dessa conversa
  // (não há coluna conversation_id em interaction_logs — resolve pelo par tenant_id+phone mais recente)
  if (copilot_used || copilot_edited) {
    try {
      const { data: lastLog } = await supabase
        .from('interaction_logs')
        .select('id')
        .eq('tenant_id', adminTenantId())
        .eq('phone', replyThread.phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastLog) {
        await supabase
          .from('interaction_logs')
          .update({
            ...(copilot_used ? { copilot_used: true } : {}),
            ...(copilot_edited ? { copilot_edited: true } : {}),
          })
          .eq('id', lastLog.id);
      }
    } catch (err) {
      console.error('[admin] failed to record copilot metrics:', err);
    }
  }

  res.status(200).json({ ok: true });
});

adminRouter.post('/conversations/:id/suggest', async (req, res) => {
  const convId = req.params.id;

  const lastMs = suggestRateLimit.get(convId) ?? 0;
  if (Date.now() - lastMs < 10_000) {
    res.status(429).json({ error: 'Aguarde 10s entre sugestões' });
    return;
  }
  suggestRateLimit.set(convId, Date.now());
  setTimeout(() => suggestRateLimit.delete(convId), 15_000);

  const thread = await getThreadForAdmin(convId);
  if (!thread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const recentMessages = Array.isArray(thread.messages) ? thread.messages.slice(-10) : [];

  let clienteNome = 'não identificado';
  let clientePlano = 'N/A';
  let faturaStatus = 'N/A';
  let faturaVencimento = 'N/A';
  let nChamados = '0';
  let confidence: 'high' | 'medium' | 'low' = 'low';

  let customer: Customer | null = null;
  try {
    const result = await cachedCustomerByPhone(thread.phone);
    if (!('error' in result)) {
      customer = result;
      clienteNome = customer.name ?? 'não identificado';
      clientePlano = customer.plan?.name ?? 'N/A';
      confidence = 'medium';
    }
  } catch {
    // cliente não identificado — continua com defaults
  }

  if (customer) {
    // Fatura com timeout de 3s (best-effort)
    let invoiceTimeoutId: ReturnType<typeof setTimeout> | undefined;
    const invoiceTimeout = new Promise<never>((_, reject) => {
      invoiceTimeoutId = setTimeout(() => reject(new Error('timeout')), 3_000);
    });
    try {
      const invoice = await Promise.race<Invoice>([getCurrentInvoice(customer.id), invoiceTimeout]);
      faturaStatus = invoice.status;
      faturaVencimento = invoice.dueDate;
      confidence = 'high';
    } catch {
      // sem fatura disponível
    } finally {
      clearTimeout(invoiceTimeoutId);
    }

    // Chamados abertos (best-effort)
    try {
      const { count } = await supabase
        .from('sofia_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('phone', thread.phone)
        .eq('tenant_id', env.DEFAULT_TENANT_ID)
        .eq('status', 'aberto');
      nChamados = String(count ?? 0);
    } catch {
      // mantém '0'
    }
  }

  const systemPrompt = COPILOT_SYSTEM
    + `\n\nContexto do cliente:\n- Nome: ${clienteNome}\n- Plano: ${clientePlano}\n- Fatura: ${faturaStatus} (vencimento: ${faturaVencimento})\n- Chamados abertos: ${nChamados}`;

  interface ChatMessage { role: string; content: string }
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map((m) => {
      const msg = m as { role?: string; content?: string; source?: string };
      const role = msg.role === 'user' ? 'user' : 'assistant';
      const prefix = msg.source === 'human'
        ? '[Atendente]: '
        : msg.role === 'user'
          ? '[Cliente]: '
          : '[Sofia]: ';
      return { role, content: `${prefix}${msg.content ?? ''}` };
    }),
    { role: 'user', content: 'Sugira a próxima resposta do atendente para este cliente.' },
  ];

  try {
    const baseUrl = env.DEEPSEEK_BASE_URL.replace(/\/$/, '');
    const { data } = await axios.post<{ choices: Array<{ message: { content: string } }> }>(
      `${baseUrl}/chat/completions`,
      {
        model: env.DEEPSEEK_MODEL,
        max_tokens: 200,
        temperature: 0.3,
        messages: chatMessages,
      },
      {
        headers: {
          Authorization: `Bearer ${env.DEEPSEEK_API_KEY ?? ''}`,
          'Content-Type': 'application/json',
        },
        timeout: 8_000,
      },
    );

    const suggestion = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!suggestion) {
      res.status(503).json({ error: 'Copiloto temporariamente indisponível' });
      return;
    }

    res.status(200).json({
      suggestion,
      reasoning: `Baseado no contexto de ${clienteNome} e histórico recente`,
      confidence,
    });
  } catch {
    res.status(503).json({ error: 'Copiloto temporariamente indisponível' });
  }
});

adminRouter.post('/conversations/:id/close', async (req, res) => {
  const closeThread = await getThreadForAdmin(req.params.id);
  if (!closeThread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const now = new Date().toISOString();
  const closedMessages = [
    ...(Array.isArray(closeThread.messages) ? closeThread.messages : []),
    { role: 'assistant', content: 'Atendimento encerrado pelo operador.', timestamp: now, source: 'system' },
  ];

  const { error } = await supabase
    .from('conversation_threads')
    .update({
      status: 'closed',
      closed_at: now,
      human_mode: false,
      messages: closedMessages,
      updated_at: now,
    })
    .eq('id', req.params.id)
    .eq('tenant_id', adminTenantId());

  if (error) {
    res.status(500).json({ error: 'failed to close conversation' });
    return;
  }

  res.status(200).json({ ok: true });
});

adminRouter.post('/conversations/:id/pause', async (req, res) => {
  const { resume } = (req.body ?? {}) as { resume?: boolean };
  const pauseThread = await getThreadForAdmin(req.params.id);
  if (!pauseThread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const nextStatus = resume ? 'active' : 'waiting';
  const nextHumanMode = resume ? true : false;

  const { error } = await supabase
    .from('conversation_threads')
    .update({
      status: nextStatus,
      human_mode: nextHumanMode,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('tenant_id', adminTenantId());

  if (error) {
    res.status(500).json({ error: 'failed to update conversation status' });
    return;
  }

  res.status(200).json({ ok: true, status: nextStatus });
});

adminRouter.patch('/conversations/:id/star', async (req, res) => {
  const { starred } = req.body as { starred?: boolean };
  if (typeof starred !== 'boolean') {
    res.status(400).json({ error: 'starred boolean is required' });
    return;
  }

  const starThread = await getThreadForAdmin(req.params.id);
  if (!starThread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const { error } = await supabase
    .from('conversation_threads')
    .update({ starred, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('tenant_id', adminTenantId());

  if (error) {
    res.status(500).json({ error: 'failed to star conversation' });
    return;
  }

  res.status(200).json({ ok: true, starred });
});

adminRouter.get('/metrics', async (_req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [threadsRes, interactionRes, billingRes, churnRes, campaignsRes, referralRes] = await Promise.all([
    supabase
      .from('conversation_threads')
      .select('id, human_mode, created_at')
      .eq('tenant_id', env.DEFAULT_TENANT_ID),
    supabase
      .from('interaction_logs')
      .select('id, created_at')
      .eq('tenant_id', env.DEFAULT_TENANT_ID),
    supabase.from('billing_notifications').select('id, status, sent_at'),
    supabase.from('churn_risks').select('id, created_at'),
    supabase.from('campaign_sends').select('id, type, sent_at'),
    supabase.from('referral_links').select('conversions'),
  ]);

  const threads = (threadsRes.data ?? []) as Array<{ human_mode: boolean; created_at: string }>;
  const interactions = (interactionRes.data ?? []) as Array<{ created_at: string }>;
  const billing = (billingRes.data ?? []) as Array<{ status: string; sent_at: string }>;
  const churn = (churnRes.data ?? []) as Array<{ created_at: string }>;
  const campaigns = (campaignsRes.data ?? []) as Array<{ type: string; sent_at: string }>;
  const referrals = (referralRes.data ?? []) as Array<{ conversions: number }>;

  const totalConversations = threads.length;
  const botResolved = threads.filter(t => !t.human_mode).length;
  const botResolutionRate = totalConversations > 0 ? Math.round((botResolved / totalConversations) * 100) : 0;

  const recoveredRevenue = billing
    .filter(item => item.status === 'cancelled')
    .length * 50;

  const todayIso = startOfDay;
  const weekIso = startOfWeek.toISOString();

  const trend = [
    { label: 'Hoje', conversations: interactions.filter(i => i.created_at >= todayIso).length },
    { label: '7 dias', conversations: interactions.filter(i => i.created_at >= weekIso).length },
    { label: 'Mês', conversations: interactions.filter(i => i.created_at >= startOfMonth).length },
  ];

  const totalConversions = referrals.reduce((acc, r) => acc + (r.conversions ?? 0), 0);
  const campaignResponseRate = campaigns.length > 0
    ? Math.round((totalConversions / campaigns.length) * 100)
    : 0;

  res.status(200).json({
    totalConversations,
    botResolutionRate,
    recoveredRevenue,
    newLeadsFromBot: campaigns.filter(c => c.type === 'referral').length,
    activeChurnRisks: churn.length,
    campaignsSent: campaigns.length,
    campaignResponseRate,
    trend,
  });
});

adminRouter.get('/campaigns', async (_req, res) => {
  const { data, error } = await supabase
    .from('campaign_sends')
    .select('id, customer_id, type, sent_at')
    .order('sent_at', { ascending: false })
    .limit(200);

  if (error) {
    res.status(500).json({ error: 'failed to load campaigns' });
    return;
  }

  const grouped = new Map<string, { type: string; totalSent: number; lastSentAt: string }>();
  for (const row of ((data ?? []) as Array<{ type: string; sent_at: string }>)) {
    const key = row.type;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { type: row.type, totalSent: 1, lastSentAt: row.sent_at });
      continue;
    }
    current.totalSent += 1;
    if (row.sent_at > current.lastSentAt) current.lastSentAt = row.sent_at;
  }

  res.status(200).json(Array.from(grouped.values()));
});

adminRouter.get('/churn-risks', async (_req, res) => {
  const { data, error } = await supabase
    .from('churn_risks')
    .select('id, customer_id, reason, level, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    res.status(500).json({ error: 'failed to load churn risks' });
    return;
  }

  const result = await Promise.all(((data ?? []) as Array<{
    id: string;
    customer_id: string;
    reason: string;
    level: 'low' | 'medium' | 'high';
    created_at: string;
  }>).map(async (row) => {
    let name = row.customer_id;
    let plan = 'N/A';
    let phone: string | null = null;
    try {
      const customer = await getCustomerById(row.customer_id);
      name = customer.name;
      plan = customer.plan?.name ?? 'N/A';
      phone = customer.phone ?? null;
    } catch {
      // keep fallback
    }

    let npsScore: number | null = null;
    if (phone) {
      try {
        const { data: nps } = await supabase
          .from('nps_responses')
          .select('score')
          .eq('tenant_id', env.DEFAULT_TENANT_ID)
          .eq('phone', phone)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        npsScore = (nps as { score?: number } | null)?.score ?? null;
      } catch {
        npsScore = null;
      }
    }

    return {
      ...row,
      name,
      plan,
      nps_score: npsScore,
      status: 'pending',
    };
  }));

  res.status(200).json(result);
});

adminRouter.post('/campaigns/churn-outreach/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('churn_risks')
    .select('id, customer_id')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'churn risk not found' });
    return;
  }

  const row = data as { customer_id: string };
  const customer = await getCustomerById(row.customer_id).catch(() => null);
  const targetPhone = customer?.phone ?? row.customer_id;
  const targetName = customer?.name?.split(' ')[0] ?? 'Cliente';

  await whatsappService.sendText(
    env.DEFAULT_TENANT_ID,
    targetPhone,
    `Oi ${targetName}, percebemos que você teve algumas dificuldades ultimamente. Posso te ajudar? Um técnico pode ir até você amanhã sem custo adicional.`
  );

  await supabase.from('campaign_sends').insert({
    customer_id: row.customer_id,
    type: 'churn_risk_high',
    sent_at: new Date().toISOString(),
  });

  res.status(200).json({ ok: true });
});

adminRouter.get('/conversations/:id/invoice', async (req, res) => {
  const invoiceThread = await getThreadForAdmin(req.params.id);
  if (!invoiceThread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const customer = await cachedCustomerByPhone(invoiceThread.phone).catch(() => null);
  if (!customer) {
    res.status(404).json({ error: 'customer not found' });
    return;
  }

  const invoice = await getCurrentInvoice(customer.id).catch(() => null);
  res.status(200).json(invoice);
});

adminRouter.post('/conversations/:id/generate-pix', adminAuthMiddleware, async (req, res) => {
  const pixThread = await getThreadForAdmin(req.params.id);
  if (!pixThread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const customer = await cachedCustomerByPhone(pixThread.phone).catch(() => null);
  if (!customer) {
    res.status(404).json({ error: 'customer not found' });
    return;
  }

  const invoice = await getCurrentInvoice(customer.id).catch(() => null);
  if (!invoice) {
    res.status(404).json({ error: 'no open invoice' });
    return;
  }

  try {
    const pix = await generatePixKey(invoice.id, customer.id);
    res.status(200).json({ pixCode: pix.pixKey });
  } catch (err) {
    res.status(422).json({ error: (err as Error).message ?? 'PIX não disponível' });
  }
});

adminRouter.get('/conversations/:id/context', adminAuthMiddleware, async (req, res) => {
  const contextThread = await getThreadForAdmin(req.params.id);
  if (!contextThread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const { phone } = contextThread;

  const [npsRes, ticketsRes, scheduleRes] = await Promise.allSettled([
    supabase
      .from('nps_responses')
      .select('score, created_at')
      .eq('phone', phone)
      .eq('tenant_id', env.DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('sofia_tickets')
      .select('*', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('tenant_id', env.DEFAULT_TENANT_ID)
      .eq('status', 'aberto'),
    supabase
      .from('scheduled_visits')
      .select('visit_date, period')
      .eq('phone', phone)
      .eq('status', 'scheduled')
      .order('visit_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const npsData = npsRes.status === 'fulfilled' ? (npsRes.value.data as { score: number; created_at: string } | null) : null;
  const openTickets = ticketsRes.status === 'fulfilled' ? (ticketsRes.value.count ?? 0) : 0;
  const scheduleData = scheduleRes.status === 'fulfilled' ? (scheduleRes.value.data as { visit_date: string; period: string } | null) : null;

  res.status(200).json({
    nps: npsData ? { score: npsData.score, date: npsData.created_at } : null,
    openTickets,
    activeSchedule: scheduleData ? { date: scheduleData.visit_date, period: scheduleData.period } : null,
  });
});

// ── WhatsApp connection status + QR ──────────────────────────────────────────

adminRouter.get('/whatsapp/status', async (_req, res) => {
  try {
    const provider = providerRegistry.getDefault() as EvolutionGoProvider;
    const instanceName = env.EVOLUTION_INSTANCE_NAME;
    const status = await provider.getInstanceStatus(instanceName);
    res.json({ connected: status.connected, state: status.state, phoneNumber: status.phoneNumber });
  } catch (err) {
    res.json({ connected: false, state: 'close', error: 'unavailable' });
  }
});

adminRouter.get('/whatsapp/qr', async (_req, res) => {
  try {
    const provider = providerRegistry.getDefault() as EvolutionGoProvider;
    const instanceName = env.EVOLUTION_INSTANCE_NAME;
    const result = await provider.getQRCode(instanceName);
    res.json({ qrCode: result.qrCode });
  } catch (err) {
    res.status(503).json({ error: 'qr code unavailable' });
  }
});

// ── Leads / Prospects ─────────────────────────────────────────────────────────

const LEAD_STATUSES = ['new', 'contacted', 'converted', 'lost'] as const;

adminRouter.get('/leads', async (req, res) => {
  const status = String(req.query.status ?? 'all');

  let query = supabase
    .from('leads')
    .select('id, phone, name, neighborhood, desired_plan, notes, status, created_at')
    .order('created_at', { ascending: false })
    .limit(300);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[admin] leads fetch failed:', error.message);
    res.status(500).json({ error: 'failed to load leads' });
    return;
  }

  res.status(200).json(data ?? []);
});

adminRouter.patch('/leads/:id', async (req, res) => {
  const { status, notes } = req.body as { status?: string; notes?: string };
  if (status && !LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
    res.status(400).json({ error: `status must be one of ${LEAD_STATUSES.join('|')}` });
    return;
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) updates.status = status;
  if (typeof notes === 'string') updates.notes = notes;

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', req.params.id)
    .select('id')
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'lead not found' });
    return;
  }

  res.status(200).json({ ok: true, status });
});

// ── Chamados (sofia_tickets) ──────────────────────────────────────────────────

const TICKET_STATUSES = ['aberto', 'em_andamento', 'resolvido'] as const;

adminRouter.get('/tickets', async (req, res) => {
  const status = String(req.query.status ?? 'all');

  let query = supabase
    .from('sofia_tickets')
    .select('id, phone, contrato, sgp_chamado_id, tipo, descricao, status, created_at, updated_at')
    .eq('tenant_id', env.DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(300);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: 'failed to load tickets' });
    return;
  }

  const rows = (data ?? []) as Array<{ phone: string } & Record<string, unknown>>;
  const enriched = await Promise.all(
    rows.map(async (row) => {
      let customerName: string | null = null;
      try {
        const customer = await cachedCustomerByPhone(row.phone);
        customerName = customer.name;
      } catch {
        customerName = null;
      }
      return { ...row, customer_name: customerName };
    }),
  );

  res.status(200).json(enriched);
});

adminRouter.patch('/tickets/:id', async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!status || !TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) {
    res.status(400).json({ error: `status must be one of ${TICKET_STATUSES.join('|')}` });
    return;
  }

  const { data, error } = await supabase
    .from('sofia_tickets')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id')
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'ticket not found' });
    return;
  }

  res.status(200).json({ ok: true, status });
});

// ── NPS ───────────────────────────────────────────────────────────────────────

adminRouter.get('/nps', async (req, res) => {
  const rawDays = Number(req.query.days ?? 30);
  const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('nps_responses')
    .select('phone, score, created_at')
    .eq('tenant_id', env.DEFAULT_TENANT_ID)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: 'failed to load nps' });
    return;
  }

  const rows = (data ?? []) as Array<{ phone: string; score: number; created_at: string }>;
  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of rows) {
    if (row.score >= 1 && row.score <= 5) distribution[row.score] += 1;
  }

  const total = rows.length;
  const average = total > 0
    ? Math.round((rows.reduce((acc, r) => acc + r.score, 0) / total) * 10) / 10
    : null;

  const detractors = rows
    .filter((r) => r.score <= 2)
    .slice(0, 100)
    .map((r) => ({ phone: r.phone, score: r.score, created_at: r.created_at }));

  res.status(200).json({
    period_days: days,
    total,
    average,
    distribution,
    detractors,
  });
});

// ── Rede — apagões por bairro (outage_reports) ────────────────────────────────

adminRouter.get('/outages', async (req, res) => {
  const rawDays = Number(req.query.days ?? 7);
  const days = Math.min(Math.max(isNaN(rawDays) ? 7 : rawDays, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('outage_reports')
    .select('neighborhood, reported_at')
    .gte('reported_at', since)
    .order('reported_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: 'failed to load outages' });
    return;
  }

  const rows = (data ?? []) as Array<{ neighborhood: string; reported_at: string }>;
  const grouped = new Map<string, { neighborhood: string; count: number; lastReportedAt: string }>();
  for (const row of rows) {
    const current = grouped.get(row.neighborhood);
    if (!current) {
      grouped.set(row.neighborhood, {
        neighborhood: row.neighborhood,
        count: 1,
        lastReportedAt: row.reported_at,
      });
      continue;
    }
    current.count += 1;
    if (row.reported_at > current.lastReportedAt) current.lastReportedAt = row.reported_at;
  }

  res.status(200).json({
    period_days: days,
    total: rows.length,
    neighborhoods: Array.from(grouped.values()).sort((a, b) => b.count - a.count),
  });
});

// ── Financeiro — KPIs de cobrança (billing_notifications) ──────────────────────

adminRouter.get('/financeiro', async (req, res) => {
  const rawDays = Number(req.query.days ?? 30);
  const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 180);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('billing_notifications')
    .select('type, status, sent_at')
    .gte('sent_at', since)
    .order('sent_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: 'failed to load billing notifications' });
    return;
  }

  const rows = (data ?? []) as Array<{ type: string; status: string; sent_at: string }>;
  const byType = new Map<string, number>();
  for (const row of rows) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
  }

  const totalNotifications = rows.length;
  const negociacoes = rows.filter((r) => r.type === 'negociacao').length;
  const cancelled = rows.filter((r) => r.status === 'cancelled').length;
  const recoveredRevenue = cancelled * 50;

  res.status(200).json({
    period_days: days,
    total_notifications: totalNotifications,
    negociacoes,
    recovered_revenue: recoveredRevenue,
    by_type: Array.from(byType.entries()).map(([type, count]) => ({ type, count })),
  });
});

// ── Clientes — busca pontual no SGP ───────────────────────────────────────────

adminRouter.get('/customers/search', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.status(400).json({ error: 'query param q is required' });
    return;
  }

  const digits = q.replace(/\D/g, '');
  // Detect formatted CPF: accepts . / space / hyphen as group separators
  const isCpfFormatted = /^\d{3}[.\-\s]\d{3}[.\-\s]\d{3}[-\s]?\d{2}$/.test(q.trim());
  let customer: Customer | null = null;

  try {
    if (isCpfFormatted) {
      customer = await getCustomerByCpf(digits).catch((err: unknown) => {
        console.warn(`[admin/search] CPF lookup failed for ${digits.slice(0, 3)}***:`, err instanceof Error ? err.message : err);
        return null;
      });
    } else if (digits.length >= 10) {
      // Try phone first; for 11-digit bare numbers also try CPF as fallback
      // (Brazilian mobiles and CPFs are both 11 digits — phone takes priority)
      customer = await getCustomerByPhone(digits).catch(() => null);
      if (!customer && digits.length === 11) {
        customer = await getCustomerByCpf(digits).catch((err: unknown) => {
          console.warn(`[admin/search] CPF fallback failed for ${digits.slice(0, 3)}***:`, err instanceof Error ? err.message : err);
          return null;
        });
      }
    } else {
      customer = await getCustomerById(q);
    }
  } catch (err: unknown) {
    console.warn('[admin/search] unexpected error:', err instanceof Error ? err.message : err);
    customer = null;
  }

  if (!customer) {
    res.status(404).json({ error: 'customer not found' });
    return;
  }

  const invoice = await getCurrentInvoice(customer.id).catch(() => null);

  res.status(200).json({ ...safeCustomer(customer), invoice });
});

// ── Configurações de negócio (skill) ──────────────────────────────────────────

interface TenantSettings {
  skill?: Partial<ISPSkillConfig>;
  llmDailyBudget?: number;
}

async function findTenantRow(): Promise<{ id: string; settings: TenantSettings } | null> {
  const candidates = Array.from(
    new Set([env.DEFAULT_TENANT_ID, 'salesnet-default', 'default']),
  );
  for (const id of candidates) {
    const { data } = await supabase
      .from('tenants')
      .select('id, settings')
      .eq('id', id)
      .maybeSingle();
    if (data) {
      return { id: (data as { id: string }).id, settings: ((data as { settings?: TenantSettings }).settings ?? {}) };
    }
  }
  return null;
}

adminRouter.get('/config', async (_req, res) => {
  const config = await getSkillConfig(env.DEFAULT_TENANT_ID);
  const tenant = await findTenantRow();

  res.status(200).json({
    business: config.business,
    plans: config.plans,
    coveredNeighborhoods: config.coveredNeighborhoods,
    toneOverride: config.toneOverride ?? null,
    llmDailyBudget: tenant?.settings.llmDailyBudget ?? null,
  });
});

adminRouter.patch('/config', async (req, res) => {
  const body = req.body as {
    business?: Partial<ISPSkillConfig['business']>;
    plans?: ISPSkillConfig['plans'];
    coveredNeighborhoods?: string[];
    toneOverride?: string | null;
    llmDailyBudget?: number | null;
  };

  const tenant = await findTenantRow();

  const currentSettings: TenantSettings = tenant?.settings ?? {};
  const currentSkill: Partial<ISPSkillConfig> = currentSettings.skill ?? {};

  const nextSkill: Partial<ISPSkillConfig> = { ...currentSkill };
  if (body.business) {
    nextSkill.business = { ...(currentSkill.business ?? {}), ...body.business } as ISPSkillConfig['business'];
  }
  if (Array.isArray(body.plans)) nextSkill.plans = body.plans;
  if (Array.isArray(body.coveredNeighborhoods)) nextSkill.coveredNeighborhoods = body.coveredNeighborhoods;
  if (body.toneOverride !== undefined) {
    nextSkill.toneOverride = body.toneOverride ?? undefined;
  }

  const nextSettings: TenantSettings = { ...currentSettings, skill: nextSkill };
  if (body.llmDailyBudget !== undefined) {
    nextSettings.llmDailyBudget = body.llmDailyBudget ?? undefined;
  }

  if (tenant) {
    const { error } = await supabase
      .from('tenants')
      .update({ settings: nextSettings, updated_at: new Date().toISOString() })
      .eq('id', tenant.id);
    if (error) {
      res.status(500).json({ error: 'failed to persist config' });
      return;
    }
  } else {
    const id = env.DEFAULT_TENANT_ID;
    const { error } = await supabase.from('tenants').insert({
      id,
      name: 'SalesNet Telecom',
      slug: `salesnet-${id}`,
      settings: nextSettings,
    });
    if (error) {
      res.status(500).json({ error: 'failed to create tenant config' });
      return;
    }
  }

  clearSkillConfigCache();
  res.status(200).json({ ok: true });
});
