/**
 * Admin — Alertas operacionais
 *
 * Consulta e atualização de `operational_alerts` (gerados pelo pattern-detector)
 * para o painel administrativo.
 */

import { Router } from 'express';
import { supabase } from '../config/supabase';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { env } from '../config/env';
import { adminTenantIds } from '../lib/admin-tenant';

export const alertsRouter = Router();
alertsRouter.use(adminAuthMiddleware);

const SELECT_COLUMNS =
  'id, tenant_id, alert_type, affected_area, affected_count, details, status, created_at, resolved_at';

/** GET / — lista alertas; por padrão só os abertos. ?status=all|open|acknowledged|resolved */
alertsRouter.get('/', async (req, res) => {
  const status = String(req.query.status ?? 'open');

  let query = supabase
    .from('operational_alerts')
    .select(SELECT_COLUMNS)
    .in('tenant_id', adminTenantIds())
    .order('created_at', { ascending: false })
    .limit(200);

  if (status && status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[admin] alerts fetch failed:', error.message);
    res.status(500).json({ error: 'failed to fetch alerts' });
    return;
  }

  // Contagem de abertos para o badge da navegação.
  const { count: openCount } = await supabase
    .from('operational_alerts')
    .select('id', { count: 'exact', head: true })
    .in('tenant_id', adminTenantIds())
    .eq('status', 'open');

  res.status(200).json({ data: data ?? [], openCount: openCount ?? 0 });
});

/** PATCH /:id — atualizar status (acknowledged|resolved|open). */
alertsRouter.patch('/:id', async (req, res) => {
  const { status } = req.body as { status?: string };
  const allowed = ['open', 'acknowledged', 'resolved'];
  if (!status || !allowed.includes(status)) {
    res.status(400).json({ error: 'status must be one of open|acknowledged|resolved' });
    return;
  }

  const updates: Record<string, unknown> = { status };
  updates.resolved_at = status === 'resolved' ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from('operational_alerts')
    .update(updates)
    .eq('id', req.params.id)
    .eq('tenant_id', env.DEFAULT_TENANT_ID)
    .select('id')
    .single();

  if (error || !data) {
    res.status(404).json({ error: 'alert not found' });
    return;
  }

  res.status(200).json({ ok: true, status });
});
