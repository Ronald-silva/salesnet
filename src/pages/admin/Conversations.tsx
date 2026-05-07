import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Filter = 'all' | 'bot' | 'human' | 'churn';

export default function Conversations() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');

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
          {(conversations.data ?? []).map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedId(item.id)}
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
        ) : (
          <>
            <div className="mb-3">
              <p className="font-medium">{detail.data?.customer?.name ?? detail.data?.phone}</p>
              <p className="text-sm text-muted-foreground">
                Plano: {detail.data?.customer?.plan?.name ?? 'N/A'} | Status: {detail.data?.customer?.status ?? 'N/A'}
              </p>
            </div>
            <div className="flex gap-2 mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectedId && humanModeMutation.mutate({ id: selectedId, active: true })}
              >
                Assumir conversa
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectedId && humanModeMutation.mutate({ id: selectedId, active: false })}
              >
                Devolver ao bot
              </Button>
            </div>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto border rounded-md p-3 border-border/50 bg-muted/10">
              {(detail.data?.messages ?? []).map((msg, idx) => (
                <div key={`${idx}-${msg.role}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg p-2 text-sm ${msg.role === 'user' ? 'bg-accent text-accent-foreground' : 'bg-card border border-border/50'}`}>
                    {msg.content}
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
              <Button
                onClick={() => selectedId && replyMutation.mutate({ id: selectedId, message: reply })}
                disabled={!reply.trim()}
              >
                Enviar resposta
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
