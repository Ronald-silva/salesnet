import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { adminApi } from '@/api/admin';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function Metrics() {
  const metrics = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: adminApi.getMetrics,
    refetchInterval: 15000,
  });

  const data = metrics.data;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">KPIs do dia/semana/mês</h2>

      {metrics.isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar métricas</AlertTitle>
          <AlertDescription>
            {(metrics.error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-lg border border-border/50 p-4"><p className="text-sm text-muted-foreground">Total de conversas</p><p className="text-2xl font-bold">{data?.totalConversations ?? 0}</p></div>
        <div className="rounded-lg border border-border/50 p-4"><p className="text-sm text-muted-foreground">% resolvido pelo bot</p><p className="text-2xl font-bold">{data?.botResolutionRate ?? 0}%</p></div>
        <div className="rounded-lg border border-border/50 p-4"><p className="text-sm text-muted-foreground">Receita recuperada</p><p className="text-2xl font-bold">R$ {data?.recoveredRevenue ?? 0}</p></div>
        <div className="rounded-lg border border-border/50 p-4"><p className="text-sm text-muted-foreground">Novos clientes via bot</p><p className="text-2xl font-bold">{data?.newLeadsFromBot ?? 0}</p></div>
        <div className="rounded-lg border border-border/50 p-4"><p className="text-sm text-muted-foreground">Churn risks ativos</p><p className="text-2xl font-bold">{data?.activeChurnRisks ?? 0}</p></div>
        <div className="rounded-lg border border-border/50 p-4"><p className="text-sm text-muted-foreground">Campanhas / taxa resposta</p><p className="text-2xl font-bold">{data?.campaignsSent ?? 0} / {data?.campaignResponseRate ?? 0}%</p></div>
      </div>

      <div className="rounded-lg border border-border/50 p-4 h-80">
        <h3 className="font-semibold mb-3">Tendência de conversas</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data?.trend ?? []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="conversations" fill="#00ff95" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
