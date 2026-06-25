/**
 * Pattern Detector — detecção de padrões operacionais
 *
 * Cron a cada 30 min. Varre os dados de atendimento e abre `operational_alerts`
 * quando detecta anomalias em escala, antes que virem reclamação massiva:
 *
 *   1. outage_cluster      — ≥ 3 chamados de queda no mesmo bairro em 2h
 *   2. billing_spike       — sessões de cobrança em 2h > 2x a média dos 7 dias
 *   3. churn_wave          — > 5 marcações de churn em 24h
 *   4. slow_speed_cluster  — ≥ 3 reclamações de lentidão do mesmo bairro em 4h
 *   5. nps_drop            — média de NPS em 24h caiu > 1 ponto vs 7 dias
 *
 * Cada alerta novo dispara um WhatsApp para ADMIN_ALERT_PHONE.
 * Dedup: não cria novo alerta se já existe um 'open' do mesmo tipo (+ área) nas
 * últimas 4h.
 */

import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { whatsappService } from '../services/whatsapp-service';
import { getCustomerByPhone } from '../integrations/sgp';

type AlertType =
  | 'outage_cluster'
  | 'billing_spike'
  | 'churn_wave'
  | 'slow_speed_cluster'
  | 'nps_drop';

/** Guard to prevent overlapping detection cycles. */
let isDetecting = false;

interface CreateAlertInput {
  type: AlertType;
  affectedArea?: string | null;
  affectedCount?: number | null;
  details?: Record<string, unknown>;
  message: string;
}

const MS_HOUR = 60 * 60 * 1000;

function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * MS_HOUR).toISOString();
}

/** Palavras que indicam reclamação de lentidão (não queda total). */
const SLOW_SPEED_RE =
  /\b(lent[ao]|lentid[ãa]o|devagar|travand[oa]?|trava|buffer|oscila(ndo|[çc][ãa]o)?|caind[oa]|velocidade baixa|internet ruim|p[ée]ssim[ao])\b/i;

/**
 * Verifica se já existe alerta 'open' do mesmo tipo (e área, quando aplicável)
 * nas últimas 4h. Evita reabrir o mesmo alerta a cada ciclo de 30 min.
 */
async function existsRecentOpenAlert(
  tenantId: string,
  type: AlertType,
  area?: string | null,
): Promise<boolean> {
  let query = supabase
    .from('operational_alerts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('alert_type', type)
    .eq('status', 'open')
    .gte('created_at', hoursAgoIso(4))
    .limit(1);

  query = area ? query.eq('affected_area', area) : query.is('affected_area', null);

  const { data, error } = await query;
  if (error) {
    console.error(`[pattern-detector] dedup check failed (${type}):`, error.message);
    // Em caso de erro, assume que existe para não duplicar alertas/notificações.
    return true;
  }
  return (data?.length ?? 0) > 0;
}

/** Insere o alerta e notifica o admin (best-effort). */
async function createAlert(tenantId: string, input: CreateAlertInput): Promise<void> {
  const { error } = await supabase.from('operational_alerts').insert({
    tenant_id: tenantId,
    alert_type: input.type,
    affected_area: input.affectedArea ?? null,
    affected_count: input.affectedCount ?? null,
    details: input.details ?? {},
    status: 'open',
  });

  if (error) {
    console.error(`[pattern-detector] insert failed (${input.type}):`, error.message);
    return;
  }

  console.log(
    `[pattern-detector] ALERT ${input.type}` +
      (input.affectedArea ? ` area=${input.affectedArea}` : '') +
      (input.affectedCount != null ? ` count=${input.affectedCount}` : ''),
  );

  await notifyAdmin(tenantId, input.message);
}

async function notifyAdmin(tenantId: string, message: string): Promise<void> {
  const to = env.ADMIN_ALERT_PHONE;
  if (!to) {
    console.warn('[pattern-detector] ADMIN_ALERT_PHONE not set — skipping notification');
    return;
  }
  try {
    await whatsappService.sendText(tenantId, to, message);
  } catch (err) {
    console.error('[pattern-detector] admin notification failed:', err);
  }
}

// ── Detector 1 — cluster de quedas por bairro ────────────────────────────────
async function detectOutageCluster(tenantId: string): Promise<void> {
  // outage_reports usa neighborhood/reported_at e não tem tenant_id (single-tenant).
  const { data, error } = await supabase
    .from('outage_reports')
    .select('neighborhood')
    .gte('reported_at', hoursAgoIso(2));

  if (error) {
    console.error('[pattern-detector] outage query failed:', error.message);
    return;
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ neighborhood: string | null }>) {
    const bairro = (row.neighborhood ?? '').trim();
    if (!bairro) continue;
    counts.set(bairro, (counts.get(bairro) ?? 0) + 1);
  }

  for (const [bairro, total] of counts) {
    if (total < 3) continue;
    if (await existsRecentOpenAlert(tenantId, 'outage_cluster', bairro)) continue;
    await createAlert(tenantId, {
      type: 'outage_cluster',
      affectedArea: bairro,
      affectedCount: total,
      details: { window_hours: 2 },
      message:
        `Atenção: ${total} chamados de queda em ${bairro} nas últimas 2h. ` +
        `Possível problema na rede.`,
    });
  }
}

// ── Detector 2 — spike de cobrança ───────────────────────────────────────────
async function detectBillingSpike(tenantId: string): Promise<void> {
  const [recentResult, baselineResult] = await Promise.all([
    supabase
      .from('interaction_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('session_mode', 'billing')
      .gte('created_at', hoursAgoIso(2)),
    supabase
      .from('interaction_logs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('session_mode', 'billing')
      .gte('created_at', hoursAgoIso(24 * 7 + 2))
      .lt('created_at', hoursAgoIso(2)),
  ]);

  if (recentResult.error || baselineResult.error) {
    console.error(
      '[pattern-detector] billing query failed:',
      recentResult.error?.message ?? baselineResult.error?.message,
    );
    return;
  }

  const recent = recentResult.count ?? 0;
  const baselineTotal = baselineResult.count ?? 0;
  // 7 dias = 168h → 84 janelas de 2h.
  const baselineAvg = baselineTotal / 84;

  // Exige um mínimo absoluto para não disparar com volume irrisório.
  if (recent < 3 || baselineAvg <= 0) return;

  const ratio = recent / baselineAvg;
  if (ratio <= 2) return;

  if (await existsRecentOpenAlert(tenantId, 'billing_spike')) return;

  const ratioLabel = ratio.toFixed(1);
  await createAlert(tenantId, {
    type: 'billing_spike',
    affectedCount: recent,
    details: { recent_2h: recent, baseline_avg_2h: Number(baselineAvg.toFixed(2)), ratio: Number(ratio.toFixed(2)) },
    message:
      `Spike de cobrança detectado: ${ratioLabel}x acima da média ` +
      `(${recent} sessões de cobrança nas últimas 2h). Verificar faturas com erro.`,
  });
}

// ── Detector 3 — onda de churn ───────────────────────────────────────────────
async function countChurnRiskToolCalls(tenantId: string, sinceIso: string): Promise<number> {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select('tool_calls')
    .eq('tenant_id', tenantId)
    .gte('created_at', sinceIso);

  if (error) {
    const detail =
      error.message ||
      (error as { code?: string; details?: string }).code ||
      (error as { details?: string }).details ||
      JSON.stringify(error);
    throw new Error(detail);
  }

  return (data ?? []).filter((row) => {
    const calls = row.tool_calls as Array<{ name?: string }> | null;
    return Array.isArray(calls) && calls.some((t) => t.name === 'marcar_churn_risk');
  }).length;
}

async function detectChurnWave(tenantId: string): Promise<void> {
  let total: number;
  try {
    total = await countChurnRiskToolCalls(tenantId, hoursAgoIso(24));
  } catch (err) {
    console.error('[pattern-detector] churn query failed:', err instanceof Error ? err.message : err);
    return;
  }
  if (total <= 5) return;
  if (await existsRecentOpenAlert(tenantId, 'churn_wave')) return;

  await createAlert(tenantId, {
    type: 'churn_wave',
    affectedCount: total,
    details: { window_hours: 24 },
    message:
      `${total} clientes com risco de cancelamento nas últimas 24h. Verificar painel.`,
  });
}

// ── Detector 4 — cluster de lentidão por bairro ──────────────────────────────

const SLOW_SPEED_BATCH_LIMIT = 20;

async function withConcurrencyLimit<T>(
  items: string[],
  limit: number,
  fn: (item: string) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

async function detectSlowSpeedCluster(tenantId: string): Promise<void> {
  const since = hoursAgoIso(4);

  // Telefones com sessão de suporte nas últimas 4h.
  const { data: logs, error } = await supabase
    .from('interaction_logs')
    .select('phone')
    .eq('tenant_id', tenantId)
    .eq('session_mode', 'support')
    .gte('created_at', since);

  if (error) {
    console.error('[pattern-detector] slow-speed query failed:', error.message);
    return;
  }

  const supportPhones = [...new Set((logs ?? []).map((r) => (r as { phone: string }).phone))];
  if (supportPhones.length === 0) return;

  // Cap the number of phones processed per cycle to avoid excessive SGP calls.
  const phonesSlice = supportPhones.slice(0, SLOW_SPEED_BATCH_LIMIT);

  // Confirma keyword de lentidão em mensagem recente do cliente.
  const sinceMs = Date.parse(since);
  const phonesWithSlowComplaint: string[] = [];

  for (const phone of phonesSlice) {
    const { data: thread } = await supabase
      .from('conversation_threads')
      .select('messages')
      .eq('tenant_id', tenantId)
      .eq('phone', phone)
      .maybeSingle();

    const messages = (thread?.messages ?? []) as Array<{
      role: string;
      content: string;
      timestamp?: string;
    }>;

    const hasSlowComplaint = messages.some(
      (m) =>
        m.role === 'user' &&
        SLOW_SPEED_RE.test(m.content) &&
        (!m.timestamp || Date.parse(m.timestamp) >= sinceMs),
    );

    if (hasSlowComplaint) phonesWithSlowComplaint.push(phone);
  }

  if (phonesWithSlowComplaint.length < 3) return;

  // Agrupa por bairro (resolução best-effort via SGP, batches de 5 simultâneos).
  const neighborhoods = await withConcurrencyLimit(
    phonesWithSlowComplaint,
    5,
    async (phone) => {
      try {
        const customer = await getCustomerByPhone(phone);
        return customer.address?.neighborhood?.trim() ?? null;
      } catch {
        // sem cliente/bairro — ignora no agrupamento
        return null;
      }
    },
  );

  const byNeighborhood = new Map<string, number>();
  for (const bairro of neighborhoods) {
    if (!bairro) continue;
    byNeighborhood.set(bairro, (byNeighborhood.get(bairro) ?? 0) + 1);
  }

  for (const [bairro, total] of byNeighborhood) {
    if (total < 3) continue;
    if (await existsRecentOpenAlert(tenantId, 'slow_speed_cluster', bairro)) continue;
    await createAlert(tenantId, {
      type: 'slow_speed_cluster',
      affectedArea: bairro,
      affectedCount: total,
      details: { window_hours: 4 },
      message:
        `${total} reclamações de lentidão em ${bairro}. Verificar infraestrutura.`,
    });
  }
}

// ── Detector 5 — queda de NPS ────────────────────────────────────────────────
function average(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

async function detectNpsDrop(tenantId: string): Promise<void> {
  const { data, error } = await supabase
    .from('nps_responses')
    .select('score, created_at')
    .eq('tenant_id', tenantId)
    .gte('created_at', hoursAgoIso(24 * 7));

  if (error) {
    console.error('[pattern-detector] nps query failed:', error.message);
    return;
  }

  const rows = (data ?? []) as Array<{ score: number | null; created_at: string }>;
  const cutoff24h = Date.now() - 24 * MS_HOUR;

  const last24h: number[] = [];
  const last7d: number[] = [];
  for (const row of rows) {
    if (row.score == null) continue;
    last7d.push(row.score);
    if (Date.parse(row.created_at) >= cutoff24h) last24h.push(row.score);
  }

  // Exige amostra mínima nas 24h para evitar ruído estatístico.
  if (last24h.length < 3) return;

  const avg24h = average(last24h);
  const avg7d = average(last7d);
  if (avg24h == null || avg7d == null) return;

  const drop = avg7d - avg24h;
  if (drop <= 1) return;

  if (await existsRecentOpenAlert(tenantId, 'nps_drop')) return;

  const dropLabel = drop.toFixed(1);
  await createAlert(tenantId, {
    type: 'nps_drop',
    affectedCount: last24h.length,
    details: {
      avg_24h: Number(avg24h.toFixed(2)),
      avg_7d: Number(avg7d.toFixed(2)),
      responses_24h: last24h.length,
    },
    message:
      `NPS caiu ${dropLabel} pontos nas últimas 24h. Verificar detratores no painel.`,
  });
}

/**
 * Executa todos os detectores com guarda contra ciclos sobrepostos.
 */
async function runDetectionCycle(tenantId: string): Promise<void> {
  if (isDetecting) {
    console.warn('[pattern-detector] skipping cycle — previous run still active');
    return;
  }
  isDetecting = true;
  try {
    const detectors: Array<[string, Promise<void>]> = [
      ['outage_cluster', detectOutageCluster(tenantId)],
      ['billing_spike', detectBillingSpike(tenantId)],
      ['churn_wave', detectChurnWave(tenantId)],
      ['slow_speed_cluster', detectSlowSpeedCluster(tenantId)],
      ['nps_drop', detectNpsDrop(tenantId)],
    ];

    const results = await Promise.allSettled(detectors.map(([, p]) => p));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        console.error(`[pattern-detector] ${detectors[i][0]} failed:`, result.reason);
      }
    });
  } finally {
    isDetecting = false;
  }
}

/** Executa todos os detectores para o tenant padrão. */
export async function runPatternDetection(): Promise<void> {
  const tenantId = env.DEFAULT_TENANT_ID;
  console.log('[pattern-detector] running detection cycle');
  await runDetectionCycle(tenantId);
}
