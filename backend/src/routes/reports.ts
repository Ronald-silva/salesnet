import { Router } from 'express';
import { supabase } from '../config/supabase';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import { env } from '../config/env';

export const reportsRouter = Router();
reportsRouter.use(adminAuthMiddleware);

type LogRow = {
  phone: string;
  tool_calls: Array<{ name: string }>;
  session_mode: string | null;
  processing_ms: number | null;
};

type NpsRow = { score: number };

reportsRouter.get('/roi', async (req, res) => {
  const rawDays = Number(req.query.days ?? 30);
  const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [logsRes, npsRes] = await Promise.all([
    supabase
      .from('interaction_logs')
      .select('phone, tool_calls, session_mode, processing_ms')
      .eq('tenant_id', env.DEFAULT_TENANT_ID)
      .gte('created_at', since),
    supabase
      .from('nps_responses')
      .select('score')
      .eq('tenant_id', env.DEFAULT_TENANT_ID)
      .gte('created_at', since),
  ]);

  if (logsRes.error) {
    res.status(500).json({ error: 'failed to fetch interaction_logs' });
    return;
  }

  const logs = (logsRes.data ?? []) as LogRow[];
  const npsRows = (npsRes.data ?? []) as NpsRow[];

  // Unique phones = unique sessions
  const phoneSet = new Set(logs.map(l => l.phone));
  const totalSessions = phoneSet.size;

  const phonesWithHuman = new Set(
    logs
      .filter(l => l.tool_calls.some(tc => tc.name === 'transferir_humano'))
      .map(l => l.phone),
  );
  const taxaResolucao = totalSessions > 0
    ? Math.round(((totalSessions - phonesWithHuman.size) / totalSessions) * 100)
    : 0;

  const msValues = logs
    .map(l => l.processing_ms)
    .filter((v): v is number => v !== null && v > 0);
  const tempoMedio = msValues.length > 0
    ? Math.round(msValues.reduce((a, b) => a + b, 0) / msValues.length)
    : 0;

  const sessoesPorModo: Record<string, number> = {};
  for (const log of logs) {
    const mode = log.session_mode ?? 'unknown';
    sessoesPorModo[mode] = (sessoesPorModo[mode] ?? 0) + 1;
  }

  let pixGerados = 0;
  let leadsQualificados = 0;
  let chamadosAbertos = 0;
  for (const log of logs) {
    if (log.tool_calls.some(tc => tc.name === 'gerar_pix')) pixGerados++;
    if (log.tool_calls.some(tc => tc.name === 'registrar_interesse')) leadsQualificados++;
    if (log.tool_calls.some(tc => tc.name === 'abrir_chamado')) chamadosAbertos++;
  }

  const npsTotal = npsRows.length;
  const npsMedio = npsTotal > 0
    ? Math.round((npsRows.reduce((a, b) => a + b.score, 0) / npsTotal) * 10) / 10
    : null;

  res.status(200).json({
    period_days: days,
    taxa_resolucao_sem_humano: taxaResolucao,
    tempo_medio_resposta_ms: tempoMedio,
    sessoes_por_modo: sessoesPorModo,
    pix_gerados: pixGerados,
    leads_qualificados: leadsQualificados,
    chamados_abertos: chamadosAbertos,
    nps_medio: npsMedio,
    nps_total_respostas: npsTotal,
  });
});
