import { Router } from 'express';
import { clientAuthMiddleware, AuthenticatedRequest } from '../middleware/clientAuth';
import {
  getCurrentInvoice,
  generatePixKey,
  getConnectionStatus,
  openTicket,
  getCustomerInvoices,
  getCustomerById,
} from '../integrations/sgp';
import { supabase } from '../config/supabase';
import { env } from '../config/env';

export const clientRouter = Router();
clientRouter.use(clientAuthMiddleware);

clientRouter.get('/invoice', async (req: AuthenticatedRequest, res) => {
  try {
    const invoice = await getCurrentInvoice(req.customerId!);
    const pix = await generatePixKey(invoice.id);
    res.json({ ...invoice, pixKey: pix.pixKey });
  } catch (err) {
    console.error('[client] invoice error:', err);
    res.status(500).json({ error: 'failed to fetch invoice' });
  }
});

clientRouter.get('/connection', async (req: AuthenticatedRequest, res) => {
  try {
    const status = await getConnectionStatus(req.customerId!);
    res.json(status);
  } catch (err) {
    console.error('[client] connection error:', err);
    res.status(500).json({ error: 'failed to fetch connection status' });
  }
});

const STATUS_PT_TO_EN: Record<string, string> = {
  aberto: 'open',
  em_andamento: 'in_progress',
  resolvido: 'resolved',
};

// Chamados via sofia_tickets (Supabase) — SGP getCustomerTickets é stub
clientRouter.get('/tickets', async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('sofia_tickets')
      .select('id, tipo, descricao, status, sgp_chamado_id, created_at, updated_at')
      .eq('contrato', req.customerId!)
      .eq('tenant_id', env.DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const tickets = ((data ?? []) as {
      id: string;
      tipo: string;
      descricao: string;
      status: string;
      sgp_chamado_id: string | null;
      created_at: string;
      updated_at: string;
    }[]).map((t) => ({
      id: t.id,
      type: t.tipo,
      description: t.descricao,
      status: STATUS_PT_TO_EN[t.status] ?? t.status,
      protocol: t.sgp_chamado_id,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    res.json(tickets);
  } catch (err) {
    console.error('[client] tickets error:', err);
    res.status(500).json({ error: 'failed to fetch tickets' });
  }
});

clientRouter.post('/tickets', async (req: AuthenticatedRequest, res) => {
  const { type, description } = req.body as { type?: string; description?: string };
  if (!type || !description) {
    res.status(400).json({ error: 'type and description are required' });
    return;
  }
  try {
    // Abre no SGP (best-effort — endpoint pode retornar stub dependendo do plano)
    let sgpProtocolo: string | null = null;
    try {
      const sgpRes = await openTicket(req.customerId!, type, description);
      sgpProtocolo = sgpRes.protocolo ?? (sgpRes.os_id ? String(sgpRes.os_id) : null);
    } catch (sgpErr) {
      console.warn('[client] SGP openTicket failed (best-effort):', sgpErr);
    }

    // Persiste em sofia_tickets para aparecer na listagem
    const { data: inserted, error: insertErr } = await supabase
      .from('sofia_tickets')
      .insert({
        tenant_id:      env.DEFAULT_TENANT_ID,
        phone:          req.customerPhone!,
        contrato:       req.customerId!,
        tipo:           type,
        descricao:      description,
        status:         'aberto',
        sgp_chamado_id: sgpProtocolo,
      })
      .select('id, tipo, descricao, status, sgp_chamado_id, created_at, updated_at')
      .single();

    if (insertErr) throw insertErr;

    const row = inserted as {
      id: string; tipo: string; descricao: string; status: string;
      sgp_chamado_id: string | null; created_at: string; updated_at: string;
    };

    res.status(201).json({
      id:          row.id,
      type:        row.tipo,
      description: row.descricao,
      status:      STATUS_PT_TO_EN[row.status] ?? row.status,
      protocol:    row.sgp_chamado_id,
      createdAt:   row.created_at,
      updatedAt:   row.updated_at,
    });
  } catch (err) {
    console.error('[client] open ticket error:', err);
    res.status(500).json({ error: 'failed to open ticket' });
  }
});

// Perfil: nome, plano, velocidade, status do contrato
clientRouter.get('/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const customer = await getCustomerById(req.customerId!);
    res.json({
      name: customer.name,
      plan: customer.plan ?? null,
      status: customer.status,
    });
  } catch (err) {
    console.error('[client] profile error:', err);
    res.status(500).json({ error: 'failed to fetch profile' });
  }
});

// Próxima visita agendada (status scheduled)
clientRouter.get('/schedule', async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('scheduled_visits')
      .select('id, visit_date, period, type, status, notes')
      .eq('contrato', req.customerId!)
      .eq('status', 'scheduled')
      .order('visit_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      res.json(null);
      return;
    }

    const row = data as {
      id: string;
      visit_date: string;
      period: string;
      type: string | null;
      status: string;
      notes: string | null;
    };

    res.json({
      id: row.id,
      date: row.visit_date,
      period: row.period,
      type: row.type,
      notes: row.notes,
    });
  } catch (err) {
    console.error('[client] schedule error:', err);
    res.status(500).json({ error: 'failed to fetch schedule' });
  }
});

clientRouter.get('/referral', async (req: AuthenticatedRequest, res) => {
  const { data } = await supabase
    .from('referral_links')
    .select('code, conversions, created_at')
    .eq('customer_id', req.customerId!);

  const row = ((data ?? []) as { code: string; conversions: number; created_at: string }[])[0];
  if (!row) {
    res.json({ link: null, conversions: 0 });
    return;
  }
  res.json({
    link: `salesnet.com.br/indicar?ref=${row.code}`,
    conversions: row.conversions,
    createdAt: row.created_at,
  });
});

clientRouter.get('/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const invoices = await getCustomerInvoices(req.customerId!);
    res.json(invoices);
  } catch (err) {
    console.error('[client] invoices error:', err);
    res.status(500).json({ error: 'failed to fetch invoices' });
  }
});
