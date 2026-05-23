import { sgpClient } from './client';
import {
  InvoiceSchema,
  InvoiceListSchema,
  PixKeySchema,
  OverdueCustomerListSchema,
  DueSoonCustomerListSchema,
  SuspendReactivateResponseSchema,
  type Invoice,
  type PixKey,
  type OverdueCustomer,
  type DueSoonCustomer,
  type SuspendReactivateResponse,
} from './types';

export async function getCurrentInvoice(customerId: string): Promise<Invoice> {
  const { data } = await sgpClient.get(`/api/v1/clientes/${customerId}/faturas/atual`);
  return InvoiceSchema.parse(data);
}

export async function generatePixKey(invoiceId: string): Promise<PixKey> {
  const { data } = await sgpClient.post(`/api/v1/faturas/${invoiceId}/pix`);
  return PixKeySchema.parse(data);
}

export async function getOverdueCustomers(daysOverdue: number): Promise<OverdueCustomer[]> {
  const { data } = await sgpClient.get('/api/v1/clientes/inadimplentes', {
    params: { dias: daysOverdue },
  });
  return OverdueCustomerListSchema.parse(data);
}

export async function getCustomersDueInDays(days: number): Promise<DueSoonCustomer[]> {
  const { data } = await sgpClient.get('/api/v1/clientes/vencendo', {
    params: { dias: days },
  });
  return DueSoonCustomerListSchema.parse(data);
}

export async function suspendCustomer(customerId: string): Promise<SuspendReactivateResponse> {
  const { data } = await sgpClient.post(`/api/v1/clientes/${customerId}/suspender`);
  return SuspendReactivateResponseSchema.parse(data);
}

export async function reactivateCustomer(customerId: string): Promise<SuspendReactivateResponse> {
  const { data } = await sgpClient.post(`/api/v1/clientes/${customerId}/reativar`);
  return SuspendReactivateResponseSchema.parse(data);
}

export async function getCustomerInvoices(customerId: string): Promise<Invoice[]> {
  const { data } = await sgpClient.get(`/api/v1/clientes/${customerId}/faturas`);
  return InvoiceListSchema.parse(data);
}

export async function getHabitualLatePayerIds(
  minOverdueCount = 2,
  monthsBack = 6,
): Promise<Set<string>> {
  const { supabase } = await import('../../config/supabase');

  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const { data } = await supabase
    .from('billing_notifications')
    .select('customer_id')
    .in('type', ['overdue_d3', 'suspended_d5'])
    .gte('sent_at', since.toISOString());

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ customer_id: string }>) {
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
  }

  const ids = new Set<string>();
  for (const [id, count] of counts) {
    if (count >= minOverdueCount) ids.add(id);
  }
  return ids;
}
