import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Clientes em risco de cancelamento</h2>
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <div className="grid grid-cols-7 gap-3 px-4 py-3 text-xs uppercase tracking-wide text-muted-foreground border-b border-border/50">
          <span>Nome</span>
          <span>Plano</span>
          <span>Motivo</span>
          <span>Nível</span>
          <span>Dias em risco</span>
          <span>Status</span>
          <span>Ações</span>
        </div>
        {(churn.data ?? []).map((row) => (
          <div key={row.id} className="grid grid-cols-7 gap-3 px-4 py-3 border-b border-border/30 items-center text-sm">
            <span>{row.name}</span>
            <span>{row.plan}</span>
            <span>{row.reason}</span>
            <span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                row.level === 'high' ? 'bg-destructive/20 text-destructive' : row.level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-accent/20 text-accent'
              }`}>
                {row.level}
              </span>
            </span>
            <span>{Math.max(1, Math.floor((Date.now() - new Date(row.created_at).getTime()) / 86400000))}</span>
            <span>{row.status}</span>
            <span>
              <Button size="sm" variant="outline" onClick={() => outreach.mutate(row.id)}>
                Enviar oferta
              </Button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
