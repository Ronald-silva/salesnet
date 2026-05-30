import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, type RoiReport } from '@/api/admin';

const PERIODS = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
] as const;

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/50 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function Reports() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, isError } = useQuery<RoiReport>({
    queryKey: ['roi-report', days],
    queryFn: () => adminApi.getRoiReport(days),
  });

  const modeEntries = data
    ? Object.entries(data.sessoes_por_modo).sort((a, b) => b[1] - a[1])
    : [];

  const tempoSegundos = data
    ? data.tempo_medio_resposta_ms > 0
      ? `${(data.tempo_medio_resposta_ms / 1000).toFixed(1)} s`
      : '—'
    : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Relatório de ROI</h2>
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1 rounded-md text-sm border ${
                days === p.value
                  ? 'bg-accent/20 text-accent border-accent/50'
                  : 'border-border/50 hover:bg-muted/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      )}

      {isError && (
        <p className="text-destructive text-sm">Erro ao carregar relatório.</p>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Taxa de resolução sem humano"
              value={`${data.taxa_resolucao_sem_humano}%`}
            />
            <MetricCard
              label="Tempo médio de resposta"
              value={tempoSegundos}
            />
            <MetricCard
              label="PIX gerados"
              value={data.pix_gerados}
            />
            <MetricCard
              label="Leads qualificados"
              value={data.leads_qualificados}
            />
            <MetricCard
              label="Chamados abertos"
              value={data.chamados_abertos}
            />
            <MetricCard
              label="NPS médio"
              value={
                data.nps_medio !== null
                  ? `${data.nps_medio} / 5 (${data.nps_total_respostas} resp.)`
                  : '— sem respostas'
              }
            />
            <MetricCard
              label="Custo LLM (estimado)"
              value={`US$ ${data.custo_llm_usd.toFixed(2)}`}
            />
            <MetricCard
              label="Tokens consumidos"
              value={data.total_tokens.toLocaleString('pt-BR')}
            />
          </div>

          {modeEntries.length > 0 && (
            <div className="rounded-lg border border-border/50 p-4">
              <h3 className="font-semibold mb-3">Sessões por modo</h3>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {modeEntries.map(([mode, count]) => (
                  <div key={mode} className="flex justify-between text-sm border-b border-border/30 pb-1">
                    <span className="capitalize text-muted-foreground">{mode}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Período: últimos {data.period_days} dias
          </p>
        </>
      )}
    </div>
  );
}
