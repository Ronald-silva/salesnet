import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, MoreHorizontal, Check, CalendarClock, X, Zap } from 'lucide-react';
import {
  adminApi,
  type ScheduleItem,
  type SchedulePeriod,
  type ScheduleStatus,
} from '@/api/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminFilterChips } from '@/components/admin/AdminFilterChips';
import { Card, CardContent } from '@/components/ui/card';

type PeriodFilter = 'all' | SchedulePeriod;
type TypeFilter = 'all' | 'instalacao' | 'manutencao';
type StatusFilter = 'all' | ScheduleStatus;

const TODAY = new Date().toISOString().split('T')[0];

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^55/, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function PeriodBadge({ period }: { period: SchedulePeriod }) {
  return period === 'morning' ? (
    <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30">
      Manhã
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-orange-500/15 text-orange-400 border-orange-500/30">
      Tarde
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  return type === 'instalacao' ? (
    <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">
      Instalação
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-muted text-muted-foreground">
      Manutenção
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'done') {
    return (
      <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">
        Concluído
      </Badge>
    );
  }
  if (status === 'cancelled') {
    return (
      <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30">
        Cancelado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-blue-500/15 text-blue-400 border-blue-500/30">
      Agendado
    </Badge>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
    </div>
  );
}

interface ScheduleActionsProps {
  item: ScheduleItem;
  onReschedule: (item: ScheduleItem) => void;
  onCancel: (id: string) => void;
  onDone: (id: string) => void;
  onBringForward: (id: string) => void;
  bringForwardPending: boolean;
}

function ScheduleActions({
  item,
  onReschedule,
  onCancel,
  onDone,
  onBringForward,
  bringForwardPending,
}: ScheduleActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-[44px] min-w-[44px]">
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Ações</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {item.status === 'scheduled' && (
          <DropdownMenuItem onClick={() => onDone(item.id)}>
            <Check className="h-4 w-4 mr-2" />
            Marcar como Concluído
          </DropdownMenuItem>
        )}
        {item.status === 'scheduled' && item.bring_forward_status !== 'accepted' && (
          <DropdownMenuItem disabled={bringForwardPending} onClick={() => onBringForward(item.id)}>
            <Zap className="h-4 w-4 mr-2" />
            Oferecer antecipação
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onReschedule(item)}>
          <CalendarClock className="h-4 w-4 mr-2" />
          Reagendar
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onCancel(item.id)}
        >
          <X className="h-4 w-4 mr-2" />
          Cancelar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScheduleMobileCard({
  item,
  actions,
}: {
  item: ScheduleItem;
  actions: ScheduleActionsProps;
}) {
  return (
    <Card className="rounded-xl border-border/50 overflow-hidden md:hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">{item.customer_name ?? formatPhone(item.phone)}</p>
            <p className="text-sm text-muted-foreground">{formatPhone(item.phone)}</p>
          </div>
          <ScheduleActions {...actions} />
        </div>
        <div className="flex flex-wrap gap-2">
          <PeriodBadge period={item.period} />
          <TypeBadge type={item.type} />
          <StatusBadge status={item.status} />
        </div>
        <div className="text-sm space-y-1 text-muted-foreground">
          <p>
            <span className="text-foreground font-medium">{formatDate(item.visit_date)}</span>
          </p>
          {item.address && <p className="line-clamp-2">{item.address}</p>}
        </div>
        {item.bring_forward_status === 'offered' && (
          <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 w-fit">
            Antecipação ofertada
          </Badge>
        )}
        {item.bring_forward_status === 'accepted' && (
          <Badge variant="outline" className="bg-violet-500/15 text-violet-400 border-violet-500/30 w-fit">
            Antecipada
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

export default function Schedules() {
  const queryClient = useQueryClient();

  const [date, setDate] = useState<string>(TODAY);
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);

  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(TODAY);
  const [reschedulePeriod, setReschedulePeriod] = useState<SchedulePeriod>('morning');

  const [cancelId, setCancelId] = useState<string | null>(null);

  const isToday = date === TODAY;

  const schedulesQuery = useQuery({
    queryKey: ['admin-schedules', status, period, date, page],
    queryFn: () =>
      adminApi.getSchedules({
        status: status === 'all' ? undefined : status,
        period: period === 'all' ? undefined : period,
        date: date || undefined,
        page,
        limit: 20,
      }),
  });

  const todayQuery = useQuery({
    queryKey: ['admin-schedules-today'],
    queryFn: adminApi.getTodaySchedules,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['admin-schedules'] });
    queryClient.invalidateQueries({ queryKey: ['admin-schedules-today'] });
  }

  const statusMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: ScheduleStatus }) =>
      adminApi.updateScheduleStatus(id, value),
    onSuccess: invalidate,
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, visit_date, p }: { id: string; visit_date: string; p: SchedulePeriod }) =>
      adminApi.rescheduleSchedule(id, visit_date, p),
    onSuccess: () => {
      setRescheduleId(null);
      invalidate();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => adminApi.cancelSchedule(id),
    onSuccess: () => {
      setCancelId(null);
      invalidate();
    },
  });

  const [bringForwardFeedback, setBringForwardFeedback] = useState<string | null>(null);

  const bringForwardMutation = useMutation({
    mutationFn: (id: string) => adminApi.offerBringForward(id),
    onSuccess: () => {
      setBringForwardFeedback(
        'Oferta de antecipação enviada ao cliente. Ele tem 20 minutos para responder SIM.',
      );
      invalidate();
    },
    onError: (err: Error) => {
      setBringForwardFeedback(err?.message ?? 'Falha ao enviar a oferta de antecipação.');
    },
  });

  function openReschedule(item: ScheduleItem) {
    setRescheduleId(item.id);
    setRescheduleDate(item.visit_date < TODAY ? TODAY : item.visit_date);
    setReschedulePeriod(item.period);
  }

  const allRows = schedulesQuery.data?.data ?? [];
  const rows = allRows.filter((r) => type === 'all' || r.type === type);
  const summary = todayQuery.data?.summary;

  const actionProps = (item: ScheduleItem): ScheduleActionsProps => ({
    item,
    onReschedule: openReschedule,
    onCancel: setCancelId,
    onDone: (id) => statusMutation.mutate({ id, value: 'done' }),
    onBringForward: (id) => bringForwardMutation.mutate(id),
    bringForwardPending: bringForwardMutation.isPending,
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Agendamentos"
        icon={<Calendar className="h-5 w-5" />}
        actions={
          <>
            <Button
              variant={isToday ? 'default' : 'outline'}
              className="min-h-[44px] flex-1 sm:flex-none"
              onClick={() => {
                setDate(TODAY);
                setPage(1);
              }}
            >
              <Calendar className="h-4 w-4 mr-2" />
              Hoje
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
              className="min-h-[44px] flex-1 sm:w-auto"
            />
          </>
        }
      />

      <Card className="rounded-xl border-border/50">
        <CardContent className="p-4 space-y-4">
          <AdminFilterChips
            label="Período"
            value={period}
            onChange={(value) => {
              setPeriod(value);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'morning', label: 'Manhã' },
              { value: 'afternoon', label: 'Tarde' },
            ]}
          />
          <AdminFilterChips
            label="Tipo"
            value={type}
            onChange={(value) => setType(value as TypeFilter)}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'instalacao', label: 'Instalação' },
              { value: 'manutencao', label: 'Manutenção' },
            ]}
          />
          <AdminFilterChips
            label="Status"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'scheduled', label: 'Agendado' },
              { value: 'done', label: 'Concluído' },
              { value: 'cancelled', label: 'Cancelado' },
            ]}
          />
        </CardContent>
      </Card>

      {/* ── Resumo do dia (somente quando "Hoje" ativo) ─────────────────── */}
      {isToday && summary && (
        <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total hoje" value={summary.total} />
          <MetricCard label="Manhã" value={summary.morning} />
          <MetricCard label="Tarde" value={summary.afternoon} />
          <MetricCard label="Pendentes" value={summary.pending} />
        </div>
      )}

      {/* ── Erro ────────────────────────────────────────────────────────── */}
      {schedulesQuery.isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar agendamentos</AlertTitle>
          <AlertDescription>
            {(schedulesQuery.error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Feedback de antecipação ─────────────────────────────────────── */}
      {bringForwardFeedback && (
        <Alert variant={bringForwardMutation.isError ? 'destructive' : 'default'}>
          <AlertTitle>Antecipação</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>{bringForwardFeedback}</span>
            <Button variant="ghost" size="sm" onClick={() => setBringForwardFeedback(null)}>
              Fechar
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!schedulesQuery.isLoading && rows.length > 0 && (
        <div className="space-y-3 md:hidden">
          {rows.map((item) => (
            <ScheduleMobileCard key={item.id} item={item} actions={actionProps(item)} />
          ))}
        </div>
      )}

      {!schedulesQuery.isLoading && rows.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-10 md:hidden">
          Nenhum agendamento encontrado
        </p>
      )}

      {schedulesQuery.isLoading && (
        <div className="space-y-3 md:hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`mobile-skel-${i}`} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      <div className="hidden md:block rounded-xl border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Endereço</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedulesQuery.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={`skeleton-cell-${j}`}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!schedulesQuery.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum agendamento encontrado
                </TableCell>
              </TableRow>
            )}

            {!schedulesQuery.isLoading &&
              rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{formatDate(item.visit_date)}</TableCell>
                  <TableCell>
                    <PeriodBadge period={item.period} />
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={item.type} />
                  </TableCell>
                  <TableCell>{item.customer_name ?? formatPhone(item.phone)}</TableCell>
                  <TableCell>{formatPhone(item.phone)}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{item.address ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={item.status} />
                      {item.bring_forward_status === 'offered' && (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/15 text-amber-400 border-amber-500/30 w-fit"
                        >
                          Antecipação ofertada
                        </Badge>
                      )}
                      {item.bring_forward_status === 'accepted' && (
                        <Badge
                          variant="outline"
                          className="bg-violet-500/15 text-violet-400 border-violet-500/30 w-fit"
                        >
                          Antecipada
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <ScheduleActions {...actionProps(item)} />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Paginação ───────────────────────────────────────────────────── */}
      {schedulesQuery.data && schedulesQuery.data.total > 20 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {Math.max(1, Math.ceil(schedulesQuery.data.total / 20))}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= Math.ceil(schedulesQuery.data.total / 20)}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}

      {/* ── Dialog de reagendamento ─────────────────────────────────────── */}
      <Dialog open={rescheduleId !== null} onOpenChange={(open) => !open && setRescheduleId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reagendar visita</DialogTitle>
            <DialogDescription>Escolha a nova data e período da visita técnica.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Data</span>
              <Input
                type="date"
                min={TODAY}
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">Período</span>
              <Select
                value={reschedulePeriod}
                onValueChange={(v) => setReschedulePeriod(v as SchedulePeriod)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Manhã (8h às 12h)</SelectItem>
                  <SelectItem value="afternoon">Tarde (14h às 18h)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRescheduleId(null)}>
              Cancelar
            </Button>
            <Button
              disabled={rescheduleMutation.isPending || !rescheduleDate}
              onClick={() =>
                rescheduleId &&
                rescheduleMutation.mutate({
                  id: rescheduleId,
                  visit_date: rescheduleDate,
                  p: reschedulePeriod,
                })
              }
            >
              Confirmar reagendamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmação de cancelamento ─────────────────────────────────── */}
      <AlertDialog open={cancelId !== null} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação marca a visita como cancelada. O registro é mantido para histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelId && cancelMutation.mutate(cancelId)}
            >
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
