import { sgpClient } from './client';
import {
  ConnectionStatusSchema,
  NetworkNodeListSchema,
  type ConnectionStatus,
  type NetworkNode,
} from './types';

export async function getConnectionStatus(customerId: string): Promise<ConnectionStatus> {
  const { data } = await sgpClient.get(`/api/v1/clientes/${customerId}/conexao`);
  return ConnectionStatusSchema.parse(data);
}

export async function getNetworkNodeStatus(): Promise<NetworkNode[]> {
  const { data } = await sgpClient.get('/api/v1/rede/nos');
  return NetworkNodeListSchema.parse(data);
}
