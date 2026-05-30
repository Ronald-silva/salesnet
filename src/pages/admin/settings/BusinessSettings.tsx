import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type BusinessConfig, type BusinessConfigPatch } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Plus, Trash2 } from 'lucide-react';

type PlanDraft = BusinessConfig['plans'][number];

export default function BusinessSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-config'],
    queryFn: adminApi.getConfig,
  });

  const [agentName, setAgentName] = useState('');
  const [whatsappHours, setWhatsappHours] = useState('');
  const [humanHours, setHumanHours] = useState('');
  const [installationFee, setInstallationFee] = useState('');
  const [tone, setTone] = useState('');
  const [llmBudget, setLlmBudget] = useState('');
  const [neighborhoods, setNeighborhoods] = useState('');
  const [plans, setPlans] = useState<PlanDraft[]>([]);

  useEffect(() => {
    if (!data) return;
    setAgentName(data.business.agentName);
    setWhatsappHours(data.business.whatsappSupportHours);
    setHumanHours(data.business.humanSupportHours ?? '');
    setInstallationFee(String(data.business.installationFeeReais));
    setTone(data.toneOverride ?? '');
    setLlmBudget(data.llmDailyBudget !== null ? String(data.llmDailyBudget) : '');
    setNeighborhoods(data.coveredNeighborhoods.join('\n'));
    setPlans(data.plans);
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: BusinessConfigPatch) => adminApi.updateConfig(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-config'] }),
  });

  function updatePlan(index: number, field: keyof PlanDraft, value: string) {
    setPlans((prev) =>
      prev.map((p, i) => {
        if (i !== index) return p;
        if (field === 'name') return { ...p, name: value };
        if (field === 'popular') return { ...p, popular: value === 'true' };
        return { ...p, [field]: Number(value) } as PlanDraft;
      }),
    );
  }

  function addPlan() {
    setPlans((prev) => [...prev, { name: '', downloadMbps: 0, uploadMbps: 0, priceMonthly: 0 }]);
  }

  function removePlan(index: number) {
    setPlans((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    const patch: BusinessConfigPatch = {
      business: {
        agentName: agentName.trim(),
        whatsappSupportHours: whatsappHours.trim(),
        humanSupportHours: humanHours.trim() || undefined,
        installationFeeReais: Number(installationFee) || 0,
      },
      coveredNeighborhoods: neighborhoods
        .split('\n')
        .map((n) => n.trim())
        .filter(Boolean),
      plans: plans.filter((p) => p.name.trim()),
      toneOverride: tone.trim() || null,
      llmDailyBudget: llmBudget.trim() ? Number(llmBudget) : null,
    };
    save.mutate(patch);
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Erro ao carregar configurações</AlertTitle>
        <AlertDescription>
          {(error as Error)?.message ?? 'Tente novamente em instantes.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Agente e atendimento ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/50 p-6 space-y-4">
        <h2 className="font-medium">Agente e atendimento</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="agentName">Nome do agente</Label>
            <Input id="agentName" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="installFee">Taxa de instalação (R$)</Label>
            <Input
              id="installFee"
              type="number"
              value={installationFee}
              onChange={(e) => setInstallationFee(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="waHours">Horário de atendimento (WhatsApp)</Label>
            <Input id="waHours" value={whatsappHours} onChange={(e) => setWhatsappHours(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="humanHours">Horário de atendimento humano</Label>
            <Input id="humanHours" value={humanHours} onChange={(e) => setHumanHours(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tone">Tom do agente (opcional)</Label>
          <Textarea
            id="tone"
            rows={3}
            placeholder="Ex.: tom amigável, próximo, sem formalidade excessiva."
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          />
        </div>
        <div className="space-y-1 max-w-xs">
          <Label htmlFor="llmBudget">Budget diário de LLM (US$)</Label>
          <Input
            id="llmBudget"
            type="number"
            placeholder="Sem limite"
            value={llmBudget}
            onChange={(e) => setLlmBudget(e.target.value)}
          />
        </div>
      </section>

      {/* ── Planos ───────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Planos</h2>
          <Button variant="outline" size="sm" onClick={addPlan}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
        <div className="space-y-3">
          {plans.map((plan, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_repeat(3,90px)_auto] items-end">
              <div className="space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input value={plan.name} onChange={(e) => updatePlan(index, 'name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Down (Mbps)</Label>
                <Input
                  type="number"
                  value={plan.downloadMbps}
                  onChange={(e) => updatePlan(index, 'downloadMbps', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Up (Mbps)</Label>
                <Input
                  type="number"
                  value={plan.uploadMbps}
                  onChange={(e) => updatePlan(index, 'uploadMbps', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preço (R$)</Label>
                <Input
                  type="number"
                  value={plan.priceMonthly}
                  onChange={(e) => updatePlan(index, 'priceMonthly', e.target.value)}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => removePlan(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {plans.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p>
          )}
        </div>
      </section>

      {/* ── Bairros cobertos ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border/50 p-6 space-y-3">
        <h2 className="font-medium">Bairros cobertos</h2>
        <p className="text-sm text-muted-foreground">Um bairro por linha.</p>
        <Textarea
          rows={6}
          value={neighborhoods}
          onChange={(e) => setNeighborhoods(e.target.value)}
        />
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? 'Salvando...' : 'Salvar configurações'}
        </Button>
        {save.isSuccess && <span className="text-sm text-accent">Configurações salvas.</span>}
        {save.isError && (
          <span className="text-sm text-destructive">
            {(save.error as Error)?.message ?? 'Falha ao salvar.'}
          </span>
        )}
      </div>
    </div>
  );
}
