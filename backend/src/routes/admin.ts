import { Router } from 'express';
import { supabase } from '../config/supabase';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { getCustomerByPhone, getCustomerById, getCurrentInvoice } from '../integrations/sgp';
import { whatsappService } from '../services/whatsapp-service';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';
import { EvolutionGoProvider } from '../integrations/whatsapp/providers/evolution-go';
import { env } from '../config/env';

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
    .order('updated_at', { ascending: false })
    .limit(100);

  if (filter === 'bot') query = query.eq('human_mode', false);
  if (filter === 'human') query = query.eq('human_mode', true);
  if (filter === 'churn') query = query.eq('churn_risk', true);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: 'failed to fetch conversations' });
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
    .select('id, phone, messages, human_mode, churn_risk, updated_at')
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
    updated_at: string;
  };

  let customer: unknown = null;
  try {
    customer = await getCustomerByPhone(thread.phone);
  } catch {
    customer = null;
  }

  res.status(200).json({
    ...thread,
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

  await whatsappService.sendText(process.env['DEFAULT_TENANT_ID'] ?? 'default', row.phone, message);
  res.status(200).json({ ok: true });
});

adminRouter.get('/metrics', async (_req, res) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [threadsRes, interactionRes, billingRes, churnRes, campaignsRes] = await Promise.all([
    supabase.from('conversation_threads').select('id, human_mode, created_at'),
    supabase.from('interaction_logs').select('id, created_at'),
    supabase.from('billing_notifications').select('id, status, sent_at'),
    supabase.from('churn_risks').select('id, created_at'),
    supabase.from('campaign_sends').select('id, type, sent_at'),
  ]);

  const threads = (threadsRes.data ?? []) as Array<{ human_mode: boolean; created_at: string }>;
  const interactions = (interactionRes.data ?? []) as Array<{ created_at: string }>;
  const billing = (billingRes.data ?? []) as Array<{ status: string; sent_at: string }>;
  const churn = (churnRes.data ?? []) as Array<{ created_at: string }>;
  const campaigns = (campaignsRes.data ?? []) as Array<{ type: string; sent_at: string }>;

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

  res.status(200).json({
    totalConversations,
    botResolutionRate,
    recoveredRevenue,
    newLeadsFromBot: campaigns.filter(c => c.type === 'referral').length,
    activeChurnRisks: churn.length,
    campaignsSent: campaigns.length,
    campaignResponseRate: campaigns.length > 0 ? 22 : 0,
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
    try {
      const customer = await getCustomerById(row.customer_id);
      name = customer.name;
      plan = customer.plan?.name ?? 'N/A';
    } catch {
      // keep fallback
    }
    return {
      ...row,
      name,
      plan,
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
    process.env['DEFAULT_TENANT_ID'] ?? 'default',
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
