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
  input_tokens: number | null;
  output_tokens: number | null;
  llm_provider: string | null;
};

type NpsRow = { score: number };

// Custo estimado em USD por 1M tokens (input/output) por provedor.
const LLM_COST_PER_MTOK: Record<string, { input: number; output: number }> = {
  deepseek: { input: 0.27, output: 1.1 },
  anthropic: { input: 3, output: 15 },
};
const DEFAULT_LLM_COST = { input: 1, output: 3 };

function estimateLlmCostUsd(rows: LogRow[]): number {
  let usd = 0;
  for (const row of rows) {
    const provider = (row.llm_provider ?? '').toLowerCase();
    const rate = LLM_COST_PER_MTOK[provider] ?? DEFAULT_LLM_COST;
    const input = row.input_tokens ?? 0;
    const output = row.output_tokens ?? 0;
    usd += (input / 1_000_000) * rate.input + (output / 1_000_000) * rate.output;
  }
  return Math.round(usd * 10000) / 10000;
}

reportsRouter.get('/roi', async (req, res) => {
  const rawDays = Number(req.query.days ?? 30);
  const days = Math.min(Math.max(isNaN(rawDays) ? 30 : rawDays, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [logsRes, npsRes] = await Promise.all([
    supabase
      .from('interaction_logs')
      .select('phone, tool_calls, session_mode, processing_ms, input_tokens, output_tokens, llm_provider')
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

  const custoLlmUsd = estimateLlmCostUsd(logs);
  const totalTokens = logs.reduce(
    (acc, l) => acc + (l.input_tokens ?? 0) + (l.output_tokens ?? 0),
    0,
  );

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
    custo_llm_usd: custoLlmUsd,
    total_tokens: totalTokens,
  });
});
