import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, RefreshCw, Search, Bot, User, Send, ChevronLeft,
  ChevronDown, Copy, ExternalLink, QrCode, FileText, Zap, Info,
  CreditCard,
} from 'lucide-react';
import QRCodeSVG from 'react-qr-code';
import { adminApi } from '@/api/admin';
import type { ConversationSummary, ConversationDetail, InvoiceInfo } from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

type TabFilter = 'human' | 'bot' | 'all';

const SESSION_MODE_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  billing: 'Cobrança',
  support: 'Suporte',
  commercial: 'Comercial',
  default: 'Geral',
};

const SESSION_MODE_COLORS: Record<string, string> = {
  billing: 'bg-amber-500',
  support: 'bg-red-500',
  prospect: 'bg-green-500',
  commercial: 'bg-blue-500',
  default: 'bg-muted-foreground',
};

const PERIOD_LABELS: Record<string, string> = {
  morning: 'Manhã (8h–12h)',
  afternoon: 'Tarde (14h–18h)',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  if (h < 48) return 'ontem';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function isPixCode(text: string): boolean {
  return text.trim().startsWith('00020126');
}

function extractPixFromMessage(content: string): string | null {
  const match = content.match(/\b(00020126\S+)/);
  return match?.[1] ?? null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function ConvAvatar({
  name, sessionMode, churnRisk, isBot,
}: { name: string; sessionMode: string | null; churnRisk: boolean; isBot: boolean }) {
  const colorClass = sessionMode ? (SESSION_MODE_COLORS[sessionMode] ?? 'bg-muted-foreground') : 'bg-muted-foreground';
  return (
    <div className="relative shrink-0">
      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold', colorClass)}>
        {isBot && !sessionMode ? <Bot className="h-4 w-4" /> : getInitials(name)}
      </div>
      {churnRisk && (
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-destructive border-2 border-background" />
      )}
    </div>
  );
}

// ─── Conversation List Item ───────────────────────────────────────────────────

function ConvItem({
  item, selected, onClick,
}: { item: ConversationSummary; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left flex gap-3 items-start px-3 py-3 rounded-lg transition-colors hover:bg-muted/40',
        selected && 'bg-accent/10 border border-accent/30',
      )}
    >
      <ConvAvatar
        name={item.name}
        sessionMode={item.sessionMode}
        churnRisk={item.churnRisk}
        isBot={item.mode === 'bot'}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-sm truncate">{item.name !== item.phone ? item.name : formatPhone(item.phone)}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(item.updatedAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">{item.lastText || 'Sem mensagens'}</p>
        <div className="flex items-center gap-1.5 mt-1">
          {item.mode === 'human' ? (
            <Badge className="h-4 text-[10px] px-1.5 bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/15">
              Humano
            </Badge>
          ) : (
            <Badge className="h-4 text-[10px] px-1.5 bg-green-500/15 text-green-600 border-green-500/30 hover:bg-green-500/15">
              Bot
            </Badge>
          )}
          {item.sessionMode && (
            <Badge variant="outline" className="h-4 text-[10px] px-1.5">
              {SESSION_MODE_LABELS[item.sessionMode] ?? item.sessionMode}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function PixCard({ pixCode, onCopy }: { pixCode: string; onCopy: () => void }) {
  return (
    <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 max-w-xs">
      <div className="flex items-center gap-2 mb-1">
        <Zap className="h-4 w-4 text-green-600" />
        <span className="text-sm font-medium text-green-700">PIX</span>
      </div>
      <p className="text-xs text-muted-foreground font-mono break-all line-clamp-2 mb-2">{pixCode}</p>
      <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={onCopy}>
        <Copy className="h-3 w-3 mr-1" /> Copiar código PIX
      </Button>
    </div>
  );
}

function MessageBubble({
  msg, onCopyPix,
}: {
  msg: ConversationDetail['messages'][number];
  onCopyPix: (code: string) => void;
}) {
  const isUser = msg.role === 'user';
  const isHuman = msg.source === 'human';
  const pixCode = !isUser ? extractPixFromMessage(msg.content) : null;

  return (
    <div className={cn('flex', isUser ? 'justify-start' : 'justify-end')}>
      <div className={cn('max-w-[75%] flex flex-col', isUser ? 'items-start' : 'items-end')}>
        {isHuman && (
          <span className="text-[10px] text-amber-600 font-semibold mb-0.5 px-1">ATENDENTE</span>
        )}
        {pixCode ? (
          <PixCard pixCode={pixCode} onCopy={() => onCopyPix(pixCode)} />
        ) : (
          <div className={cn(
            'rounded-2xl px-3 py-2 text-sm',
            isUser
              ? 'bg-muted text-foreground rounded-tl-sm'
              : isHuman
                ? 'bg-amber-500/15 text-foreground rounded-tr-sm border border-amber-500/20'
                : 'bg-blue-500/15 text-foreground rounded-tr-sm border border-blue-500/20',
          )}>
            {msg.content}
          </div>
        )}
        {msg.timestamp && (
          <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
            {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Invoice Panel ────────────────────────────────────────────────────────────

function InvoiceSection({
  conversationId, invoice, isLoading,
}: { conversationId: string; invoice: InvoiceInfo | null | undefined; isLoading: boolean }) {
  const { toast } = useToast();
  const [qrOpen, setQrOpen] = useState(false);
  const [generatedPix, setGeneratedPix] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const generatePixMutation = useMutation({
    mutationFn: () => adminApi.generatePix(conversationId),
    onSuccess: (data) => {
      setGeneratedPix(data.pixCode);
      navigator.clipboard.writeText(data.pixCode).catch(() => null);
      toast({ title: 'PIX gerado e copiado!', description: 'Código PIX copiado para a área de transferência.' });
      queryClient.invalidateQueries({ queryKey: ['admin-conversation-invoice', conversationId] });
    },
    onError: (err) => {
      toast({ title: 'Erro ao gerar PIX', description: (err as Error).message, variant: 'destructive' });
    },
  });

  const activePix = invoice?.pixCode ?? generatedPix;

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).catch(() => null);
    toast({ title: `${label} copiado!` });
  }

  const statusColors: Record<string, string> = {
    open: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
    overdue: 'bg-red-500/15 text-red-600 border-red-500/30',
    paid: 'bg-green-500/15 text-green-600 border-green-500/30',
    cancelled: 'bg-muted text-muted-foreground',
  };

  const statusLabels: Record<string, string> = {
    open: 'Em aberto',
    overdue: 'Vencida',
    paid: 'Paga',
    cancelled: 'Cancelada',
  };

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Financeiro</h4>
      {!invoice ? (
        <p className="text-xs text-muted-foreground">Nenhuma fatura em aberto.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-1">Última fatura em aberto</p>
          <div className="grid grid-cols-3 gap-1 text-xs mb-2">
            <div>
              <p className="text-muted-foreground">Vencimento</p>
              <p className="font-medium">{formatDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Valor</p>
              <p className="font-medium">{formatCurrency(invoice.amount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <Badge className={cn('h-5 text-[10px] px-1.5', statusColors[invoice.status])}>
                {statusLabels[invoice.status] ?? invoice.status}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <TooltipProvider>
              {/* Cod PIX */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] flex-col gap-0.5 px-1"
                    disabled={!invoice.canGeneratePix && !activePix}
                    onClick={() => {
                      if (activePix) {
                        copyToClipboard(activePix, 'Código PIX');
                      } else {
                        generatePixMutation.mutate();
                      }
                    }}
                  >
                    <Zap className="h-3 w-3" />
                    Cod PIX
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{activePix ? 'Copiar código PIX' : 'Gerar código PIX'}</TooltipContent>
              </Tooltip>

              {/* Cod Boleto */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] flex-col gap-0.5 px-1"
                    disabled={!invoice.barcode}
                    onClick={() => invoice.barcode && copyToClipboard(invoice.barcode, 'Código do boleto')}
                  >
                    <CreditCard className="h-3 w-3" />
                    Boleto
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copiar código do boleto</TooltipContent>
              </Tooltip>

              {/* Link Fatura */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] flex-col gap-0.5 px-1"
                    disabled={!invoice.link}
                    onClick={() => invoice.link && window.open(invoice.link, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Fatura
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Abrir link da fatura</TooltipContent>
              </Tooltip>

              {/* QR PIX */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] flex-col gap-0.5 px-1"
                    disabled={!activePix}
                    onClick={() => setQrOpen(true)}
                  >
                    <QrCode className="h-3 w-3" />
                    QR PIX
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver QR Code PIX</TooltipContent>
              </Tooltip>

              {/* PDF */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] flex-col gap-0.5 px-1"
                    disabled={!invoice.link}
                    onClick={() => invoice.link && window.open(invoice.link + '?format=pdf', '_blank')}
                  >
                    <FileText className="h-3 w-3" />
                    PDF
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Abrir PDF da fatura</TooltipContent>
              </Tooltip>

              {/* Copiar PIX */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-[11px] flex-col gap-0.5 px-1"
                    disabled={!activePix}
                    onClick={() => activePix && copyToClipboard(activePix, 'Código PIX')}
                  >
                    <Copy className="h-3 w-3" />
                    Copiar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copiar código PIX</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </>
      )}

      {/* QR Code Dialog */}
      {activePix && (
        <Dialog open={qrOpen} onOpenChange={setQrOpen}>
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>QR Code PIX</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG value={activePix} size={200} />
              </div>
              <Button variant="outline" className="w-full" onClick={() => copyToClipboard(activePix, 'Código PIX')}>
                <Copy className="h-4 w-4 mr-2" /> Copiar código PIX
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Customer Panel (Coluna 3) ────────────────────────────────────────────────

function CustomerPanel({ conversationId, detail }: { conversationId: string; detail: ConversationDetail }) {
  const [sofiaOpen, setSofiaOpen] = useState(false);

  const invoice = useQuery({
    queryKey: ['admin-conversation-invoice', conversationId],
    queryFn: () => adminApi.getConversationInvoice(conversationId),
  });

  const context = useQuery({
    queryKey: ['admin-conversation-context', conversationId],
    queryFn: () => adminApi.getConversationContext(conversationId),
    enabled: sofiaOpen,
  });

  const customer = detail.customer;
  const contractId = customer ? (customer as unknown as Record<string, unknown>).id as string | undefined : undefined;
  const document = customer ? (customer as unknown as Record<string, unknown>).document as string | undefined : undefined;
  const status = customer?.status;

  const statusBadge = (s: string | undefined) => {
    if (!s) return null;
    const map: Record<string, { label: string; cls: string }> = {
      active: { label: 'Ativo', cls: 'bg-green-500/15 text-green-600 border-green-500/30' },
      suspended: { label: 'Suspenso', cls: 'bg-red-500/15 text-red-600 border-red-500/30' },
      cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground' },
    };
    const info = map[s] ?? { label: s, cls: '' };
    return <Badge className={cn('h-5 text-[10px] px-1.5', info.cls)}>{info.label}</Badge>;
  };

  const sgpUrl = contractId
    ? `https://salesnet.sgp.tsmx.com.br/central/contrato/${contractId}`
    : null;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-5">
        {/* Cliente */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cliente identificado</h4>
            <Badge className="h-5 text-[10px] px-1.5 bg-blue-500/15 text-blue-600 border-blue-500/30">SGP</Badge>
          </div>

          {!customer ? (
            <p className="text-xs text-muted-foreground">Cliente não identificado no SGP.</p>
          ) : (
            <div className="space-y-1.5 text-sm">
              {contractId && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">Contrato</span>
                  <span className="text-xs font-mono font-medium">{contractId}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Titular</span>
                <span className="text-xs font-medium truncate max-w-[160px]">{customer.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Plano</span>
                <span className="text-xs">{customer.plan?.name ?? 'N/A'}</span>
              </div>
              {document && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">Documento</span>
                  <span className="text-xs font-mono">{document}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Contrato</span>
                {statusBadge(status)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Conexão</span>
                {status === 'active' ? (
                  <Badge className="h-5 text-[10px] px-1.5 bg-green-500/15 text-green-600 border-green-500/30">Online</Badge>
                ) : (
                  <Badge className="h-5 text-[10px] px-1.5 bg-red-500/15 text-red-600 border-red-500/30">Offline</Badge>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-border" />

        {/* Financeiro */}
        <InvoiceSection
          conversationId={conversationId}
          invoice={invoice.data}
          isLoading={invoice.isLoading}
        />

        <div className="h-px bg-border" />

        {/* Sofia — contexto */}
        <Collapsible open={sofiaOpen} onOpenChange={setSofiaOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sofia — contexto</h4>
            <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', sofiaOpen && 'rotate-180')} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 space-y-2">
            {context.isLoading && <Skeleton className="h-12 w-full" />}
            {!context.isLoading && context.data && (
              <div className="space-y-2 text-xs">
                {detail.notes && (
                  <div className="rounded-md bg-muted/50 p-2">
                    <p className="text-muted-foreground font-medium mb-0.5">Nota anterior</p>
                    <p>{detail.notes}</p>
                  </div>
                )}
                {context.data.nps && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">NPS mais recente</span>
                    <span className="font-medium">{context.data.nps.score}/5 · {formatDate(context.data.nps.date)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Chamados abertos</span>
                  <span className="font-medium">{context.data.openTickets}</span>
                </div>
                {context.data.activeSchedule && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Agendamento</span>
                    <span className="font-medium">
                      {formatDate(context.data.activeSchedule.date)} · {PERIOD_LABELS[context.data.activeSchedule.period] ?? context.data.activeSchedule.period}
                    </span>
                  </div>
                )}
                {detail.churn_risk && (
                  <Badge className="h-5 text-[10px] px-1.5 bg-red-500/15 text-red-600 border-red-500/30">
                    Churn risk ativo
                  </Badge>
                )}
                {!detail.notes && !context.data.nps && !context.data.activeSchedule && !detail.churn_risk && (
                  <p className="text-muted-foreground">Sem histórico relevante.</p>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <div className="h-px bg-border" />

        {/* Ações rápidas */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ações rápidas</h4>
          <div className="flex flex-col gap-1.5">
            {sgpUrl && (
              <Button variant="outline" size="sm" className="justify-start text-xs" onClick={() => window.open(sgpUrl, '_blank')}>
                <ExternalLink className="h-3 w-3 mr-2" /> Ver no SGP
              </Button>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

// ─── Chat Area (Coluna 2) ─────────────────────────────────────────────────────

function ChatArea({
  conversationId,
  detail,
  onBack,
  showPanelButton,
  panelButton,
}: {
  conversationId: string;
  detail: ConversationDetail;
  onBack: () => void;
  showPanelButton: boolean;
  panelButton: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reply, setReply] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isHuman = detail.human_mode;

  const humanModeMutation = useMutation({
    mutationFn: (active: boolean) => adminApi.setHumanMode(conversationId, active),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-conversation', conversationId] });
      toast({
        title: data.active ? 'Conversa assumida' : 'Devolvida ao bot',
        description: data.active ? 'Você está respondendo como atendente.' : 'Sofia voltou a atender.',
      });
    },
  });

  const replyMutation = useMutation({
    mutationFn: (message: string) => adminApi.reply(conversationId, message),
    onSuccess: () => {
      setReply('');
      queryClient.invalidateQueries({ queryKey: ['admin-conversation', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['admin-conversations'] });
    },
    onError: (err) => {
      toast({ title: 'Erro ao enviar', description: (err as Error).message, variant: 'destructive' });
    },
  });

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (reply.trim()) replyMutation.mutate(reply);
    }
  }

  function copyToClipboard(code: string) {
    navigator.clipboard.writeText(code).catch(() => null);
    toast({ title: 'Código PIX copiado!' });
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail.messages.length]);

  const messages = detail.messages;
  const customerName = detail.customer?.name ?? formatPhone(detail.phone);
  const modeLabel = detail.session_mode ? SESSION_MODE_LABELS[detail.session_mode] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 shrink-0">
        <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{customerName}</span>
            {modeLabel && (
              <Badge variant="outline" className="h-5 text-[10px] px-1.5">{modeLabel}</Badge>
            )}
            {isHuman && (
              <Badge className="h-5 text-[10px] px-1.5 bg-amber-500/15 text-amber-600 border-amber-500/30">
                Modo humano
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{formatPhone(detail.phone)}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant={isHuman ? 'destructive' : 'default'}
            className="text-xs h-8"
            disabled={humanModeMutation.isPending}
            onClick={() => humanModeMutation.mutate(!isHuman)}
          >
            {isHuman ? (
              <><Bot className="h-3 w-3 mr-1.5" /> Devolver ao bot</>
            ) : (
              <><User className="h-3 w-3 mr-1.5" /> Assumir</>
            )}
          </Button>
          {showPanelButton && panelButton}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4">
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Sem mensagens nesta conversa.</p>
          )}
          {messages.map((msg, idx) => (
            <MessageBubble
              key={`${idx}-${msg.role}-${msg.timestamp ?? idx}`}
              msg={msg}
              onCopyPix={copyToClipboard}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Reply area */}
      <div className="px-4 py-3 border-t border-border/50 shrink-0">
        {isHuman ? (
          <div className="flex gap-2">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Responder como atendente humano... (Enter envia, Shift+Enter quebra linha)"
              rows={2}
              className="resize-none text-sm"
            />
            <Button
              size="icon"
              className="shrink-0 self-end h-10 w-10"
              disabled={!reply.trim() || replyMutation.isPending}
              onClick={() => replyMutation.mutate(reply)}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">
              Sofia está atendendo. Clique em <strong>Assumir</strong> para responder manualmente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Conversations List (Coluna 1) ────────────────────────────────────────────

const TAB_FILTERS: { value: TabFilter; label: string }[] = [
  { value: 'human', label: 'Em andamento' },
  { value: 'bot', label: 'Com bot' },
  { value: 'all', label: 'Todos' },
];

function ConversationList({
  selectedId,
  onSelect,
}: { selectedId: string | null; onSelect: (id: string) => void }) {
  const [tab, setTab] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');

  const conversations = useQuery({
    queryKey: ['admin-conversations', tab],
    queryFn: () => adminApi.getConversations(tab, ''),
    refetchInterval: 5000,
  });

  const list = conversations.data ?? [];

  // Client-side search filter
  const filtered = search.trim()
    ? list.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone.includes(search.replace(/\D/g, '')),
      )
    : list;

  const counts: Record<TabFilter, number> = {
    human: list.filter((c) => c.mode === 'human').length,
    bot: list.filter((c) => c.mode === 'bot').length,
    all: list.length,
  };

  return (
    <div className="flex flex-col h-full border-r border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
        <h2 className="font-semibold text-sm">Atendimentos</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => conversations.refetch()}
          disabled={conversations.isFetching}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', conversations.isFetching && 'animate-spin')} />
        </Button>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-2 shrink-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabFilter)}>
          <TabsList className="w-full h-8 text-xs">
            {TAB_FILTERS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1 text-xs gap-1">
                {t.label}
                <span className="text-[10px] opacity-60">({counts[t.value]})</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Search */}
      <div className="px-3 py-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2 space-y-0.5">
          {conversations.isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`skel-${i}`} className="h-16 w-full rounded-lg mb-1" />
            ))}
          {!conversations.isLoading && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {search ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa neste filtro.'}
            </p>
          )}
          {filtered.map((item) => (
            <ConvItem
              key={item.id}
              item={item}
              selected={selectedId === item.id}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Conversations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const prevMessagesLengthRef = useRef<number>(0);

  const detail = useQuery({
    queryKey: ['admin-conversation', selectedId],
    queryFn: () => adminApi.getConversation(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 5000,
  });

  // New message notification for human_mode conversations
  const notifyNewMessage = useCallback((detailData: ConversationDetail) => {
    const current = detailData.messages.length;
    const prev = prevMessagesLengthRef.current;
    if (prev > 0 && current > prev && detailData.human_mode) {
      const name = detailData.customer?.name ?? formatPhone(detailData.phone);
      toast({ title: `Nova mensagem de ${name}` });
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Nova mensagem de ${name}`, { body: detailData.messages.at(-1)?.content ?? '' });
      }
    }
    prevMessagesLengthRef.current = current;
  }, [toast]);

  useEffect(() => {
    if (detail.data) notifyNewMessage(detail.data);
  }, [detail.data, notifyNewMessage]);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => null);
    }
  }, []);

  function selectConversation(id: string) {
    setSelectedId(id);
    prevMessagesLengthRef.current = 0;
    setMobileView('chat');
    queryClient.invalidateQueries({ queryKey: ['admin-conversation', id] });
  }

  function goBack() {
    setMobileView('list');
  }

  // Customer panel content, shared between desktop and drawer
  const panelContent = selectedId && detail.data ? (
    <CustomerPanel conversationId={selectedId} detail={detail.data} />
  ) : null;

  // Tablet drawer trigger button (shown in chat header on md screens)
  const drawerButton = (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="h-8 w-8 hidden md:flex lg:hidden">
          <User className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[300px] p-0">
        <SheetHeader className="px-4 py-3 border-b border-border/50">
          <SheetTitle className="text-sm">Painel do cliente</SheetTitle>
        </SheetHeader>
        {panelContent}
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* ── Desktop: 3 columns ── */}
      <div className="hidden lg:grid lg:grid-cols-[320px_1fr_300px] h-full overflow-hidden">
        {/* Column 1 */}
        <ConversationList selectedId={selectedId} onSelect={selectConversation} />

        {/* Column 2 */}
        <div className="flex flex-col h-full overflow-hidden">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecione uma conversa para ver o histórico</p>
            </div>
          ) : detail.isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : detail.data ? (
            <ChatArea
              conversationId={selectedId}
              detail={detail.data}
              onBack={goBack}
              showPanelButton={false}
              panelButton={null}
            />
          ) : null}
        </div>

        {/* Column 3 */}
        <div className="border-l border-border/50 overflow-hidden h-full">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <User className="h-8 w-8 opacity-20" />
              <p className="text-xs">Painel do cliente</p>
            </div>
          ) : detail.isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : detail.data ? (
            <CustomerPanel conversationId={selectedId} detail={detail.data} />
          ) : null}
        </div>
      </div>

      {/* ── Tablet: 2 columns (list + chat), panel in drawer ── */}
      <div className="hidden md:grid md:grid-cols-[280px_1fr] lg:hidden h-full overflow-hidden">
        <ConversationList selectedId={selectedId} onSelect={selectConversation} />
        <div className="flex flex-col h-full overflow-hidden">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          ) : detail.isLoading ? (
            <div className="p-6 space-y-3"><Skeleton className="h-40 w-full" /></div>
          ) : detail.data ? (
            <ChatArea
              conversationId={selectedId}
              detail={detail.data}
              onBack={goBack}
              showPanelButton
              panelButton={drawerButton}
            />
          ) : null}
        </div>
      </div>

      {/* ── Mobile: single column ── */}
      <div className="md:hidden h-full overflow-hidden">
        {mobileView === 'list' || !selectedId ? (
          <ConversationList selectedId={selectedId} onSelect={selectConversation} />
        ) : detail.isLoading ? (
          <div className="p-4 space-y-3"><Skeleton className="h-40 w-full" /></div>
        ) : detail.data ? (
          <ChatArea
            conversationId={selectedId}
            detail={detail.data}
            onBack={goBack}
            showPanelButton={false}
            panelButton={null}
          />
        ) : null}
      </div>
    </div>
  );
}
