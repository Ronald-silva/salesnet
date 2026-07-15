import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Search, Send, Trash2 } from 'lucide-react';
import { adminApi, type BillingRecipient, type BillingRecipientLookup } from '@/api/admin';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

const TEST_MESSAGE = '[TESTE INTERNO SALESNET] Esta é uma mensagem de validação do sistema de lembretes automáticos. Nenhuma ação é necessária.';

function maskCpf(cpf: string | null): string {
  if (!cpf || cpf.length < 11) return '—';
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`;
}

export default function BillingQueue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<BillingRecipientLookup | null>(null);
  const [testSendId, setTestSendId] = useState<string | null>(null);

  const recipients = useQuery({
    queryKey: ['billing-recipients'],
    queryFn: () => adminApi.listBillingRecipients('active'),
  });

  const refreshRecipients = () => queryClient.invalidateQueries({ queryKey: ['billing-recipients'] });

  const lookup = useMutation({
    mutationFn: adminApi.lookupBillingRecipient,
    onSuccess: setPreview,
    onError: (error: Error) => toast({ title: 'Cliente não encontrado', description: error.message, variant: 'destructive' }),
  });

  const create = useMutation({
    mutationFn: () => {
      if (!preview?.cpf) throw new Error('CPF não disponível para este cliente');
      return adminApi.createBillingRecipient({
        contractId: preview.contractId,
        sgpClienteId: preview.sgpClienteId,
        cpf: preview.cpf,
        customerName: preview.customerName,
        phone: preview.phone,
      });
    },
    onSuccess: () => {
      setPreview(null);
      setQuery('');
      void refreshRecipients();
      toast({ title: 'Cliente incluído na régua' });
    },
    onError: (error: Error) => toast({ title: 'Erro ao incluir', description: error.message, variant: 'destructive' }),
  });

  const pause = useMutation({ mutationFn: adminApi.pauseBillingRecipient, onSuccess: refreshRecipients });
  const reactivate = useMutation({ mutationFn: adminApi.reactivateBillingRecipient, onSuccess: refreshRecipients });
  const remove = useMutation({ mutationFn: adminApi.removeBillingRecipient, onSuccess: refreshRecipients });
  const testSend = useMutation({
    mutationFn: (id: string) => adminApi.testSendBillingRecipient(id, TEST_MESSAGE),
    onSuccess: (result) => {
      toast({
        title: result.data.status === 'sent' ? 'Mensagem de teste enviada' : 'Falha no envio de teste',
        description: result.data.status === 'sent' ? `ID do provider: ${result.data.providerMessageId}` : result.data.error,
        variant: result.data.status === 'sent' ? 'default' : 'destructive',
      });
      void refreshRecipients();
    },
    onError: (error: Error) => toast({ title: 'Falha no envio de teste', description: error.message, variant: 'destructive' }),
    onSettled: () => setTestSendId(null),
  });

  const rows = recipients.data?.data ?? [];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Régua de Cobrança"
        description="Destinatários autorizados para lembretes automáticos de fatura pelo WhatsApp."
        icon={<Send className="h-5 w-5" />}
      />

      <Card className="overflow-hidden rounded-xl border-primary/15 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Adicionar destinatário</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              aria-label="CPF, telefone ou contrato"
              placeholder="CPF, telefone ou contrato"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && query.trim()) lookup.mutate(query.trim());
              }}
            />
            <Button onClick={() => query.trim() && lookup.mutate(query.trim())} disabled={lookup.isPending}>
              <Search className="mr-2 h-4 w-4" /> {lookup.isPending ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>

          {preview ? (
            <div className="rounded-lg border border-primary/20 bg-background/80 p-4 text-sm shadow-sm">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{preview.customerName}</p>
                  <p className="text-xs text-muted-foreground">Contrato {preview.contractId} · CPF {maskCpf(preview.cpf)}</p>
                </div>
                <Badge variant={preview.phoneFormatValid ? 'default' : 'destructive'}>
                  WhatsApp {preview.phoneFormatValid ? 'válido' : 'inválido'}
                </Badge>
              </div>
              <p className="text-muted-foreground">{preview.phone}</p>
              <p className="mt-2 text-muted-foreground">
                {preview.financialStatus
                  ? `Fatura ${preview.financialStatus.hasOpenInvoice ? 'em aberto' : 'sem pendência'} · vence ${preview.financialStatus.dueDate} · R$ ${preview.financialStatus.amount.toFixed(2)}`
                  : 'Nenhuma fatura encontrada no momento'}
              </p>
              <Button className="mt-4" size="sm" onClick={() => create.mutate()} disabled={create.isPending || !preview.phoneFormatValid || !preview.cpf}>
                {create.isPending ? 'Incluindo…' : 'Incluir na régua'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {recipients.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : null}

      {recipients.isError ? (
        <Card className="rounded-xl border-destructive/30"><CardContent className="p-4 text-sm text-destructive">Não foi possível carregar os destinatários. Atualize a página para tentar novamente.</CardContent></Card>
      ) : null}

      {!recipients.isLoading && !recipients.isError && rows.length === 0 ? (
        <Card className="rounded-xl border-dashed"><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum cliente ativo na régua ainda.</CardContent></Card>
      ) : null}

      <div className="space-y-3" style={{ contentVisibility: 'auto' }}>
        {rows.map((recipient: BillingRecipient) => (
          <Card key={recipient.id} className="rounded-xl transition-colors hover:border-primary/25">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{recipient.customer_name}</p>
                  <Badge variant={recipient.paused ? 'secondary' : 'outline'}>{recipient.paused ? 'Pausado' : 'Ativo'}</Badge>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">CPF {maskCpf(recipient.cpf)} · {recipient.phone} · contrato {recipient.contract_id}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {recipient.paused ? (
                  <Button size="sm" variant="outline" onClick={() => reactivate.mutate(recipient.id)} disabled={reactivate.isPending}>
                    <Play className="mr-1 h-4 w-4" /> Reativar
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => pause.mutate(recipient.id)} disabled={pause.isPending}>
                    <Pause className="mr-1 h-4 w-4" /> Pausar
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setTestSendId(recipient.id)}>
                  <Send className="mr-1 h-4 w-4" /> Testar
                </Button>
                <Button size="icon" variant="destructive" aria-label={`Remover ${recipient.customer_name}`} onClick={() => remove.mutate(recipient.id)} disabled={remove.isPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={testSendId !== null} onOpenChange={(open) => { if (!open) setTestSendId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar mensagem de teste?</AlertDialogTitle>
            <AlertDialogDescription>Isso envia uma mensagem real ao número cadastrado: “{TEST_MESSAGE}”</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={testSend.isPending} onClick={() => { if (testSendId) testSend.mutate(testSendId); }}>
              {testSend.isPending ? 'Enviando…' : 'Enviar teste'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
