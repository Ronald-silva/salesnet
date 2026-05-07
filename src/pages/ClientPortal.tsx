import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wifi, WifiOff, Copy, Share2, TicketCheck, LogOut, Loader2 } from 'lucide-react';
import { clientApi } from '@/api/client';
import { getSession, clearSession } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    open: 'bg-yellow-500/20 text-yellow-400',
    in_progress: 'bg-blue-500/20 text-blue-400',
    resolved: 'bg-accent/20 text-accent',
    closed: 'bg-muted text-muted-foreground',
    paid: 'bg-accent/20 text-accent',
    overdue: 'bg-destructive/20 text-destructive',
    cancelled: 'bg-muted text-muted-foreground',
  };
  const labels: Record<string, string> = {
    open: 'Aberto', in_progress: 'Em andamento', resolved: 'Resolvido',
    closed: 'Fechado', paid: 'Pago', overdue: 'Vencido', cancelled: 'Cancelado',
  };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${variants[status] ?? 'bg-muted text-muted-foreground'}`}>
      {labels[status] ?? status}
    </span>
  );
}

export default function ClientPortal() {
  const navigate = useNavigate();
  const session = getSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) navigate('/minha-conta/login');
  }, [session, navigate]);

  const invoice = useQuery({ queryKey: ['invoice'], queryFn: clientApi.getInvoice, enabled: !!session });
  const connection = useQuery({ queryKey: ['connection'], queryFn: clientApi.getConnection, enabled: !!session });
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: clientApi.getTickets, enabled: !!session });
  const referral = useQuery({ queryKey: ['referral'], queryFn: clientApi.getReferral, enabled: !!session });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: clientApi.getInvoices, enabled: !!session });

  const [ticketType, setTicketType] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');

  const openTicketMutation = useMutation({
    mutationFn: () => clientApi.openTicket(ticketType, ticketDesc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setTicketType('');
      setTicketDesc('');
      toast({ title: 'Chamado aberto com sucesso!' });
    },
    onError: () => toast({ title: 'Erro ao abrir chamado', variant: 'destructive' }),
  });

  function handleLogout() {
    clearSession();
    navigate('/minha-conta/login');
  }

  function copyPix() {
    if (invoice.data?.pixKey) {
      navigator.clipboard.writeText(invoice.data.pixKey);
      toast({ title: 'Chave PIX copiada!' });
    }
  }

  function shareReferral() {
    const link = referral.data?.link;
    if (!link) return;
    const text = `Assine a SalesNet Telecom! Use meu link: https://${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Olá,</p>
          <p className="font-semibold text-foreground">{session.name}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-1" /> Sair
        </Button>
      </header>

      <div className="container max-w-2xl mx-auto px-4 py-6">
        <Tabs defaultValue="inicio">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="inicio">Início</TabsTrigger>
            <TabsTrigger value="chamados">Chamados</TabsTrigger>
            <TabsTrigger value="indicacoes">Indicações</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="inicio" className="space-y-4">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Fatura Atual</CardTitle></CardHeader>
              <CardContent>
                {invoice.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
                  invoice.data ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-foreground">R$ {invoice.data.amount.toFixed(2)}</span>
                        <StatusBadge status={invoice.data.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">Vencimento: {new Date(invoice.data.dueDate).toLocaleDateString('pt-BR')}</p>
                      {invoice.data.pixKey && (
                        <Button onClick={copyPix} variant="outline" className="w-full border-accent/30 text-accent hover:bg-accent/10">
                          <Copy className="h-4 w-4 mr-2" /> Copiar chave PIX
                        </Button>
                      )}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Sem fatura em aberto.</p>}
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Status da Conexão</CardTitle></CardHeader>
              <CardContent>
                {connection.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
                  connection.data ? (
                    <div className="flex items-center gap-3">
                      {connection.data.online ? <Wifi className="h-6 w-6 text-accent" /> : <WifiOff className="h-6 w-6 text-destructive" />}
                      <div>
                        <p className="font-medium text-foreground">{connection.data.online ? 'Online' : 'Offline'}</p>
                        {connection.data.currentDownloadMbps && (
                          <p className="text-sm text-muted-foreground">{connection.data.currentDownloadMbps} Mbps download</p>
                        )}
                      </div>
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Não foi possível obter status.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chamados" className="space-y-4">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Abrir Chamado</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={ticketType} onValueChange={setTicketType}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Problema técnico</SelectItem>
                      <SelectItem value="billing">Financeiro</SelectItem>
                      <SelectItem value="upgrade">Upgrade de plano</SelectItem>
                      <SelectItem value="cancellation">Cancelamento</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Descrição</Label>
                  <Textarea placeholder="Descreva o problema..." value={ticketDesc} onChange={e => setTicketDesc(e.target.value)} rows={3} />
                </div>
                <Button
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={!ticketType || !ticketDesc || openTicketMutation.isPending}
                  onClick={() => openTicketMutation.mutate()}
                >
                  {openTicketMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TicketCheck className="h-4 w-4 mr-2" />}
                  Abrir chamado
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Meus Chamados</CardTitle></CardHeader>
              <CardContent>
                {tickets.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
                  tickets.data && tickets.data.length > 0 ? (
                    <div className="space-y-3">
                      {tickets.data.map(t => (
                        <div key={t.id} className="flex items-start justify-between py-2 border-b border-border/30 last:border-0">
                          <div>
                            <p className="text-sm font-medium text-foreground capitalize">{t.type}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                          </div>
                          <StatusBadge status={t.status} />
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Nenhum chamado encontrado.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="indicacoes">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Programa de Indicações</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {referral.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
                  referral.data?.link ? (
                    <>
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-xs text-muted-foreground mb-1">Seu link de indicação</p>
                        <p className="text-sm font-mono text-accent break-all">{referral.data.link}</p>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 bg-muted/30 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-accent">{referral.data.conversions}</p>
                          <p className="text-xs text-muted-foreground">Indicações convertidas</p>
                        </div>
                        <div className="flex-1 bg-muted/30 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-accent">{referral.data.conversions}</p>
                          <p className="text-xs text-muted-foreground">Créditos ganhos (meses)</p>
                        </div>
                      </div>
                      <Button onClick={shareReferral} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                        <Share2 className="h-4 w-4 mr-2" /> Compartilhar no WhatsApp
                      </Button>
                    </>
                  ) : <p className="text-sm text-muted-foreground">Seu link será gerado após 30 dias de cadastro.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historico">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Histórico de Faturas</CardTitle></CardHeader>
              <CardContent>
                {invoices.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> :
                  invoices.data && invoices.data.length > 0 ? (
                    <div className="space-y-2">
                      {invoices.data.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {new Date(inv.dueDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                            </p>
                            <p className="text-xs text-muted-foreground">R$ {inv.amount.toFixed(2)}</p>
                          </div>
                          <StatusBadge status={inv.status} />
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Nenhuma fatura encontrada.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
