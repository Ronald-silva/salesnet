import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi, type TicketItem } from '@/api/admin';
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

type StatusFilter = 'all' | TicketItem['status'];

const STATUS_LABEL: Record<TicketItem['status'], string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  resolvido: 'Resolvido',
};

const STATUS_CLASS: Record<TicketItem['status'], string> = {
  aberto: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  em_andamento: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  resolvido: 'bg-green-500/15 text-green-400 border-green-500/30',
};

export default function Tickets() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');

  const tickets = useQuery({
    queryKey: ['admin-tickets', status],
    queryFn: () => adminApi.getTickets(status),
    refetchInterval: 30000,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, value }: { id: string; value: TicketItem['status'] }) =>
      adminApi.updateTicket(id, value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-tickets'] }),
  });

  const rows = tickets.data ?? [];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Chamados</h2>

      <div className="flex flex-wrap gap-2">
        {(['all', 'aberto', 'em_andamento', 'resolvido'] as StatusFilter[]).map((value) => (
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

      {tickets.isError && (
        <Alert variant="destructive">
          <AlertTitle>Erro ao carregar chamados</AlertTitle>
          <AlertDescription>
            {(tickets.error as Error)?.message ?? 'Tente novamente em instantes.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocolo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`ticket-skeleton-${i}`}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={`ticket-cell-${j}`}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!tickets.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhum chamado encontrado.
                </TableCell>
              </TableRow>
            )}

            {!tickets.isLoading &&
              rows.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-mono text-xs">
                    {ticket.sgp_chamado_id ?? ticket.id.slice(0, 8)}
                  </TableCell>
                  <TableCell className="capitalize">{ticket.tipo}</TableCell>
                  <TableCell className="max-w-[260px] truncate">{ticket.descricao}</TableCell>
                  <TableCell>{ticket.customer_name ?? '—'}</TableCell>
                  <TableCell>{ticket.contrato}</TableCell>
                  <TableCell>{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_CLASS[ticket.status]}>
                      {STATUS_LABEL[ticket.status]}
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
                        {(['aberto', 'em_andamento', 'resolvido'] as TicketItem['status'][])
                          .filter((s) => s !== ticket.status)
                          .map((s) => (
                            <DropdownMenuItem
                              key={s}
                              onClick={() => updateStatus.mutate({ id: ticket.id, value: s })}
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
