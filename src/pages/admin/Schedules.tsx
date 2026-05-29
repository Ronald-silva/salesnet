import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, MoreHorizontal, Check, CalendarClock, X } from 'lucide-react';
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
    <div className="rounded-lg border border-border/50 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
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

  function openReschedule(item: ScheduleItem) {
    setRescheduleId(item.id);
    setRescheduleDate(item.visit_date < TODAY ? TODAY : item.visit_date);
    setReschedulePeriod(item.period);
  }

  const allRows = schedulesQuery.data?.data ?? [];
  const rows = allRows.filter((r) => type === 'all' || r.type === type);
  const summary = todayQuery.data?.summary;

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h2 className="text-2xl font-bold">Agendamentos</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isToday ? 'default' : 'outline'}
            size="sm"
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
            className="w-auto"
          />
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Período</span>
          <div className="flex gap-2">
            {(['all', 'morning', 'afternoon'] as PeriodFilter[]).map((value) => (
              <Button
                key={value}
                variant={period === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setPeriod(value);
                  setPage(1);
                }}
              >
                {value === 'all' ? 'Todos' : value === 'morning' ? 'Manhã' : 'Tarde'}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Tipo</span>
          <div className="flex gap-2">
            {(['all', 'instalacao', 'manutencao'] as TypeFilter[]).map((value) => (
              <Button
                key={value}
                variant={type === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setType(value)}
              >
                {value === 'all' ? 'Todos' : value === 'instalacao' ? 'Instalação' : 'Manutenção'}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Status</span>
          <div className="flex gap-2">
            {(['all', 'scheduled', 'done', 'cancelled'] as StatusFilter[]).map((value) => (
              <Button
                key={value}
                variant={status === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                {value === 'all'
                  ? 'Todos'
                  : value === 'scheduled'
                  ? 'Agendado'
                  : value === 'done'
                  ? 'Concluído'
                  : 'Cancelado'}
              </Button>
            ))}
          </div>
        </div>
      </div>

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

      {/* ── Tabela ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border/50">
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
                    <StatusBadge status={item.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {item.status === 'scheduled' && (
                          <DropdownMenuItem
                            onClick={() => statusMutation.mutate({ id: item.id, value: 'done' })}
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Marcar como Concluído
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => openReschedule(item)}>
                          <CalendarClock className="h-4 w-4 mr-2" />
                          Reagendar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setCancelId(item.id)}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancelar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
