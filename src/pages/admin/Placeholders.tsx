import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, Phone, CreditCard, Wifi, Receipt, type LucideIcon } from 'lucide-react';
import { adminApi } from '@/api/admin';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
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
  id?: string;
  name?: string;
  document?: string;
  phone?: string;
  status?: string;
  plan?: { name?: string; downloadMbps?: number };
  address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  contratoValorAberto?: number;
  contratoTitulosAReceber?: number;
  cobVencimento?: number;
  invoice?: InvoiceResult | null;
};

const CUSTOMER_STATUS_LABEL: Record<string, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  suspended: 'Suspenso',
  cancelled: 'Cancelado',
};
const CUSTOMER_STATUS_CLASS: Record<string, string> = {
  active: 'bg-green-500/15 text-green-400 border-green-500/30',
  inactive: 'bg-muted/40 text-muted-foreground border-border',
  suspended: 'bg-destructive/15 text-destructive border-destructive/30',
  cancelled: 'bg-destructive/15 text-destructive border-destructive/30',
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

function fmt(v: string | number | undefined | null, fallback = '—'): string {
  if (v == null || v === '') return fallback;
  return String(v);
}

function fmtCpf(doc: string | undefined): string {
  if (!doc) return '—';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return doc;
}

function fmtCurrency(v: number | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function Row({ icon: Icon, label, value }: { icon: React.ReactElement<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">
        {React.cloneElement(Icon as React.ReactElement<{ className: string }>, { className: 'h-4 w-4' })}
      </span>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium text-right">{value}</span>
    </div>
  );
}

function fmtAddress(a: CustomerResult['address']): string {
  if (!a) return '—';
  const parts = [
    a.street && a.number ? `${a.street}, ${a.number}` : a.street,
    a.neighborhood,
    a.city,
  ].filter(Boolean);
  return parts.length ? parts.join(' — ') : '—';
}

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
    <div className="space-y-5">
      <AdminPageHeader
        title="Clientes"
        description="Busca pontual no SGP por telefone, CPF ou número de contrato."
        icon={<Users className="h-5 w-5" />}
      />

      <Card className="rounded-xl border-border/50">
        <CardContent className="p-4">
          <div className="flex gap-2">
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
        </CardContent>
      </Card>

      {search.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      )}

      {search.isError && (
        <Alert variant="destructive">
          <AlertTitle>Cliente não encontrado</AlertTitle>
          <AlertDescription>
            Verifique o telefone, CPF ou número do contrato e tente novamente.
          </AlertDescription>
        </Alert>
      )}

      {customer && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* ── Dados cadastrais ── */}
          <Card className="rounded-xl border-border/50 overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent mt-0.5">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{fmt(customer.name)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{fmtCpf(customer.document)}</p>
                  <Badge
                    variant="outline"
                    className={`mt-2 text-xs ${CUSTOMER_STATUS_CLASS[customer.status ?? ''] ?? 'bg-muted/40 text-muted-foreground border-border'}`}
                  >
                    {CUSTOMER_STATUS_LABEL[customer.status ?? ''] ?? customer.status ?? '—'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2 text-sm border-t border-border/40 pt-3">
                <Row icon={<CreditCard />} label="Contrato" value={fmt(customer.id)} />
                <Row icon={<Phone />} label="Telefone" value={fmt(customer.phone)} />
                <Row icon={<Wifi />} label="Plano" value={fmt(customer.plan?.name)} />
                <Row
                  icon={<Receipt />}
                  label="Vencimento"
                  value={customer.cobVencimento ? `Todo dia ${customer.cobVencimento}` : '—'}
                />
              </div>

              {customer.address && (
                <div className="text-sm border-t border-border/40 pt-3 space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Endereço</p>
                  <p className="text-foreground">{fmtAddress(customer.address)}</p>
                  {customer.address.zipCode && (
                    <p className="text-muted-foreground text-xs">CEP {customer.address.zipCode}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Situação financeira ── */}
          <Card className={`rounded-xl overflow-hidden border ${
            (customer.contratoValorAberto ?? 0) > 0
              ? 'border-destructive/40 bg-destructive/5'
              : 'border-border/50'
          }`}>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  (customer.contratoValorAberto ?? 0) > 0
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-accent/15 text-accent'
                }`}>
                  <Receipt className="h-4 w-4" />
                </div>
                <p className="font-semibold">Situação financeira</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Saldo em aberto</span>
                  <span className={`font-semibold ${(customer.contratoValorAberto ?? 0) > 0 ? 'text-destructive' : 'text-green-400'}`}>
                    {fmtCurrency(customer.contratoValorAberto)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Faturas em aberto</span>
                  <span className={`font-medium ${(customer.contratoTitulosAReceber ?? 0) > 0 ? 'text-destructive' : ''}`}>
                    {customer.contratoTitulosAReceber ?? 0}
                  </span>
                </div>
              </div>

              {customer.invoice && (
                <div className="space-y-2 text-sm border-t border-border/40 pt-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Fatura atual</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor</span>
                    <span className="font-medium">{fmtCurrency(customer.invoice.amount)}</span>
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
                      {INVOICE_STATUS_LABEL[customer.invoice.status ?? ''] ?? customer.invoice.status ?? '—'}
                    </Badge>
                  </div>
                </div>
              )}

              {!customer.invoice && (customer.contratoValorAberto ?? 0) === 0 && (
                <p className="text-sm text-green-400">Sem pendências financeiras.</p>
              )}
            </CardContent>
          </Card>
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
