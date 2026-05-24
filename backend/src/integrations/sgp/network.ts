import { getCustomerById } from './customers';
import { ConnectionStatusSchema, type ConnectionStatus } from './types';

/**
 * Connection status derived from contract status.
 * SGP does not expose a direct RADIUS online-check via the token API.
 * contratoStatus 1=Ativo (online assumed), otherwise offline.
 */
export async function getConnectionStatus(contratoId: string): Promise<ConnectionStatus> {
  try {
    const customer = await getCustomerById(contratoId);
    const online = customer.status === 'active';
    return ConnectionStatusSchema.parse({
      customerId: contratoId,
      online,
      status: customer.status,
    });
  } catch {
    return ConnectionStatusSchema.parse({ customerId: contratoId, online: false, status: 'unknown' });
  }
}

/** Not available — returns empty array. */
export async function getNetworkNodeStatus(): Promise<[]> {
  return [];
}
