import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function CampaignManager() {
  const queryClient = useQueryClient();
  const [neighborhood, setNeighborhood] = useState('');
  const [message, setMessage] = useState('');
  const [paused, setPaused] = useState(false);

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

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Gerenciador de campanhas</h2>

      <div className="grid gap-3 md:grid-cols-2">
        {(campaigns.data ?? []).map((campaign) => (
          <div key={campaign.type} className="rounded-lg border border-border/50 p-4">
            <p className="font-semibold capitalize">{campaign.type.replace(/_/g, ' ')}</p>
            <p className="text-sm text-muted-foreground">Total enviado: {campaign.totalSent}</p>
            <p className="text-sm text-muted-foreground">Último envio: {new Date(campaign.lastSentAt).toLocaleString('pt-BR')}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border/50 p-4 space-y-3">
        <h3 className="font-semibold">Disparar campanha de expansão manual</h3>
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
        <Button
          onClick={() => expansion.mutate()}
          disabled={!neighborhood || !message || expansion.isPending}
        >
          {expansion.isPending ? 'Disparando...' : 'Disparar expansão'}
        </Button>
      </div>

      <div className="rounded-lg border border-border/50 p-4">
        <h3 className="font-semibold mb-2">Controle de emergência</h3>
        <Button variant="outline" onClick={() => setPaused((prev) => !prev)}>
          {paused ? 'Retomar cron jobs de cobrança' : 'Pausar cron jobs de cobrança'}
        </Button>
        <p className="text-sm text-muted-foreground mt-2">
          Estado atual: {paused ? 'Pausado (somente visual nesta versão)' : 'Ativo'}
        </p>
      </div>
    </div>
  );
}
