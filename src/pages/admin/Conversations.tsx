import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare, RefreshCw, Search, Bot, User, Send, ChevronLeft,
  ChevronDown, Copy, ExternalLink, QrCode, FileText, Download,
  Maximize2, X, AlertTriangle, Star, Calendar, Ticket,
  UserCheck,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

type TabFilter = 'human' | 'bot' | 'all';

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_LABELS: Record<string, string> = {
  prospect: 'Prospect',
  billing: 'Cobrança',
  support: 'Suporte',
  commercial: 'Comercial',
  default: 'Geral',
};

const AVATAR_COLORS: Record<string, string> = {
  billing: 'bg-amber-900 text-amber-200',
  support: 'bg-red-900 text-red-200',
  prospect: 'bg-green-900 text-green-200',
  commercial: 'bg-green-900 text-green-200',
  default: 'bg-gray-700 text-gray-300',
};

const PERIOD_LABELS: Record<string, string> = {
  morning: 'Manhã (8h–12h)',
  afternoon: 'Tarde (14h–18h)',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDisplayPhone(phone: string): { display: string; isExternal: boolean } {
  const digits = phone.replace(/\D/g, '');
  // Brazilian +55: strip country code and format
  if (phone.startsWith('+55') || (digits.length >= 12 && digits.startsWith('55'))) {
    const local = digits.startsWith('55') ? digits.slice(2) : digits;
    if (local.length === 11) {
      return { display: `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`, isExternal: false };
    }
    if (local.length === 10) {
      return { display: `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`, isExternal: false };
    }
  }
  // LIDs, groups, channels, long numbers → "Contato externo"
  if (digits.length > 13 || phone.includes('@lid') || phone.includes('@g.us') || phone.includes('@newsletter')) {
    return { display: 'Contato externo', isExternal: true };
  }
  // Brazilian without country code
  if (digits.length === 11) {
    return { display: `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`, isExternal: false };
  }
  if (digits.length === 10) {
    return { display: `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`, isExternal: false };
  }
  // Other international
  if (phone.startsWith('+') && !phone.startsWith('+55')) {
    return { display: phone.length > 13 ? phone.slice(0, 12) + '…' : phone, isExternal: false };
  }
  return { display: phone, isExternal: false };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  if (h < 48) return 'ontem';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  const first = (parts[0] ?? '')[0] ?? '';
  const last = (parts[parts.length - 1] ?? '')[0] ?? '';
  return (first + last).toUpperCase();
}

function extractPixFromMessage(content: string): string | null {
  return content.match(/\b(00020126\S+)/)?.[1] ?? null;
}

function formatMessageText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function ConvAvatar({
  name, sessionMode, churnRisk, isExternal,
}: { name: string; sessionMode: string | null; churnRisk: boolean; isExternal: boolean }) {
  const colorCls = sessionMode ? (AVATAR_COLORS[sessionMode] ?? AVATAR_COLORS.default) : AVATAR_COLORS.default;
  return (
    <div className="relative shrink-0">
      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold', colorCls)}>
        {isExternal ? <Bot className="h-4 w-4" /> : getInitials(name)}
      </div>
      {churnRisk && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-gray-900" />
      )}
    </div>
  );
}

// ─── Conversation Item ────────────────────────────────────────────────────────

function ConvItem({ item, selected, onClick }: {
  item: ConversationSummary;
  selected: boolean;
  onClick: () => void;
}) {
  const { display, isExternal } = formatDisplayPhone(item.phone);
  const displayName = item.name && item.name !== item.phone ? item.name : display;
  const isHuman = item.mode === 'human';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left flex gap-3 items-start px-4 py-3 min-h-[72px] transition-colors',
        selected
          ? 'bg-blue-950/50 border-l-2 border-blue-500'
          : 'border-l-2 border-transparent hover:bg-gray-800/50',
      )}
    >
      <ConvAvatar
        name={displayName}
        sessionMode={item.sessionMode}
        churnRisk={item.churnRisk}
        isExternal={isExternal}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="font-medium text-sm text-gray-100 truncate max-w-[160px]">{displayName}</span>
          <span className="text-[10px] text-gray-500 whitespace-nowrap shrink-0">{relativeTime(item.updatedAt)}</span>
        </div>
        <p className="text-xs text-gray-400 truncate max-w-[180px]">{item.lastText || 'Sem mensagens'}</p>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {isHuman ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-300">Humano</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">Bot</span>
          )}
          {item.sessionMode && item.sessionMode !== 'default' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
              {SESSION_LABELS[item.sessionMode] ?? item.sessionMode}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── PIX Card ─────────────────────────────────────────────────────────────────

function PixCard({ pixCode, onCopy }: { pixCode: string; onCopy: () => void }) {
  return (
    <div className="bg-green-950 border border-green-800/50 rounded-xl p-4 max-w-[280px]">
      <div className="flex items-center gap-2 mb-2">
        <QrCode className="h-4 w-4 text-green-400" />
        <span className="text-sm font-medium text-green-400">Código PIX</span>
      </div>
      <p className="font-mono text-xs text-gray-400 truncate max-w-full mb-3">{pixCode}</p>
      <button
        type="button"
        onClick={onCopy}
        className="w-full bg-green-800 hover:bg-green-700 text-white text-xs rounded-lg py-2 transition-colors flex items-center justify-center gap-1.5"
      >
        <Copy className="h-3 w-3" /> Copiar código
      </button>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onCopyPix,
}: {
  msg: ConversationDetail['messages'][number];
  onCopyPix: (code: string) => void;
}) {
  const isUser = msg.role === 'user';
  const isHuman = msg.source === 'human';
  const pixCode = !isUser ? extractPixFromMessage(msg.content) : null;
  const time = msg.timestamp
    ? new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={cn('flex', isUser ? 'justify-start' : 'justify-end')}>
      <div className={cn('max-w-[65%] flex flex-col', isUser ? 'items-start' : 'items-end')}>
        {!isUser && (
          <span className={cn(
            'text-[10px] font-medium tracking-wider mb-1 px-1',
            isHuman ? 'text-orange-400' : 'text-blue-400',
          )}>
            {isHuman ? 'ATENDENTE' : 'SOFIA'}
          </span>
        )}
        {pixCode ? (
          <PixCard pixCode={pixCode} onCopy={() => onCopyPix(pixCode)} />
        ) : (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm text-gray-100',
              isUser
                ? 'bg-gray-800 rounded-tl-sm'
                : isHuman
                  ? 'bg-orange-900/40 border border-orange-800/40 rounded-tr-sm'
                  : 'bg-blue-900/60 border border-blue-800/40 rounded-tr-sm',
            )}
            dangerouslySetInnerHTML={{ __html: formatMessageText(msg.content) }}
          />
        )}
        {time && (
          <span className="text-[10px] text-gray-500 mt-1 px-1">{time}</span>
        )}
      </div>
    </div>
  );
}

// ─── Invoice Section ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-900/50 text-blue-300',
  overdue: 'bg-red-900/50 text-red-300',
  paid: 'bg-green-900/50 text-green-300',
  cancelled: 'bg-gray-700 text-gray-400',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Em aberto',
  overdue: 'Vencida',
  paid: 'Paga',
  cancelled: 'Cancelada',
};

function InvoiceSection({
  conversationId,
  invoice,
  isLoading,
}: { conversationId: string; invoice: InvoiceInfo | null | undefined; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qrOpen, setQrOpen] = useState(false);
  const [generatedPix, setGeneratedPix] = useState<string | null>(null);

  const generatePixMutation = useMutation({
    mutationFn: () => adminApi.generatePix(conversationId),
    onSuccess: ({ pixCode }) => {
      setGeneratedPix(pixCode);
      navigator.clipboard.writeText(pixCode).catch(() => null);
      toast({ title: 'PIX gerado e copiado!' });
      queryClient.invalidateQueries({ queryKey: ['admin-conversation-invoice', conversationId] });
    },
    onError: (err) => toast({ title: 'Erro ao gerar PIX', description: (err as Error).message, variant: 'destructive' }),
  });

  const activePix = invoice?.pixCode ?? generatedPix;

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).catch(() => null);
    toast({ title: `${label} copiado!` });
  }

  if (isLoading) {
    return (
      <div className="space-y-2 px-4">
        <Skeleton className="h-3 w-20 bg-gray-800" />
        <Skeleton className="h-16 w-full bg-gray-800 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase px-4 pb-2">Financeiro</p>

      {!invoice ? (
        <div className="mx-4 bg-gray-800/30 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500">Sem faturas em aberto</p>
        </div>
      ) : (
        <div className="mx-4 bg-gray-800/50 rounded-xl p-4 space-y-4">
          {/* Row: vencimento / valor / status */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Vencimento</p>
              <p className="text-xs text-gray-200 font-medium">{formatDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Valor</p>
              <p className="text-xs text-gray-200 font-medium">{formatCurrency(invoice.amount)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Status</p>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', STATUS_COLORS[invoice.status] ?? STATUS_COLORS.open)}>
                {STATUS_LABELS[invoice.status] ?? invoice.status}
              </span>
            </div>
          </div>

          <div className="border-t border-white/8" />

          {/* 2x3 action grid */}
          <TooltipProvider>
            <div className="grid grid-cols-3 gap-2">
              {/* Cod PIX */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!invoice.canGeneratePix && !activePix}
                    onClick={() => activePix ? copy(activePix, 'Código PIX') : generatePixMutation.mutate()}
                    className={cn(
                      'rounded-lg p-2.5 flex flex-col items-center gap-1 text-[10px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                      invoice.canGeneratePix || activePix
                        ? 'bg-green-900/40 text-green-400 hover:bg-green-800/50'
                        : 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50',
                    )}
                  >
                    <QrCode className="h-4 w-4" />
                    Cod PIX
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {activePix ? 'Copiar código PIX' : 'Gerar código PIX'}
                </TooltipContent>
              </Tooltip>

              {/* Cod Boleto */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!invoice.barcode}
                    onClick={() => invoice.barcode && copy(invoice.barcode, 'Código do boleto')}
                    className="bg-gray-700/50 hover:bg-gray-600/50 rounded-lg p-2.5 flex flex-col items-center gap-1 text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FileText className="h-4 w-4" />
                    Cod Boleto
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Copiar linha digitável</TooltipContent>
              </Tooltip>

              {/* Link Fatura */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!invoice.link}
                    onClick={() => invoice.link && window.open(invoice.link, '_blank')}
                    className="bg-gray-700/50 hover:bg-gray-600/50 rounded-lg p-2.5 flex flex-col items-center gap-1 text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Link Fatura
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Abrir link da fatura</TooltipContent>
              </Tooltip>

              {/* QR PIX */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!activePix}
                    onClick={() => setQrOpen(true)}
                    className="bg-gray-700/50 hover:bg-gray-600/50 rounded-lg p-2.5 flex flex-col items-center gap-1 text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Maximize2 className="h-4 w-4" />
                    QR PIX
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Ver QR Code PIX</TooltipContent>
              </Tooltip>

              {/* PDF Fatura */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!invoice.link}
                    onClick={() => invoice.link && window.open(`${invoice.link}?format=pdf`, '_blank')}
                    className="bg-gray-700/50 hover:bg-gray-600/50 rounded-lg p-2.5 flex flex-col items-center gap-1 text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="h-4 w-4" />
                    PDF Fatura
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Baixar PDF da fatura</TooltipContent>
              </Tooltip>

              {/* Copiar PIX */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!activePix}
                    onClick={() => activePix && copy(activePix, 'Código PIX')}
                    className="bg-gray-700/50 hover:bg-gray-600/50 rounded-lg p-2.5 flex flex-col items-center gap-1 text-[10px] text-gray-300 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar PIX
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Copiar código PIX</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      )}

      {/* QR Dialog */}
      {activePix && (
        <Dialog open={qrOpen} onOpenChange={setQrOpen}>
          <DialogContent className="max-w-xs bg-gray-900 border-white/10">
            <DialogHeader>
              <DialogTitle className="text-gray-100">QR Code PIX</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG value={activePix} size={192} />
              </div>
              <button
                type="button"
                onClick={() => copy(activePix, 'Código PIX')}
                className="w-full bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm rounded-lg py-2.5 flex items-center justify-center gap-2 transition-colors"
              >
                <Copy className="h-4 w-4" /> Copiar código PIX
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Sofia Context (collapsible) ──────────────────────────────────────────────

function SofiaContext({ conversationId, detail }: {
  conversationId: string;
  detail: ConversationDetail;
}) {
  const [open, setOpen] = useState(false);

  const ctx = useQuery({
    queryKey: ['admin-conversation-context', conversationId],
    queryFn: () => adminApi.getConversationContext(conversationId),
    enabled: open,
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-2 hover:bg-gray-800/30 transition-colors">
        <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase">Contexto Sofia</p>
        <ChevronDown className={cn('h-3.5 w-3.5 text-gray-500 transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-3 space-y-2">
          {ctx.isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-full bg-gray-800 rounded" />)}
            </div>
          )}
          {ctx.data && (
            <div className="space-y-2">
              {detail.notes && (
                <div className="bg-gray-800/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Nota anterior</p>
                  <p className="text-xs text-gray-300">{detail.notes}</p>
                </div>
              )}
              {ctx.data.nps && (
                <div className="flex items-center gap-2 text-xs">
                  <Star className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                  <span className="text-gray-400">Último NPS:</span>
                  <span className="text-gray-200 font-medium">{ctx.data.nps.score}/5</span>
                  <span className="text-gray-500">{relativeTime(ctx.data.nps.date)}</span>
                </div>
              )}
              <div className={cn('flex items-center gap-2 text-xs', ctx.data.openTickets > 0 && 'text-red-400')}>
                <Ticket className="h-3.5 w-3.5 shrink-0" />
                <span className={ctx.data.openTickets > 0 ? 'text-red-300' : 'text-gray-400'}>
                  {ctx.data.openTickets} chamado{ctx.data.openTickets !== 1 ? 's' : ''} aberto{ctx.data.openTickets !== 1 ? 's' : ''}
                </span>
              </div>
              {ctx.data.activeSchedule && (
                <div className="flex items-center gap-2 text-xs">
                  <Calendar className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span className="text-gray-400">Agendamento:</span>
                  <span className="text-gray-200">
                    {PERIOD_LABELS[ctx.data.activeSchedule.period] ?? ctx.data.activeSchedule.period}
                    {' · '}{formatDate(ctx.data.activeSchedule.date)}
                  </span>
                </div>
              )}
              {detail.churn_risk && (
                <div className="flex items-center gap-2 text-xs text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Cliente em risco de churn</span>
                </div>
              )}
              {!detail.notes && !ctx.data.nps && ctx.data.openTickets === 0 && !ctx.data.activeSchedule && !detail.churn_risk && (
                <p className="text-xs text-gray-600">Nenhum alerta ativo</p>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Customer Panel (Coluna 3) ────────────────────────────────────────────────

function CustomerPanel({ conversationId, detail }: {
  conversationId: string;
  detail: ConversationDetail;
}) {
  const invoice = useQuery({
    queryKey: ['admin-conversation-invoice', conversationId],
    queryFn: () => adminApi.getConversationInvoice(conversationId),
  });

  const customer = detail.customer;
  const contractId = customer
    ? (customer as unknown as Record<string, unknown>).id as string | undefined
    : undefined;
  const document = customer
    ? (customer as unknown as Record<string, unknown>).document as string | undefined
    : undefined;
  const status = customer?.status;

  const contractStatusMap: Record<string, { label: string; cls: string }> = {
    active: { label: 'Ativo', cls: 'bg-green-900/50 text-green-400' },
    suspended: { label: 'Suspenso', cls: 'bg-red-900/50 text-red-400' },
    cancelled: { label: 'Cancelado', cls: 'bg-gray-700 text-gray-400' },
  };
  const contractStatus = contractStatusMap[status ?? ''] ?? { label: status ?? 'N/A', cls: 'bg-gray-700 text-gray-400' };

  const sgpUrl = contractId
    ? `https://salesnet.sgp.tsmx.com.br/central/contrato/${contractId}`
    : null;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* ── Cliente ── */}
      <div className="pt-4 pb-3">
        <p className="text-[10px] font-semibold tracking-widest text-gray-500 uppercase px-4 pb-2">Cliente</p>

        {!customer ? (
          <div className="mx-4 bg-gray-800/30 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500">Não identificado no SGP</p>
          </div>
        ) : (
          <div className="mx-4 bg-gray-800/50 rounded-xl p-4 space-y-3">
            {/* Badges SGP + contrato */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded font-medium">SGP</span>
              {contractId && (
                <span className="text-[10px] bg-gray-700 text-gray-300 px-2 py-0.5 rounded font-mono">
                  Contrato {contractId}
                </span>
              )}
            </div>

            {/* Nome + plano */}
            <div>
              <p className="text-sm font-semibold text-gray-100">{customer.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{customer.plan?.name ?? 'Plano N/A'}</p>
            </div>

            <div className="border-t border-white/8" />

            {/* Status grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Documento</p>
                <p className="text-xs text-gray-200 font-medium font-mono">{document ?? '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Status</p>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', contractStatus.cls)}>
                  {contractStatus.label}
                </span>
              </div>
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Conexão</p>
                <div className="flex items-center gap-1.5">
                  {status === 'active' ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-xs text-green-400">Online</span>
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <span className="text-xs text-red-400">Offline</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Link SGP */}
            {sgpUrl && (
              <button
                type="button"
                onClick={() => window.open(sgpUrl, '_blank')}
                className="w-full flex items-center justify-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors pt-1"
              >
                <ExternalLink className="h-3 w-3" /> Ver no SGP
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-white/8 mx-4" />

      {/* ── Financeiro ── */}
      <div className="py-3">
        <InvoiceSection
          conversationId={conversationId}
          invoice={invoice.data}
          isLoading={invoice.isLoading}
        />
      </div>

      <div className="border-t border-white/8 mx-4" />

      {/* ── Sofia Contexto ── */}
      <div className="py-1">
        <SofiaContext conversationId={conversationId} detail={detail} />
      </div>
    </div>
  );
}

// ─── Chat Area (Coluna 2) ─────────────────────────────────────────────────────

function ChatArea({
  conversationId,
  detail,
  onBack,
  panelButton,
}: {
  conversationId: string;
  detail: ConversationDetail;
  onBack: () => void;
  panelButton?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reply, setReply] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isHuman = detail.human_mode;
  const { display, isExternal } = formatDisplayPhone(detail.phone);
  const customerName = detail.customer?.name ?? (isExternal ? 'Contato externo' : display);
  const modeLabel = detail.session_mode ? SESSION_LABELS[detail.session_mode] : null;

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
    onError: (err) => toast({ title: 'Erro ao enviar', description: (err as Error).message, variant: 'destructive' }),
  });

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (reply.trim()) replyMutation.mutate(reply);
    }
  }

  function copyPix(code: string) {
    navigator.clipboard.writeText(code).catch(() => null);
    toast({ title: 'Código PIX copiado!' });
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail.messages.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header fixo ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-6 border-b border-white/8 h-16 bg-gray-900">
        {/* Voltar (mobile/tablet) */}
        <button
          type="button"
          onClick={onBack}
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-gray-400" />
        </button>

        {/* Avatar pequeno */}
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
          detail.session_mode ? (AVATAR_COLORS[detail.session_mode] ?? AVATAR_COLORS.default) : AVATAR_COLORS.default,
        )}>
          {isExternal ? <Bot className="h-3.5 w-3.5" /> : getInitials(customerName)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-gray-100 truncate">{customerName}</span>
            {modeLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-400">{modeLabel}</span>
            )}
            {isHuman && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/50 text-orange-300">Modo humano</span>
            )}
          </div>
          <p className="text-xs text-gray-500">{display}</p>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={humanModeMutation.isPending}
            onClick={() => humanModeMutation.mutate(!isHuman)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              isHuman
                ? 'bg-orange-950/50 text-orange-300 border-orange-700/50 hover:bg-orange-900/50'
                : 'bg-gray-800 text-gray-300 border-white/10 hover:bg-gray-700 hover:text-white',
            )}
          >
            {isHuman ? (
              <><Bot className="h-3.5 w-3.5" /> Devolver ao bot</>
            ) : (
              <><UserCheck className="h-3.5 w-3.5" /> Assumir</>
            )}
          </button>
          {panelButton}
        </div>
      </div>

      {/* ── Mensagens com scroll ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-950">
        {detail.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <MessageSquare className="h-10 w-10 text-gray-700" />
            <p className="text-sm text-gray-600">Sem mensagens nesta conversa</p>
          </div>
        )}
        {detail.messages.map((msg, idx) => (
          <MessageBubble
            key={`${idx}-${msg.role}-${msg.timestamp ?? idx}`}
            msg={msg}
            onCopyPix={copyPix}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input fixo no bottom ── */}
      <div className="flex-shrink-0 bg-gray-900 border-t border-white/8">
        {!isHuman && (
          <div className="bg-blue-950/30 border-b border-blue-800/20 px-4 py-2 text-center">
            <span className="text-xs text-blue-400">Sofia está atendendo ativamente</span>
          </div>
        )}
        {isHuman && (
          <div className="p-4 space-y-2">
            <div className="flex gap-2 items-end">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Responder como atendente humano..."
                rows={2}
                className="resize-none text-sm bg-gray-800 border-white/10 rounded-xl placeholder:text-gray-500 focus:border-blue-600 min-h-[44px] max-h-[120px]"
              />
              <button
                type="button"
                disabled={!reply.trim() || replyMutation.isPending}
                onClick={() => reply.trim() && replyMutation.mutate(reply)}
                className="shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors"
              >
                <Send className="h-4 w-4 text-white" />
              </button>
            </div>
            <p className="text-[10px] text-gray-600">Enter para enviar · Shift+Enter nova linha</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Conversation List (Coluna 1) ─────────────────────────────────────────────

const TABS: { value: TabFilter; label: string }[] = [
  { value: 'human', label: 'Em andamento' },
  { value: 'bot', label: 'Com bot' },
  { value: 'all', label: 'Todos' },
];

function ConversationList({ selectedId, onSelect }: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');

  const conversations = useQuery({
    queryKey: ['admin-conversations', tab],
    queryFn: () => adminApi.getConversations(tab, ''),
    refetchInterval: 5_000,
  });

  const list = conversations.data ?? [];

  const filtered = search.trim()
    ? list.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.replace(/\D/g, '').includes(search.replace(/\D/g, '')),
      )
    : list;

  const counts: Record<TabFilter, number> = {
    human: list.filter((c) => c.mode === 'human').length,
    bot: list.filter((c) => c.mode === 'bot').length,
    all: list.length,
  };

  return (
    <div className="w-80 flex-shrink-0 flex flex-col border-r border-white/8 overflow-hidden bg-gray-900">
      {/* Header fixo */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 space-y-3 border-b border-white/8">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-base text-gray-100">Atendimentos</h2>
          <button
            type="button"
            onClick={() => conversations.refetch()}
            disabled={conversations.isFetching}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5 text-gray-500', conversations.isFetching && 'animate-spin')} />
          </button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as TabFilter)}>
          <TabsList className="w-full h-8 bg-gray-800 text-xs">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1 text-[11px] gap-1 data-[state=active]:bg-gray-700">
                {t.label}
                {t.value === 'human' && counts.human > 0 && (
                  <span className="bg-orange-900/80 text-orange-300 text-[9px] px-1 rounded-full">{counts.human}</span>
                )}
                {t.value === 'bot' && counts.bot > 0 && (
                  <span className="bg-gray-600 text-gray-300 text-[9px] px-1 rounded-full">{counts.bot}</span>
                )}
                {t.value === 'all' && (
                  <span className="text-gray-500 text-[9px]">({counts.all})</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conversa..."
            className="pl-8 h-8 text-xs bg-gray-800 border-white/10 placeholder:text-gray-500 text-gray-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Lista com scroll próprio */}
      <div className="flex-1 overflow-y-auto">
        {conversations.isLoading && (
          <div className="p-3 space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full rounded-none bg-gray-800/60" />
            ))}
          </div>
        )}
        {!conversations.isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <MessageSquare className="h-8 w-8 text-gray-600" />
            <p className="text-sm text-gray-500">Nenhuma conversa encontrada</p>
          </div>
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
    </div>
  );
}

// ─── Empty States ─────────────────────────────────────────────────────────────

function ChatEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 bg-gray-950">
      <MessageSquare className="h-12 w-12 text-gray-700" />
      <div className="text-center">
        <p className="text-lg text-gray-600">Selecione uma conversa</p>
        <p className="text-sm text-gray-700 mt-1">para ver o histórico de mensagens</p>
      </div>
    </div>
  );
}

function PanelEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <User className="h-8 w-8 text-gray-700" />
      <p className="text-xs text-gray-600">Selecione uma conversa</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Conversations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const prevMsgCountRef = useRef(0);

  const detail = useQuery({
    queryKey: ['admin-conversation', selectedId],
    queryFn: () => adminApi.getConversation(selectedId!),
    enabled: !!selectedId,
    refetchInterval: 5_000,
  });

  // New message toast + browser notification
  const notifyNewMsg = useCallback((data: ConversationDetail) => {
    const count = data.messages.length;
    if (prevMsgCountRef.current > 0 && count > prevMsgCountRef.current && data.human_mode) {
      const name = data.customer?.name ?? formatDisplayPhone(data.phone).display;
      toast({ title: `Nova mensagem de ${name}` });
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Nova mensagem de ${name}`, {
          body: data.messages.at(-1)?.content ?? '',
        });
      }
    }
    prevMsgCountRef.current = count;
  }, [toast]);

  useEffect(() => {
    if (detail.data) notifyNewMsg(detail.data);
  }, [detail.data, notifyNewMsg]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => null);
    }
  }, []);

  function selectConversation(id: string) {
    setSelectedId(id);
    prevMsgCountRef.current = 0;
    setMobileView('chat');
    queryClient.invalidateQueries({ queryKey: ['admin-conversation', id] });
  }

  // Shared customer panel for tablet sheet + desktop column
  function renderPanel() {
    if (!selectedId) return <PanelEmpty />;
    if (detail.isLoading) {
      return (
        <div className="p-4 space-y-3">
          <Skeleton className="h-4 w-24 bg-gray-800" />
          <Skeleton className="h-32 w-full bg-gray-800 rounded-xl" />
          <Skeleton className="h-4 w-20 bg-gray-800" />
          <Skeleton className="h-20 w-full bg-gray-800 rounded-xl" />
        </div>
      );
    }
    if (!detail.data) return <PanelEmpty />;
    return <CustomerPanel conversationId={selectedId} detail={detail.data} />;
  }

  // Tablet panel drawer button
  const tabletPanelBtn = (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="hidden md:flex lg:hidden items-center justify-center w-8 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
        >
          <User className="h-4 w-4 text-gray-300" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 p-0 bg-gray-900 border-white/8">
        <SheetHeader className="px-4 py-3 border-b border-white/8">
          <SheetTitle className="text-sm text-gray-100">Painel do cliente</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col h-[calc(100%-56px)] overflow-hidden">
          {renderPanel()}
        </div>
      </SheetContent>
    </Sheet>
  );

  function renderChatArea(showPanelBtn: boolean) {
    if (!selectedId) return <ChatEmpty />;
    if (detail.isLoading) {
      return (
        <div className="flex flex-col h-full overflow-hidden bg-gray-950">
          <div className="flex-shrink-0 h-16 border-b border-white/8 bg-gray-900 px-6 flex items-center gap-3">
            <Skeleton className="w-8 h-8 rounded-full bg-gray-800" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-32 bg-gray-800" />
              <Skeleton className="h-2.5 w-24 bg-gray-800" />
            </div>
          </div>
          <div className="flex-1 p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className={cn('h-10 bg-gray-800 rounded-2xl', i % 2 === 0 ? 'w-2/3 ml-auto' : 'w-3/4')} />
            ))}
          </div>
        </div>
      );
    }
    if (!detail.data) return <ChatEmpty />;
    return (
      <ChatArea
        conversationId={selectedId}
        detail={detail.data}
        onBack={() => setMobileView('list')}
        panelButton={showPanelBtn ? tabletPanelBtn : undefined}
      />
    );
  }

  // ─── Container raiz: fixed, escapa do layout admin ───
  // Desktop (lg+): inset-0, left-64 (sidebar width)
  // Tablet/Mobile: top-16 bottom-16 inset-x-0 (below header, above bottom nav)
  return (
    <div className={cn(
      'fixed z-10 flex overflow-hidden bg-gray-950',
      'top-16 bottom-16 inset-x-0',         // mobile & tablet
      'lg:inset-0 lg:left-64',               // desktop: below nothing, right of sidebar
    )}>

      {/* ── Desktop: 3 colunas ── */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Coluna 1 */}
        <ConversationList selectedId={selectedId} onSelect={selectConversation} />

        {/* Coluna 2 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderChatArea(false)}
        </div>

        {/* Coluna 3 */}
        <div className="w-72 flex-shrink-0 flex flex-col h-full border-l border-white/8 overflow-hidden bg-gray-900">
          {renderPanel()}
        </div>
      </div>

      {/* ── Tablet (md–lg): 2 colunas + drawer ── */}
      <div className="hidden md:flex lg:hidden flex-1 overflow-hidden">
        <ConversationList selectedId={selectedId} onSelect={selectConversation} />
        <div className="flex-1 flex flex-col overflow-hidden">
          {renderChatArea(true)}
        </div>
      </div>

      {/* ── Mobile: uma coluna por vez ── */}
      <div className="flex md:hidden flex-1 overflow-hidden">
        {mobileView === 'list' || !selectedId ? (
          <ConversationList selectedId={selectedId} onSelect={selectConversation} />
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {renderChatArea(false)}
          </div>
        )}
      </div>

    </div>
  );
}
