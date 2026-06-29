import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Wifi, WifiOff, Copy, Share2, TicketCheck, LogOut, Loader2,
  Calendar, Zap, AlertCircle, CheckCircle2, Clock, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { clientApi } from '@/api/client';
import type { ClientProfile, ScheduledVisit, Ticket } from '@/api/client';
import { getSession, clearSession } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TICKET_TYPE_LABELS: Record<string, string> = {
  // valores do portal
  technical: 'Problema técnico',
  billing: 'Financeiro',
  upgrade: 'Upgrade de plano',
  cancellation: 'Cancelamento',
  other: 'Outro',
  // valores da Sofia (PT)
  tecnico: 'Problema técnico',
  financeiro: 'Financeiro',
  comercial: 'Comercial',
};

const PERIOD_LABELS: Record<string, string> = {
  morning: 'Manhã (8h–12h)',
  afternoon: 'Tarde (14h–18h)',
};

const STATUS_CONTRACT: Record<string, { label: string; cls: string }> = {
  active:    { label: 'Ativo',      cls: 'bg-green-500/15 text-green-400' },
  suspended: { label: 'Suspenso',   cls: 'bg-red-500/15 text-red-400' },
  cancelled: { label: 'Cancelado',  cls: 'bg-muted text-muted-foreground' },
};

const STATUS_TICKET: Record<string, { label: string; icon: React.ReactNode }> = {
  open:        { label: 'Aberto',       icon: <AlertCircle className="h-3.5 w-3.5 text-yellow-400" /> },
  in_progress: { label: 'Em andamento', icon: <Clock className="h-3.5 w-3.5 text-blue-400" /> },
  resolved:    { label: 'Resolvido',    icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> },
  closed:      { label: 'Fechado',      icon: <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" /> },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-full rounded-lg" />
      </CardContent>
    </Card>
  );
}

// ─── Card: Meu Plano ──────────────────────────────────────────────────────────

function PlanCard({ profile }: { profile: ClientProfile }) {
  const contract = STATUS_CONTRACT[profile.status] ?? { label: profile.status, cls: 'bg-muted text-muted-foreground' };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Meu Plano</CardTitle>
          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', contract.cls)}>
            {contract.label}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {profile.plan ? (
          <div className="space-y-3">
            <div>
              <p className="text-xl font-bold text-foreground">{profile.plan.name}</p>
              {profile.plan.downloadMbps ? (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {profile.plan.downloadMbps} Mbps
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-accent" />
              <span>Fibra óptica</span>
            </div>
            {profile.status === 'suspended' && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
                Conexão suspensa por inadimplência. Regularize sua fatura para reativar.
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Plano não identificado.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Card: Próxima Visita ─────────────────────────────────────────────────────

function VisitCard({ visit }: { visit: ScheduledVisit }) {
  return (
    <Card className="border-border/50 border-accent/30 bg-accent/5">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-accent" />
          <CardTitle className="text-base">Visita Agendada</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-lg font-semibold text-foreground">
          {formatDate(visit.date)}
        </p>
        <p className="text-sm text-muted-foreground">
          {PERIOD_LABELS[visit.period] ?? visit.period}
        </p>
        {visit.type && (
          <p className="text-xs text-muted-foreground capitalize">{visit.type}</p>
        )}
        {visit.notes && (
          <p className="text-xs text-muted-foreground italic">{visit.notes}</p>
        )}
        <p className="text-xs text-accent/70 pt-1">
          Nossa equipe confirma o horário exato antes de chegar.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Ticket Item ──────────────────────────────────────────────────────────────

function TicketItem({ ticket }: { ticket: Ticket }) {
  const statusInfo = STATUS_TICKET[ticket.status] ?? { label: ticket.status, icon: null };
  const typeLabel = TICKET_TYPE_LABELS[ticket.type] ?? ticket.type;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-foreground">{typeLabel}</p>
          {ticket.protocol && (
            <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1.5 py-0.5 rounded">
              #{ticket.protocol}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{ticket.description}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">{formatDate(ticket.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0 mt-0.5">
        {statusInfo.icon}
        <span className="text-xs text-muted-foreground">{statusInfo.label}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientPortal() {
  const navigate = useNavigate();
  const session = getSession();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!session) navigate('/minha-conta/login');
  }, [session, navigate]);

  const invoice    = useQuery({ queryKey: ['invoice'],    queryFn: clientApi.getInvoice,    enabled: !!session });
  const connection = useQuery({ queryKey: ['connection'], queryFn: clientApi.getConnection, enabled: !!session });
  const tickets    = useQuery({ queryKey: ['tickets'],    queryFn: clientApi.getTickets,    enabled: !!session });
  const referral   = useQuery({ queryKey: ['referral'],   queryFn: clientApi.getReferral,   enabled: !!session });
  const invoices   = useQuery({ queryKey: ['invoices'],   queryFn: clientApi.getInvoices,   enabled: !!session });
  const profile    = useQuery({ queryKey: ['profile'],    queryFn: clientApi.getProfile,    enabled: !!session });
  const schedule   = useQuery({ queryKey: ['schedule'],   queryFn: clientApi.getSchedule,   enabled: !!session });

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
      navigator.clipboard.writeText(invoice.data.pixKey).catch(() => null);
      toast({ title: 'Código PIX copiado!' });
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
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Voltar ao site">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-xs text-muted-foreground">Olá,</p>
            <p className="font-semibold text-foreground leading-tight">{session.name}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
          <LogOut className="h-4 w-4 mr-1" /> Sair
        </Button>
      </header>

      <div className="container max-w-lg mx-auto px-4 py-5">
        <Tabs defaultValue="inicio">
          <TabsList className="grid w-full grid-cols-4 mb-5">
            <TabsTrigger value="inicio">Início</TabsTrigger>
            <TabsTrigger value="chamados">Chamados</TabsTrigger>
            <TabsTrigger value="indicacoes">Indicações</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          {/* ── INÍCIO ── */}
          <TabsContent value="inicio" className="space-y-4">

            {/* Meu Plano */}
            {profile.isLoading ? <CardSkeleton /> : profile.data ? (
              <PlanCard profile={profile.data} />
            ) : null}

            {/* Visita agendada */}
            {schedule.isLoading ? (
              <Card className="border-border/50"><CardContent className="py-4"><Skeleton className="h-4 w-40" /></CardContent></Card>
            ) : schedule.data ? (
              <VisitCard visit={schedule.data} />
            ) : null}

            {/* Fatura atual */}
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Fatura Atual</CardTitle></CardHeader>
              <CardContent>
                {invoice.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </div>
                ) : invoice.data ? (
                  <div className="space-y-3">
                    <div className="flex items-end justify-between">
                      <span className="text-2xl font-bold text-foreground">
                        R$ {invoice.data.amount.toFixed(2)}
                      </span>
                      <span className={cn(
                        'text-[11px] font-medium px-2 py-0.5 rounded-full',
                        invoice.data.status === 'paid'    && 'bg-green-500/15 text-green-400',
                        invoice.data.status === 'overdue' && 'bg-red-500/15 text-red-400',
                        invoice.data.status === 'open'    && 'bg-yellow-500/15 text-yellow-400',
                      )}>
                        {invoice.data.status === 'paid' ? 'Paga' : invoice.data.status === 'overdue' ? 'Vencida' : 'Em aberto'}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Vencimento: {formatDate(invoice.data.dueDate)}
                    </p>
                    {invoice.data.pixKey && invoice.data.status !== 'paid' && (
                      <Button
                        onClick={copyPix}
                        variant="outline"
                        className="w-full border-accent/30 text-accent hover:bg-accent/10"
                      >
                        <Copy className="h-4 w-4 mr-2" /> Copiar código PIX
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem fatura em aberto.</p>
                )}
              </CardContent>
            </Card>

            {/* Status da conexão */}
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Status da Conexão</CardTitle></CardHeader>
              <CardContent>
                {connection.isLoading ? (
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ) : connection.data ? (
                  <div className="flex items-center gap-3">
                    {connection.data.online
                      ? <Wifi className="h-6 w-6 text-accent" />
                      : <WifiOff className="h-6 w-6 text-destructive" />}
                    <div>
                      <p className="font-medium text-foreground">
                        {connection.data.online ? 'Online' : 'Offline'}
                      </p>
                      {connection.data.currentDownloadMbps && (
                        <p className="text-sm text-muted-foreground">
                          {connection.data.currentDownloadMbps} Mbps download
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Não foi possível obter o status.</p>
                )}
              </CardContent>
            </Card>

            {/* CTA WhatsApp */}
            <button
              type="button"
              onClick={() => window.open('https://wa.me/5585996032957', '_blank')}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border/50 bg-card hover:bg-muted/40 transition-colors"
            >
              <span className="text-sm text-foreground">Precisa de ajuda? Fale com a Sofia</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </TabsContent>

          {/* ── CHAMADOS ── */}
          <TabsContent value="chamados" className="space-y-4">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Abrir Chamado</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Tipo</Label>
                  <Select value={ticketType} onValueChange={setTicketType}>
                    <SelectTrigger><SelectValue placeholder="Selecione o tipo..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Problema técnico</SelectItem>
                      <SelectItem value="billing">Financeiro</SelectItem>
                      <SelectItem value="upgrade">Upgrade de plano</SelectItem>
                      <SelectItem value="cancellation">Cancelamento</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Descrição</Label>
                  <Textarea
                    placeholder="Descreva o que está acontecendo..."
                    value={ticketDesc}
                    onChange={e => setTicketDesc(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>
                <Button
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={!ticketType || !ticketDesc || openTicketMutation.isPending}
                  onClick={() => openTicketMutation.mutate()}
                >
                  {openTicketMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    : <TicketCheck className="h-4 w-4 mr-2" />}
                  Abrir chamado
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Meus Chamados</CardTitle></CardHeader>
              <CardContent>
                {tickets.isLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
                  </div>
                ) : tickets.data && tickets.data.length > 0 ? (
                  <div>
                    {tickets.data.map(t => <TicketItem key={t.id} ticket={t} />)}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum chamado encontrado.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── INDICAÇÕES ── */}
          <TabsContent value="indicacoes">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Programa de Indicações</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {referral.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </div>
                ) : referral.data?.link ? (
                  <>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-xs text-muted-foreground mb-1">Seu link de indicação</p>
                      <p className="text-sm font-mono text-accent break-all">{referral.data.link}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-accent">{referral.data.conversions}</p>
                        <p className="text-xs text-muted-foreground">Indicações</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <p className="text-2xl font-bold text-accent">{referral.data.conversions}</p>
                        <p className="text-xs text-muted-foreground">Créditos (meses)</p>
                      </div>
                    </div>
                    <Button
                      onClick={shareReferral}
                      className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                    >
                      <Share2 className="h-4 w-4 mr-2" /> Compartilhar no WhatsApp
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Seu link de indicação será liberado após 30 dias de cadastro.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HISTÓRICO ── */}
          <TabsContent value="historico">
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base">Histórico de Faturas</CardTitle></CardHeader>
              <CardContent>
                {invoices.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                  </div>
                ) : invoices.data && invoices.data.length > 0 ? (
                  <div>
                    {invoices.data.map(inv => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0"
                      >
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(inv.dueDate).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                          </p>
                          <p className="text-xs text-muted-foreground">R$ {inv.amount.toFixed(2)}</p>
                        </div>
                        <span className={cn(
                          'text-[11px] font-medium px-2 py-0.5 rounded-full',
                          inv.status === 'paid'      && 'bg-green-500/15 text-green-400',
                          inv.status === 'overdue'   && 'bg-red-500/15 text-red-400',
                          inv.status === 'open'      && 'bg-yellow-500/15 text-yellow-400',
                          inv.status === 'cancelled' && 'bg-muted text-muted-foreground',
                        )}>
                          {inv.status === 'paid' ? 'Paga' : inv.status === 'overdue' ? 'Vencida' : inv.status === 'open' ? 'Em aberto' : 'Cancelada'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhuma fatura encontrada.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
