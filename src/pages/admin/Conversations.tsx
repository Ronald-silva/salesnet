import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type Filter = 'all' | 'bot' | 'human' | 'churn';

const SESSION_MODE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  billing: 'Cobrança',
  support: 'Suporte',
  commercial: 'Comercial',
  default: 'Geral',
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Conversations() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);

  const conversations = useQuery({
    queryKey: ['admin-conversations', filter, search],
    queryFn: () => adminApi.getConversations(filter, search),
    refetchInterval: 5000,
  });

  const detail = useQuery({
    queryKey: ['admin-conversation', selectedId],
    queryFn: () => adminApi.getConversation(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 5000,
  });

  const invoice = useQuery({
    queryKey: ['admin-conversation-invoice', selectedId],
    queryFn: () => adminApi.getConversationInvoice(selectedId!),
    enabled: !!selectedId && showInvoice,
  });

  const humanModeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => adminApi.setHumanMode(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-conversation', selectedId] });
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) => adminApi.reply(id, message),
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['admin-conversation', selectedId] });
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] });
    },
  });

  const list = conversations.data ?? [];

  function selectConversation(id: string) {
    setSelectedId(id);
    setShowInvoice(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="border border-border/50 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Conversas ativas</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {(['all', 'bot', 'human', 'churn'] as Filter[]).map((value) => (
            <Button
              key={value}
              variant={filter === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'Todas' : value === 'bot' ? 'Bot ativo' : value === 'human' ? 'Aguardando humano' : 'Churn risk'}
            </Button>
          ))}
        </div>
        <Input
          placeholder="Buscar por nome ou número"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {conversations.isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`conv-skeleton-${i}`} className="h-20 w-full rounded-md" />
            ))}

          {conversations.isError && (
            <Alert variant="destructive">
              <AlertTitle>Erro ao carregar conversas</AlertTitle>
              <AlertDescription>
                {(conversations.error as Error)?.message ?? 'Tente novamente em instantes.'}
              </AlertDescription>
            </Alert>
          )}

          {!conversations.isLoading && !conversations.isError && list.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma conversa encontrada para este filtro.
            </p>
          )}

          {list.map((item) => (
            <button
              key={item.id}
              onClick={() => selectConversation(item.id)}
              className={`w-full text-left border rounded-md p-3 hover:bg-muted/30 ${selectedId === item.id ? 'border-accent' : 'border-border/50'}`}
            >
              <div className="flex items-center justify-between">
                <p className="font-medium">{item.name}</p>
                <span className="text-xs text-muted-foreground">{new Date(item.updatedAt).toLocaleString('pt-BR')}</span>
              </div>
              <p className="text-xs text-muted-foreground">{item.phone}</p>
              <p className="text-sm mt-1 line-clamp-2">{item.lastText || 'Sem mensagens recentes'}</p>
              <div className="mt-2 flex gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${item.mode === 'bot' ? 'bg-accent/20 text-accent' : 'bg-yellow-500/20 text-yellow-400'}`}>
                  {item.mode === 'bot' ? 'Bot' : 'Humano'}
                </span>
                {item.churnRisk && <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">Churn risk</span>}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="border border-border/50 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Conversa selecionada</h2>
        {!selectedId ? (
          <p className="text-muted-foreground">Selecione uma conversa na lista.</p>
        ) : detail.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : detail.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Erro ao carregar conversa</AlertTitle>
            <AlertDescription>
              {(detail.error as Error)?.message ?? 'Tente novamente em instantes.'}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{detail.data?.customer?.name ?? detail.data?.phone}</p>
                {detail.data?.session_mode && (
                  <Badge variant="outline" className="bg-accent/15 text-accent border-accent/30">
                    {SESSION_MODE_LABELS[detail.data.session_mode] ?? detail.data.session_mode}
                  </Badge>
                )}
                {detail.data?.human_mode && (
                  <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                    Modo humano
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Plano: {detail.data?.customer?.plan?.name ?? 'N/A'} | Status: {detail.data?.customer?.status ?? 'N/A'}
              </p>
            </div>

            {detail.data?.notes && (
              <Alert className="mb-3">
                <AlertTitle>Nota do atendimento anterior</AlertTitle>
                <AlertDescription>{detail.data.notes}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2 mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectedId && humanModeMutation.mutate({ id: selectedId, active: true })}
                disabled={humanModeMutation.isPending}
              >
                Assumir conversa
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectedId && humanModeMutation.mutate({ id: selectedId, active: false })}
                disabled={humanModeMutation.isPending}
              >
                Devolver ao bot
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowInvoice((v) => !v)}>
                {showInvoice ? 'Ocultar fatura' : 'Ver fatura atual'}
              </Button>
            </div>

            {showInvoice && (
              <div className="mb-3 rounded-md border border-border/50 p-3 text-sm">
                {invoice.isLoading && <Skeleton className="h-12 w-full" />}
                {invoice.isError && (
                  <p className="text-muted-foreground">Não foi possível carregar a fatura.</p>
                )}
                {!invoice.isLoading && !invoice.isError && !invoice.data && (
                  <p className="text-muted-foreground">Nenhuma fatura em aberto para este cliente.</p>
                )}
                {invoice.data && (
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Valor</span>
                      <span className="font-medium">{formatCurrency(invoice.data.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vencimento</span>
                      <span>{invoice.data.dueDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span>{invoice.data.status}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 max-h-[40vh] overflow-y-auto border rounded-md p-3 border-border/50 bg-muted/10">
              {(detail.data?.messages ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sem mensagens nesta conversa.</p>
              )}
              {(detail.data?.messages ?? []).map((msg, idx) => (
                <div key={`${idx}-${msg.role}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg p-2 text-sm ${msg.role === 'user' ? 'bg-accent text-accent-foreground' : 'bg-card border border-border/50'}`}>
                    <p>{msg.content}</p>
                    <div className="mt-1 flex items-center gap-2 text-[10px] opacity-70">
                      {msg.source === 'human' && <span className="uppercase">atendente</span>}
                      {msg.timestamp && <span>{new Date(msg.timestamp).toLocaleString('pt-BR')}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 space-y-2">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Responder como atendente humano..."
                rows={3}
              />
              {replyMutation.isError && (
                <p className="text-sm text-destructive">
                  {(replyMutation.error as Error)?.message ?? 'Falha ao enviar.'}
                </p>
              )}
              <Button
                onClick={() => selectedId && replyMutation.mutate({ id: selectedId, message: reply })}
                disabled={!reply.trim() || replyMutation.isPending}
              >
                {replyMutation.isPending ? 'Enviando...' : 'Enviar resposta'}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
