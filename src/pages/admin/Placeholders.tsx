import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
import { Button } from '@/components/ui/button';
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

export function ClientesPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');

  const search = useQuery({
    queryKey: ['admin-customer-search', submitted],
    queryFn: () => adminApi.searchCustomer(submitted),
    enabled: submitted.length > 0,
    retry: false,
  });

  const customer = search.data as
    | { name?: string; status?: string; plan?: { name?: string }; phone?: string; id?: string }
    | undefined;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Clientes</h2>
      <p className="text-sm text-muted-foreground">
        Busca pontual no SGP por telefone ou número de contrato.
      </p>

      <div className="flex gap-2 max-w-md">
        <Input
          placeholder="Telefone ou contrato"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSubmitted(query.trim())}
        />
        <Button onClick={() => setSubmitted(query.trim())} disabled={!query.trim()}>
          Buscar
        </Button>
      </div>

      {search.isLoading && <Skeleton className="h-40 w-full max-w-md" />}

      {search.isError && (
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Cliente não encontrado</AlertTitle>
          <AlertDescription>Verifique o telefone ou o número do contrato.</AlertDescription>
        </Alert>
      )}

      {customer && (
        <div className="rounded-lg border border-border/50 p-6 max-w-md space-y-2">
          <p className="text-lg font-semibold">{customer.name ?? '—'}</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Contrato</span>
            <span>{customer.id ?? '—'}</span>
            <span className="text-muted-foreground">Telefone</span>
            <span>{customer.phone ?? '—'}</span>
            <span className="text-muted-foreground">Plano</span>
            <span>{customer.plan?.name ?? '—'}</span>
            <span className="text-muted-foreground">Status</span>
            <span>{customer.status ?? '—'}</span>
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
