import { sgpClient, systemParams } from './client';
import { OpenTicketResponseSchema, type OpenTicketResponse, type Ticket } from './types';

export async function openTicket(
  contratoId: string,
  _type: string,
  _description: string,
): Promise<OpenTicketResponse> {
  const body = systemParams({ contrato: contratoId });
  const { data } = await sgpClient.post('/api/central/chamado/', body.toString());
  return OpenTicketResponseSchema.parse(data);
}

export async function getCustomerTickets(_contratoId: string, _limit = 5): Promise<Ticket[]> {
  return [];
}

/** Visit scheduling not available via Central API with token auth — stubs a response. */
export async function scheduleVisit(
  contratoId: string,
  date: string,
  period: 'morning' | 'afternoon',
): Promise<{ visitId: string; customerId: string; scheduledDate: string; period: string; status: string }> {
  return {
    visitId:       `visit-${Date.now()}`,
    customerId:    contratoId,
    scheduledDate: date,
    period,
    status:        'scheduled',
  };
}
