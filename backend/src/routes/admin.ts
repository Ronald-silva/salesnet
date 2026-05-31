import { Router } from 'express';
import { supabase } from '../config/supabase';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { getCustomerByPhone, getCustomerById, getCurrentInvoice } from '../integrations/sgp';
import { getCustomerByCpf } from '../integrations/sgp/customers';
import { whatsappService } from '../services/whatsapp-service';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';
import { EvolutionGoProvider } from '../integrations/whatsapp/providers/evolution-go';
import { env } from '../config/env';
import { adminTenantIds } from '../lib/admin-tenant';
import { getSkillConfig, clearSkillConfigCache } from '../agent/skill';
import type { ISPSkillConfig } from '../agent/skill/types';
import { respondSupabaseQueryError } from '../lib/supabase-query-error';

export const adminRouter = Router();

function getThreadLastText(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const last = messages[messages.length - 1] as { content?: string };
  return last?.content ?? '';
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

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
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

adminRouter.get('/conversations', async (req, res) => {
  const filter = String(req.query.filter ?? 'all');
  const search = String(req.query.search ?? '').trim().toLowerCase();

  let query = supabase
    .from('conversation_threads')
    .select('id, phone, messages, human_mode, churn_risk, updated_at')
    .in('tenant_id', adminTenantIds())
    .order('updated_at', { ascending: false })
    .limit(100);

  if (filter === 'bot') query = query.eq('human_mode', false);
  if (filter === 'human') query = query.eq('human_mode', true);
  if (filter === 'churn') query = query.eq('churn_risk', true);

  const { data, error } = await query;
  if (error) {
    respondSupabaseQueryError(res, error, 'failed to fetch conversations', 'conversations fetch failed');
    return;
  }

  const rows = (data ?? []) as Array<{
    id: string;
    phone: string;
    messages: unknown;
    human_mode: boolean;
    churn_risk: boolean;
    updated_at: string;
  }>;

  const enriched = await Promise.all(rows.map(async (row) => {
    let name = row.phone;
    try {
      const customer = await getCustomerByPhone(row.phone);
      name = customer.name;
    } catch {
      // keep phone as fallback
    }

    return {
      id: row.id,
      phone: row.phone,
      name,
      lastText: getThreadLastText(row.messages),
      mode: row.human_mode ? 'human' : 'bot',
      churnRisk: row.churn_risk,
      updatedAt: row.updated_at,
    };
  }));

  const filtered = search
    ? enriched.filter(item =>
      item.name.toLowerCase().includes(search) || item.phone.toLowerCase().includes(search))
    : enriched;

  res.status(200).json(filtered);
});

adminRouter.get('/conversations/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('conversation_threads')
    .select('id, phone, messages, human_mode, churn_risk, notes, updated_at')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const thread = data as {
    id: string;
    phone: string;
    messages: unknown;
    human_mode: boolean;
    churn_risk: boolean;
    notes: string | null;
    updated_at: string;
  };

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
    customer = await getCustomerByPhone(thread.phone);
  } catch {
    customer = null;
  }

  res.status(200).json({
    ...thread,
    session_mode: sessionMode,
    customer,
  });
});

adminRouter.patch('/conversations/:id/human-mode', async (req, res) => {
  const { active } = req.body as { active?: boolean };
  if (typeof active !== 'boolean') {
    res.status(400).json({ error: 'active boolean is required' });
    return;
  }

  const { data: thread, error: threadError } = await supabase
    .from('conversation_threads')
    .select('id')
    .eq('id', req.params.id)
    .single();

  if (threadError || !thread) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const { error } = await supabase
    .from('conversation_threads')
    .update({ human_mode: active, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);

  if (error) {
    res.status(500).json({ error: 'failed to update conversation mode' });
    return;
  }

  res.status(200).json({ ok: true, active });
});

adminRouter.post('/conversations/:id/reply', async (req, res) => {
  const { message } = req.body as { message?: string };
  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const { data, error } = await supabase
    .from('conversation_threads')
    .select('phone, messages')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const row = data as { phone: string; messages: unknown[] };
  const updatedMessages = [
    ...(Array.isArray(row.messages) ? row.messages : []),
    { role: 'assistant', content: message, timestamp: new Date().toISOString(), source: 'human' },
  ];

  await supabase
    .from('conversation_threads')
    .update({ messages: updatedMessages, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);

  await whatsappService.sendText(env.DEFAULT_TENANT_ID, row.phone, message);
  res.status(200).json({ ok: true });
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
  const { data, error } = await supabase
    .from('conversation_threads')
    .select('phone')
    .eq('id', req.params.id)
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'conversation not found' });
    return;
  }

  const thread = data as { phone: string };
  const customer = await getCustomerByPhone(thread.phone).catch(() => null);
  if (!customer) {
    res.status(404).json({ error: 'customer not found' });
    return;
  }

  const invoice = await getCurrentInvoice(customer.id).catch(() => null);
  res.status(200).json(invoice);
});

// ── WhatsApp connection status + QR ──────────────────────────────────────────

adminRouter.get('/whatsapp/status', async (_req, res) => {
  try {
    const provider = providerRegistry.getDefault() as EvolutionGoProvider;
    const instanceName = env.EVOLUTION_INSTANCE_NAME;
    const status = await provider.getInstanceStatus(instanceName);
    res.json({ connected: status.connected, state: status.state, phoneNumber: status.phoneNumber });
  } catch (err) {
    res.json({ connected: false, state: 'close', error: (err as Error).message });
  }
});

adminRouter.get('/whatsapp/qr', async (_req, res) => {
  try {
    const provider = providerRegistry.getDefault() as EvolutionGoProvider;
    const instanceName = env.EVOLUTION_INSTANCE_NAME;
    const result = await provider.getQRCode(instanceName);
    res.json({ qrCode: result.qrCode });
  } catch (err) {
    res.status(503).json({ error: (err as Error).message });
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
        const customer = await getCustomerByPhone(row.phone);
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
  let customer: unknown = null;

  try {
    if (digits.length === 11 && !digits.startsWith('55')) {
      customer = await getCustomerByCpf(digits).catch(() => null);
    } else if (digits.length >= 10) {
      customer = await getCustomerByPhone(digits);
    } else {
      customer = await getCustomerById(q);
    }
  } catch {
    customer = null;
  }

  if (!customer) {
    res.status(404).json({ error: 'customer not found' });
    return;
  }

  res.status(200).json(customer);
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
