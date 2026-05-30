import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function LevelBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const map = {
    high: 'bg-destructive/15 text-destructive border-destructive/30',
    medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    low: 'bg-accent/15 text-accent border-accent/30',
  } as const;
  return (
    <Badge variant="outline" className={map[level]}>
      {level === 'high' ? 'Alto' : level === 'medium' ? 'Médio' : 'Baixo'}
    </Badge>
  );
}

function daysInRisk(createdAt: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000));
}

export default function ChurnRiskList() {
  const queryClient = useQueryClient();
  const churn = useQuery({
    queryKey: ['admin-churn-risks'],
    queryFn: adminApi.getChurnRisks,
    refetchInterval: 15000,
  });

  const outreach = useMutation({
    mutationFn: (id: string) => adminApi.churnOutreach(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-churn-risks'] }),
  });

  const rows = churn.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Clientes em risco de cancelamento</h2>

      {churn.isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription>
            {(churn.error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Plano</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Nível</TableHead>
              <TableHead>NPS</TableHead>
              <TableHead>Dias em risco</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {churn.isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={`churn-skeleton-${i}`}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={`churn-cell-${j}`}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!churn.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum cliente em risco no momento.
                </TableCell>
              </TableRow>
            )}

            {!churn.isLoading &&
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.plan}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{row.reason}</TableCell>
                  <TableCell>
                    <LevelBadge level={row.level} />
                  </TableCell>
                  <TableCell>
                    {row.nps_score === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          row.nps_score <= 2
                            ? 'bg-destructive/15 text-destructive border-destructive/30'
                            : 'bg-muted text-muted-foreground'
                        }
                      >
                        {row.nps_score}/5
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{daysInRisk(row.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={outreach.isPending}
                      onClick={() => outreach.mutate(row.id)}
                    >
                      Enviar oferta
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
