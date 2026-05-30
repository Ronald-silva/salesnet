import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Wifi,
  DollarSign,
  Users,
  Gauge,
  TrendingDown,
  CheckCircle2,
} from 'lucide-react';
import { adminApi, type AlertType, type AlertStatus, type OperationalAlert } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

const TYPE_META: Record<
  AlertType,
  { label: string; icon: typeof Wifi; badgeClass: string }
> = {
  outage_cluster: {
    label: 'Cluster de quedas',
    icon: Wifi,
    badgeClass: 'bg-destructive/15 text-destructive border-destructive/30',
  },
  billing_spike: {
    label: 'Spike de cobrança',
    icon: DollarSign,
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  },
  churn_wave: {
    label: 'Onda de churn',
    icon: Users,
    badgeClass: 'bg-destructive/15 text-destructive border-destructive/30',
  },
  slow_speed_cluster: {
    label: 'Cluster de lentidão',
    icon: Gauge,
    badgeClass: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  },
  nps_drop: {
    label: 'Queda de NPS',
    icon: TrendingDown,
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  },
};

function describe(alert: OperationalAlert): string {
  const count = alert.affected_count ?? 0;
  switch (alert.alert_type) {
    case 'outage_cluster':
      return `${count} chamados de queda em ${alert.affected_area ?? 'bairro'} nas últimas 2h. Possível problema na rede.`;
    case 'billing_spike': {
      const ratio = (alert.details?.ratio as number | undefined)?.toFixed(1) ?? '?';
      return `${ratio}x acima da média (${count} sessões de cobrança em 2h). Verificar faturas com erro.`;
    }
    case 'churn_wave':
      return `${count} clientes com risco de cancelamento nas últimas 24h.`;
    case 'slow_speed_cluster':
      return `${count} reclamações de lentidão em ${alert.affected_area ?? 'bairro'}. Verificar infraestrutura.`;
    case 'nps_drop': {
      const avg24 = alert.details?.avg_24h as number | undefined;
      const avg7 = alert.details?.avg_7d as number | undefined;
      const drop = avg24 != null && avg7 != null ? (avg7 - avg24).toFixed(1) : '?';
      return `NPS caiu ${drop} pontos nas últimas 24h. Verificar detratores no painel.`;
    }
    default:
      return '';
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: AlertStatus }) {
  const map: Record<AlertStatus, { label: string; className: string }> = {
    open: { label: 'Aberto', className: 'bg-destructive/15 text-destructive border-destructive/30' },
    acknowledged: { label: 'Reconhecido', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    resolved: { label: 'Resolvido', className: 'bg-accent/15 text-accent border-accent/30' },
  };
  const meta = map[status];
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  );
}

export default function Alerts() {
  const queryClient = useQueryClient();

  const alerts = useQuery({
    queryKey: ['admin-alerts'],
    queryFn: () => adminApi.getAlerts('open'),
    refetchInterval: 5 * 60 * 1000,
  });

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AlertStatus }) =>
      adminApi.updateAlertStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-alerts'] }),
  });

  const rows = alerts.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <h2 className="text-2xl font-bold">Alertas Operacionais</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Anomalias detectadas automaticamente a cada 30 minutos. Atualiza sozinho a cada 5 min.
      </p>

      {alerts.isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription>
            {(alerts.error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      {alerts.isLoading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`alert-skeleton-${i}`} className="h-32 w-full" />
          ))}
        </div>
      )}

      {!alerts.isLoading && rows.length === 0 && (
        <Card className="border-accent/30 bg-accent/5">
          <CardContent className="flex items-center gap-3 py-10 justify-center text-center">
            <CheckCircle2 className="h-6 w-6 text-accent" />
            <p className="text-muted-foreground">Nenhuma anomalia detectada</p>
          </CardContent>
        </Card>
      )}

      {!alerts.isLoading && rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((alert) => {
            const meta = TYPE_META[alert.alert_type];
            const Icon = meta.icon;
            return (
              <Card key={alert.id} className="border-border/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className={meta.badgeClass}>
                      <Icon className="h-3.5 w-3.5 mr-1" />
                      {meta.label}
                    </Badge>
                    <StatusBadge status={alert.status} />
                  </div>

                  <p className="text-sm">{describe(alert)}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {alert.affected_area && <span>Área: {alert.affected_area}</span>}
                    {alert.affected_count != null && <span>Qtd: {alert.affected_count}</span>}
                    <span>{formatTime(alert.created_at)}</span>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending || alert.status !== 'open'}
                      onClick={() => update.mutate({ id: alert.id, status: 'acknowledged' })}
                    >
                      Reconhecer
                    </Button>
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={() => update.mutate({ id: alert.id, status: 'resolved' })}
                    >
                      Resolver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
