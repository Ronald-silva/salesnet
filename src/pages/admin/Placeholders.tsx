import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, Phone, CreditCard, Wifi, Receipt } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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

const PERIODS = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
] as const;

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/50 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ── Clientes — busca pontual no SGP ───────────────────────────────────────────

type InvoiceResult = {
  id?: string;
  amount?: number;
  dueDate?: string;
  status?: 'open' | 'paid' | 'overdue' | 'cancelled';
};
type CustomerResult = {
  name?: string;
  status?: string;
  plan?: { name?: string };
  phone?: string;
  id?: string;
  invoice?: InvoiceResult | null;
};

const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  suspended: 'Suspenso',
};
const CUSTOMER_STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  inactive: 'bg-muted/40 text-muted-foreground border-border',
  suspended: 'bg-destructive/15 text-destructive border-destructive/30',
};
const INVOICE_STATUS_LABEL: Record<string, string> = {
  open: 'Em aberto',
  paid: 'Pago',
  overdue: 'Vencido',
  cancelled: 'Cancelado',
};
const INVOICE_STATUS_CLASS: Record<string, string> = {
  open: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  paid: 'bg-green-500/15 text-green-400 border-green-500/30',
  overdue: 'bg-destructive/15 text-destructive border-destructive/30',
  cancelled: 'bg-muted/40 text-muted-foreground border-border',
};

export function ClientesPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const search = useQuery({
    queryKey: ['admin-customer-search', submitted],
    queryFn: () => adminApi.searchCustomer(submitted),
    enabled: submitted.length > 0,
    retry: false,
  });

  const customer = search.data as CustomerResult | undefined;

  function submit() {
    const q = query.trim();
    if (q) setSubmitted(q);
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Clientes"
        description="Busca pontual no SGP por telefone, CPF ou número de contrato."
        icon={<Users className="h-5 w-5" />}
      />

      <div className="relative flex gap-2 max-w-lg">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Telefone, CPF ou nº de contrato"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        <Button onClick={submit} disabled={!query.trim()}>
          Buscar
        </Button>
      </div>

      {search.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      )}

      {search.isError && (
        <Alert variant="destructive" className="max-w-lg">
          <AlertTitle>Cliente não encontrado</AlertTitle>
          <AlertDescription>
            Verifique o telefone, CPF ou número do contrato e tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {customer && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Dados do cliente */}
          <div className="rounded-xl border border-border/50 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Users className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold truncate">{customer.name ?? '—'}</p>
                <Badge
                  variant="outline"
                  className={`mt-1 text-xs ${CUSTOMER_STATUS_CLASS[customer.status ?? ''] ?? 'bg-muted/40 text-muted-foreground border-border'}`}
                >
                  {CUSTOMER_STATUS_LABEL[customer.status ?? ''] ?? customer.status ?? '—'}
                </Badge>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CreditCard className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">Contrato</span>
                <span className="ml-auto">{customer.id ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">Telefone</span>
                <span className="ml-auto">{customer.phone ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Wifi className="h-4 w-4 shrink-0" />
                <span className="text-foreground font-medium">Plano</span>
                <span className="ml-auto">{customer.plan?.name ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Fatura */}
          <div className="rounded-xl border border-border/50 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <Receipt className="h-5 w-5" />
              </div>
              <p className="font-semibold">Fatura atual</p>
            </div>

            {customer.invoice ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-medium">
                    {customer.invoice.amount != null
                      ? customer.invoice.amount.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vencimento</span>
                  <span>
                    {customer.invoice.dueDate
                      ? new Date(customer.invoice.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Situação</span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${INVOICE_STATUS_CLASS[customer.invoice.status ?? ''] ?? ''}`}
                  >
                    {INVOICE_STATUS_LABEL[customer.invoice.status ?? ''] ??
                      customer.invoice.status ??
                      '—'}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma fatura em aberto.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Financeiro — KPIs de cobrança ─────────────────────────────────────────────

export function FinanceiroPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-finance', days],
    queryFn: () => adminApi.getFinance(days),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Financeiro</h2>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1 rounded-md text-sm border ${
                days === p.value
                  ? 'bg-accent/20 text-accent border-accent/50'
                  : 'border-border/50 hover:bg-muted/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar financeiro</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard label="Notificações de cobrança" value={data.total_notifications} />
            <MetricCard label="Negociações registradas" value={data.negociacoes} />
            <MetricCard
              label="Receita recuperada (estimada)"
              value={`R$ ${data.recovered_revenue.toLocaleString('pt-BR')}`}
            />
          </div>

          <div className="rounded-lg border border-border/50 overflow-x-auto">
            <div className="px-4 py-3 border-b border-border/50">
              <h3 className="font-semibold">Notificações por tipo</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.by_type.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                      Nenhuma notificação no período.
                    </TableCell>
                  </TableRow>
                )}
                {data.by_type.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell className="capitalize">{row.type.replace(/_/g, ' ')}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Rede — apagões por bairro ─────────────────────────────────────────────────

export function RedePage() {
  const [days, setDays] = useState<number>(7);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-outages', days],
    queryFn: () => adminApi.getOutages(days),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Rede — apagões por bairro</h2>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={`px-3 py-1 rounded-md text-sm border ${
                days === p.value
                  ? 'bg-accent/20 text-accent border-accent/50'
                  : 'border-border/50 hover:bg-muted/50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar rede</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <MetricCard label="Total de relatos no período" value={data.total} />
          <div className="rounded-lg border border-border/50 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bairro</TableHead>
                  <TableHead>Relatos</TableHead>
                  <TableHead>Último relato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.neighborhoods.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Nenhum apagão relatado no período.
                    </TableCell>
                  </TableRow>
                )}
                {data.neighborhoods.map((n) => (
                  <TableRow key={n.neighborhood}>
                    <TableCell className="font-medium">{n.neighborhood}</TableCell>
                    <TableCell>
                      <span
                        className={
                          n.count >= 2 ? 'text-destructive font-semibold' : 'text-foreground'
                        }
                      >
                        {n.count}
                      </span>
                    </TableCell>
                    <TableCell>{new Date(n.lastReportedAt).toLocaleString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
