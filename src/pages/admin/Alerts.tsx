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
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
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
    <div className="space-y-5">
      <AdminPageHeader
        title="Alertas Operacionais"
        description="Anomalias detectadas a cada 30 minutos. Atualização automática a cada 5 min."
        icon={<AlertTriangle className="h-5 w-5" />}
      />

      {alerts.isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription>
            {(alerts.error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      {alerts.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`alert-skeleton-${i}`} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!alerts.isLoading && rows.length === 0 && (
        <Card className="border-accent/30 bg-accent/5 rounded-xl">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center px-4">
            <CheckCircle2 className="h-10 w-10 text-accent" />
            <p className="text-muted-foreground text-sm">Nenhuma anomalia detectada</p>
          </CardContent>
        </Card>
      )}

      {!alerts.isLoading && rows.length > 0 && (
        <div className="space-y-3 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
          {rows.map((alert) => {
            const meta = TYPE_META[alert.alert_type];
            const Icon = meta.icon;
            return (
              <Card key={alert.id} className="border-border/50 rounded-xl overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <Badge variant="outline" className={`w-fit ${meta.badgeClass}`}>
                      <Icon className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                      {meta.label}
                    </Badge>
                    <StatusBadge status={alert.status} />
                  </div>

                  <p className="text-sm leading-relaxed">{describe(alert)}</p>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {alert.affected_area && <span>Área: {alert.affected_area}</span>}
                    {alert.affected_count != null && <span>Qtd: {alert.affected_count}</span>}
                    <span>{formatTime(alert.created_at)}</span>
                  </div>

                  <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                    <Button
                      size="default"
                      variant="outline"
                      className="w-full min-h-[44px] sm:flex-1"
                      disabled={update.isPending || alert.status !== 'open'}
                      onClick={() => update.mutate({ id: alert.id, status: 'acknowledged' })}
                    >
                      Reconhecer
                    </Button>
                    <Button
                      size="default"
                      className="w-full min-h-[44px] sm:flex-1"
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
