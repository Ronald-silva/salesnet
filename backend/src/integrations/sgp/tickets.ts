import { sgpClient } from './client';
import {
  TicketSchema,
  OpenTicketResponseSchema,
  ScheduleVisitResponseSchema,
  type Ticket,
  type OpenTicketResponse,
  type ScheduleVisitResponse,
} from './types';
import { z } from 'zod';

export async function openTicket(
  customerId: string,
  type: string,
  description: string,
): Promise<OpenTicketResponse> {
  const { data } = await sgpClient.post('/api/v1/chamados', {
    customerId,
    type,
    description,
  });
  return OpenTicketResponseSchema.parse(data);
}

export async function getCustomerTickets(customerId: string): Promise<Ticket[]> {
  const { data } = await sgpClient.get(`/api/v1/clientes/${customerId}/chamados`, {
    params: { limit: 5 },
  });
  return z.array(TicketSchema).parse(data);
}

export async function scheduleVisit(
  customerId: string,
  date: string,
  period: 'morning' | 'afternoon',
): Promise<ScheduleVisitResponse> {
  const { data } = await sgpClient.post('/api/v1/visitas', {
    customerId,
    date,
    period,
  });
  return ScheduleVisitResponseSchema.parse(data);
}
