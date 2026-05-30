import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type LeadItem } from '@/api/admin';
import { Button } from '@/components/ui/button';
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
import { MoreHorizontal } from 'lucide-react';

type StatusFilter = 'all' | LeadItem['status'];

const STATUS_LABEL: Record<LeadItem['status'], string> = {
  new: 'Novo',
  contacted: 'Contatado',
  converted: 'Convertido',
  lost: 'Perdido',
};

const STATUS_CLASS: Record<LeadItem['status'], string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  contacted: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  converted: 'bg-green-500/15 text-green-400 border-green-500/30',
  lost: 'bg-destructive/15 text-destructive border-destructive/30',
};

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^55/, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

export default function Leads() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');

  const leads = useQuery({
    queryKey: ['admin-leads', status],
    queryFn: () => adminApi.getLeads(status),
    refetchInterval: 30000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, value }: { id: string; value: LeadItem['status'] }) =>
      adminApi.updateLead(id, { status: value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-leads'] }),
  });

  const rows = leads.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Leads / Prospects</h2>

      <div className="flex flex-wrap gap-2">
        {(['all', 'new', 'contacted', 'converted', 'lost'] as StatusFilter[]).map((value) => (
          <Button
            key={value}
            variant={status === value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatus(value)}
          >
            {value === 'all' ? 'Todos' : STATUS_LABEL[value]}
          </Button>
        ))}
      </div>

      {leads.isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar leads</AlertTitle>
          <AlertDescription>
            {(leads.error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Bairro</TableHead>
              <TableHead>Plano de interesse</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`lead-skeleton-${i}`}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={`lead-cell-${j}`}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!leads.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhum lead encontrado.
                </TableCell>
              </TableRow>
            )}

            {!leads.isLoading &&
              rows.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.name ?? '—'}</TableCell>
                  <TableCell>{formatPhone(lead.phone)}</TableCell>
                  <TableCell>{lead.neighborhood ?? '—'}</TableCell>
                  <TableCell>{lead.desired_plan ?? '—'}</TableCell>
                  <TableCell>{new Date(lead.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CLASS[lead.status]}>
                      {STATUS_LABEL[lead.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(['new', 'contacted', 'converted', 'lost'] as LeadItem['status'][])
                          .filter((s) => s !== lead.status)
                          .map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => updateStatus.mutate({ id: lead.id, value: s })}
                            >
                              Marcar como {STATUS_LABEL[s]}
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
