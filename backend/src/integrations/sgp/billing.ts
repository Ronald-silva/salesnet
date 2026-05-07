import { sgpClient } from './client';
import {
  InvoiceSchema,
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
