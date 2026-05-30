import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function CampaignManager() {
  const queryClient = useQueryClient();
  const [neighborhood, setNeighborhood] = useState('');
  const [message, setMessage] = useState('');

  const campaigns = useQuery({
    queryKey: ['admin-campaigns'],
    queryFn: adminApi.getCampaigns,
    refetchInterval: 15000,
  });

  const expansion = useMutation({
    mutationFn: () => adminApi.runExpansionCampaign(neighborhood, message),
    onSuccess: () => {
      setNeighborhood('');
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] });
    },
  });

  const list = campaigns.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Gerenciador de campanhas</h2>

      {campaigns.isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar campanhas</AlertTitle>
          <AlertDescription>
            {(campaigns.error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {campaigns.isLoading &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`campaign-skeleton-${i}`} className="h-24 w-full rounded-lg" />
          ))}

        {!campaigns.isLoading && list.length === 0 && (
          <p className="text-sm text-muted-foreground md:col-span-2 py-4">
            Nenhuma campanha enviada ainda.
          </p>
        )}

        {list.map((campaign) => (
          <div key={campaign.type} className="rounded-lg border border-border/50 p-4">
            <p className="font-semibold capitalize">{campaign.type.replace(/_/g, ' ')}</p>
            <p className="text-sm text-muted-foreground">Total enviado: {campaign.totalSent}</p>
            <p className="text-sm text-muted-foreground">
              Último envio: {new Date(campaign.lastSentAt).toLocaleString('pt-BR')}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border/50 p-4 space-y-3">
        <h3 className="font-semibold">Disparar campanha de expansão manual</h3>
        <p className="text-sm text-muted-foreground">
          Envia a mensagem para todos na lista de espera (waitlist) do bairro informado.
        </p>
        <Input
          placeholder="Bairro"
          value={neighborhood}
          onChange={(e) => setNeighborhood(e.target.value)}
        />
        <Textarea
          placeholder="Mensagem da campanha"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        {expansion.isError && (
          <p className="text-sm text-destructive">
            {(expansion.error as Error)?.message ?? 'Falha ao disparar campanha.'}
          </p>
        )}
        {expansion.isSuccess && (
          <p className="text-sm text-accent">Campanha disparada com sucesso.</p>
        )}
        <Button
          onClick={() => expansion.mutate()}
          disabled={!neighborhood || !message || expansion.isPending}
        >
          {expansion.isPending ? 'Disparando...' : 'Disparar expansão'}
        </Button>
      </div>
    </div>
  );
}
