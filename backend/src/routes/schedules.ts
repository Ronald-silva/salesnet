/**
 * Admin — Agendamentos (visitas técnicas)
 *
 * CRUD/consulta de `scheduled_visits` para o painel administrativo.
 */

import { Router } from 'express';
import { supabase } from '../config/supabase';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { getCustomerByPhone } from '../integrations/sgp';
import { offerBringForward } from '../agent/bring-forward-flow';
import { env } from '../config/env';

export const schedulesRouter = Router();
schedulesRouter.use(adminAuthMiddleware);

type Period = 'morning' | 'afternoon';

interface VisitRow {
  id: string;
  customer_id: string;
  phone: string;
  visit_date: string;
  period: Period;
  status: string;
  type?: string | null;
  address?: string | null;
  bring_forward_status?: string | null;
  created_at: string;
}

const SELECT_BASE =
  'id, customer_id, phone, visit_date, period, status, created_at';

const SELECT_EXTENDED = `${SELECT_BASE}, type, address, bring_forward_status`;

function isMissingColumnError(message: string): boolean {
  return (
    (/column/i.test(message) && /does not exist/i.test(message)) ||
    /could not find the .* column/i.test(message)
  );
}

let scheduleSelectColumnsCache: string | null = null;

/** Uma vez por processo: usa colunas 021/022 só se existirem no Supabase. */
async function resolveScheduleSelectColumns(): Promise<string> {
  if (scheduleSelectColumnsCache) return scheduleSelectColumnsCache;

  const { error } = await supabase
    .from('scheduled_visits')
    .select('type, address, bring_forward_status')
    .limit(1);

  if (!error) {
    scheduleSelectColumnsCache = SELECT_EXTENDED;
    return SELECT_EXTENDED;
  }

  if (isMissingColumnError(error.message)) {
    console.warn(
      '[admin] scheduled_visits: migrations 021/022 ausentes — usando schema base (rode 021 e 022 no Supabase)',
    );
    scheduleSelectColumnsCache = SELECT_BASE;
    return SELECT_BASE;
  }

  scheduleSelectColumnsCache = SELECT_BASE;
  return SELECT_BASE;
}

interface EnrichedVisit {
  id: string;
  customer_id: string;
  phone: string;
  customer_name?: string;
  visit_date: string;
  period: Period;
  period_label: 'Manhã (8h-12h)' | 'Tarde (14h-18h)';
  status: string;
  type: string;
  address?: string;
  bring_forward_status: string;
  created_at: string;
}

function periodLabel(period: Period): EnrichedVisit['period_label'] {
  return period === 'morning' ? 'Manhã (8h-12h)' : 'Tarde (14h-18h)';
}

/** Enriquece linhas com o nome do cliente (best-effort via SGP). */
async function enrichVisits(rows: VisitRow[]): Promise<EnrichedVisit[]> {
  return Promise.all(
    rows.map(async (row) => {
      let customerName: string | undefined;
      try {
        const customer = await getCustomerByPhone(row.phone);
        customerName = customer.name;
      } catch {
        // keep undefined — frontend cai no telefone
      }

      return {
        id: row.id,
        customer_id: row.customer_id,
        phone: row.phone,
        customer_name: customerName,
        visit_date: row.visit_date,
        period: row.period,
        period_label: periodLabel(row.period),
        status: row.status,
        type: row.type ?? 'manutencao',
        address: row.address ?? undefined,
        bring_forward_status: row.bring_forward_status ?? 'none',
        created_at: row.created_at,
      };
    }),
  );
}

/** GET / — lista agendamentos com filtros e paginação. */
schedulesRouter.get('/', async (req, res) => {
  const status = String(req.query.status ?? 'all');
  const period = String(req.query.period ?? 'all');
  const date = String(req.query.date ?? '').trim();

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const columns = await resolveScheduleSelectColumns();

  let query = supabase
    .from('scheduled_visits')
    .select(columns, { count: 'exact' })
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status && status !== 'all') query = query.eq('status', status);
  if (period && period !== 'all') query = query.eq('period', period);
  if (date) query = query.eq('visit_date', date);

  const { data: rows, error, count } = await query;
  if (error) {
    console.error('[admin] schedules fetch failed:', error.message);
    res.status(500).json({ error: 'failed to fetch schedules' });
    return;
  }

  const data = (rows ?? []) as unknown as VisitRow[];

  const enriched = await enrichVisits(data);

  res.status(200).json({
    data: enriched,
    total: count ?? enriched.length,
    page,
  });
});

/** GET /today — agendamentos de hoje + contagem por período. */
schedulesRouter.get('/today', async (_req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const columns = await resolveScheduleSelectColumns();

  const { data: todayRows, error: todayError } = await supabase
    .from('scheduled_visits')
    .select(columns)
    .eq('visit_date', today)
    .order('period', { ascending: true })
    .order('created_at', { ascending: false });

  if (todayError) {
    console.error('[admin] schedules/today fetch failed:', todayError.message);
    res.status(500).json({ error: 'failed to fetch today schedules' });
    return;
  }

  const rows = (todayRows ?? []) as unknown as VisitRow[];
  const enriched = await enrichVisits(rows);

  const summary = {
    total: rows.length,
    morning: rows.filter((r) => r.period === 'morning').length,
    afternoon: rows.filter((r) => r.period === 'afternoon').length,
    pending: rows.filter((r) => r.status === 'scheduled').length,
  };

  res.status(200).json({
    data: enriched,
    total: rows.length,
    date: today,
    summary,
  });
});

/** PATCH /:id — atualizar status do agendamento. */
schedulesRouter.patch('/:id', async (req, res) => {
  const { status } = req.body as { status?: string };
  const allowed = ['scheduled', 'done', 'cancelled'];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: 'status must be one of scheduled|done|cancelled' });
    return;
  }

  const now = new Date().toISOString();
  const extended: Record<string, unknown> = { status, updated_at: now };
  if (status === 'done') extended.done_at = now;
  if (status === 'cancelled') extended.cancelled_at = now;

  let { data, error } = await supabase
    .from('scheduled_visits')
    .update(extended)
    .eq('id', req.params.id)
    .select('id')
    .single();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase
      .from('scheduled_visits')
      .update({ status })
      .eq('id', req.params.id)
      .select('id')
      .single());
  }

  if (error || !data) {
    res.status(404).json({ error: 'schedule not found' });
    return;
  }

  res.status(200).json({ ok: true, status });
});

/** PATCH /:id/reschedule — reagendar (nova data/período). */
schedulesRouter.patch('/:id/reschedule', async (req, res) => {
  const { visit_date, period } = req.body as { visit_date?: string; period?: string };
  if (!visit_date || (period !== 'morning' && period !== 'afternoon')) {
    res.status(400).json({ error: 'visit_date and period (morning|afternoon) are required' });
    return;
  }

  const base = {
    visit_date,
    period,
    status: 'scheduled',
    reminder_sent: false,
    followup_sent: false,
  };

  let { data, error } = await supabase
    .from('scheduled_visits')
    .update({ ...base, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id')
    .single();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase
      .from('scheduled_visits')
      .update(base)
      .eq('id', req.params.id)
      .select('id')
      .single());
  }

  if (error || !data) {
    res.status(404).json({ error: 'schedule not found' });
    return;
  }

  res.status(200).json({ ok: true, visit_date, period });
});

/** POST /:id/oferecer-antecipacao — envia ao cliente a oferta de antecipar a visita pra hoje. */
schedulesRouter.post('/:id/oferecer-antecipacao', async (req, res) => {
  const result = await offerBringForward(req.params.id, env.DEFAULT_TENANT_ID);
  if (!result.ok) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(200).json({ ok: true, phone: result.phone });
});

/** DELETE /:id — cancela (soft) o agendamento; nunca remove fisicamente. */
schedulesRouter.delete('/:id', async (req, res) => {
  const now = new Date().toISOString();
  let { data, error } = await supabase
    .from('scheduled_visits')
    .update({ status: 'cancelled', cancelled_at: now, updated_at: now })
    .eq('id', req.params.id)
    .select('id')
    .single();

  if (error && isMissingColumnError(error.message)) {
    ({ data, error } = await supabase
      .from('scheduled_visits')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .select('id')
      .single());
  }

  if (error || !data) {
    res.status(404).json({ error: 'schedule not found' });
    return;
  }

  res.status(200).json({ ok: true });
});
