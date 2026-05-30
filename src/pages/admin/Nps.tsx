import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/api/admin';
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

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^55/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

export default function Nps() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['admin-nps', days],
    queryFn: () => adminApi.getNps(days),
  });

  const maxCount = data
    ? Math.max(1, ...Object.values(data.distribution))
    : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">NPS</h2>
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
          <AlertTitle>Erro ao carregar NPS</AlertTitle>
          <AlertDescription>
            {(error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <MetricCard
              label="NPS médio"
              value={data.average !== null ? `${data.average} / 5` : '—'}
            />
            <MetricCard label="Total de respostas" value={data.total} />
            <MetricCard label="Detratores (1-2)" value={data.detractors.length} />
          </div>

          <div className="rounded-lg border border-border/50 p-4">
            <h3 className="font-semibold mb-3">Distribuição de notas</h3>
            <div className="space-y-2">
              {[5, 4, 3, 2, 1].map((score) => {
                const count = data.distribution[String(score)] ?? 0;
                const pct = Math.round((count / maxCount) * 100);
                const color =
                  score >= 4 ? 'bg-green-500' : score === 3 ? 'bg-yellow-500' : 'bg-destructive';
                return (
                  <div key={score} className="flex items-center gap-3">
                    <span className="w-10 text-sm text-muted-foreground">{score} ★</span>
                    <div className="flex-1 h-4 rounded bg-muted/40 overflow-hidden">
                      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-10 text-sm text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border/50 overflow-x-auto">
            <div className="px-4 py-3 border-b border-border/50">
              <h3 className="font-semibold">Clientes com score baixo (1-2)</h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.detractors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Nenhum detrator no período. 🎉
                    </TableCell>
                  </TableRow>
                )}
                {data.detractors.map((d, i) => (
                  <TableRow key={`${d.phone}-${i}`}>
                    <TableCell>{formatPhone(d.phone)}</TableCell>
                    <TableCell className="text-destructive font-medium">{d.score}/5</TableCell>
                    <TableCell>{new Date(d.created_at).toLocaleString('pt-BR')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">Período: últimos {data.period_days} dias</p>
        </>
      )}
    </div>
  );
}
