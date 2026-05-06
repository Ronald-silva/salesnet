import { sgpClient } from './client';
import {
  CustomerSchema,
  CustomerPlanSchema,
  type Customer,
  type CustomerPlan,
} from './types';

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  return phone;
}

export async function getCustomerByPhone(phone: string): Promise<Customer> {
  const normalized = normalizePhone(phone);
  const { data } = await sgpClient.get('/api/v1/clientes', {
    params: { telefone: normalized },
  });
  return CustomerSchema.parse(data);
}

export async function getCustomerById(id: string): Promise<Customer> {
  const { data } = await sgpClient.get(`/api/v1/clientes/${id}`);
  return CustomerSchema.parse(data);
}

export async function getCustomerPlan(customerId: string): Promise<CustomerPlan> {
  const { data } = await sgpClient.get(`/api/v1/clientes/${customerId}/plano`);
  return CustomerPlanSchema.parse(data);
}
