/**
 * Instance Manager
 *
 * Gerenciamento centralizado de instâncias WhatsApp.
 * Responsável por: CRUD, health check, reconexão automática e resolução por tenant.
 */

import { supabase } from '../config/supabase';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';
import type { InstanceConfig, InstanceInfo, InstanceStatus } from '../integrations/whatsapp/whatsapp-provider';

export interface StoredInstance {
  id: string;
  tenantId: string;
  instanceName: string;
  provider: string;
  phoneNumber?: string;
  status: 'connected' | 'disconnected' | 'connecting';
  webhookUrl?: string;
  lastConnectedAt?: string;
  createdAt: string;
}

interface InstanceRow {
  id: string;
  tenant_id: string;
  instance_name: string;
  provider: string;
  phone_number?: string;
  status: string;
  webhook_url?: string;
  last_connected_at?: string;
  created_at: string;
}

function rowToInstance(row: InstanceRow): StoredInstance {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    instanceName: row.instance_name,
    provider: row.provider,
    phoneNumber: row.phone_number,
    status: row.status as StoredInstance['status'],
    webhookUrl: row.webhook_url,
    lastConnectedAt: row.last_connected_at,
    createdAt: row.created_at,
  };
}

class InstanceManager {
  // ─── CRUD ────────────────────────────────────────────────────────────────

  /** Provisiona uma nova instância no provider e salva no banco */
  async provisionInstance(tenantId: string, config: InstanceConfig): Promise<StoredInstance> {
    const provider = providerRegistry.getForTenant(tenantId);
    const info = await provider.createInstance(config);

    const { data, error } = await supabase
      .from('whatsapp_instances')
      .insert({
        tenant_id: tenantId,
        instance_name: config.instanceName,
        provider: provider.name,
        status: 'disconnected',
        webhook_url: config.webhookUrl,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to save instance: ${error.message}`);
    return rowToInstance(data as InstanceRow);
  }

  /** Remove instância do provider e do banco */
  async removeInstance(instanceId: string): Promise<void> {
    const instance = await this.findById(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    const provider = providerRegistry.get(instance.provider);
    await provider.deleteInstance(instance.instanceName);

    await supabase.from('whatsapp_instances').delete().eq('id', instanceId);
  }

  /** Conecta uma instância e retorna QR Code */
  async connectInstance(instanceId: string): Promise<InstanceInfo> {
    const instance = await this.findById(instanceId);
    if (!instance) throw new Error(`Instance ${instanceId} not found`);

    const provider = providerRegistry.get(instance.provider);
    const result = await provider.connectInstance(instance.instanceName);

    await supabase
      .from('whatsapp_instances')
      .update({ status: 'connecting' })
      .eq('id', instanceId);

    return {
      instanceName: instance.instanceName,
      status: { connected: false, state: 'connecting' },
      qrCode: result.qrCode,
      pairingCode: result.pairingCode,
    };
  }

  // ─── Lookup ───────────────────────────────────────────────────────────────

  async findById(id: string): Promise<StoredInstance | null> {
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data ? rowToInstance(data as InstanceRow) : null;
  }

  async findByName(instanceName: string): Promise<StoredInstance | null> {
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('instance_name', instanceName)
      .maybeSingle();
    return data ? rowToInstance(data as InstanceRow) : null;
  }

  async listByTenant(tenantId: string): Promise<StoredInstance[]> {
    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at');
    if (error) throw new Error(error.message);
    return (data as InstanceRow[]).map(rowToInstance);
  }

  /**
   * Resolve a instância ativa de um tenant para envio.
   * Em single-tenant, resolve o tenant 'default'.
   */
  async resolveInstance(tenantId: string): Promise<StoredInstance> {
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'connected')
      .order('last_connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) {
      throw new Error(`No connected WhatsApp instance for tenant ${tenantId}`);
    }
    return rowToInstance(data as InstanceRow);
  }

  // ─── Health & Reconnect ───────────────────────────────────────────────────

  /** Checa status real no provider e atualiza banco */
  async syncStatus(instanceName: string): Promise<InstanceStatus> {
    const instance = await this.findByName(instanceName);
    if (!instance) throw new Error(`Instance ${instanceName} not found`);

    const provider = providerRegistry.get(instance.provider);
    const status = await provider.getInstanceStatus(instanceName);

    const newStatus = status.connected ? 'connected' : 'disconnected';
    await supabase
      .from('whatsapp_instances')
      .update({
        status: newStatus,
        phone_number: status.phoneNumber,
        last_connected_at: status.connected ? new Date().toISOString() : undefined,
      })
      .eq('instance_name', instanceName);

    return status;
  }

  /** Roda health check em todas as instâncias e reconecta as desconectadas */
  async healthCheckAll(): Promise<void> {
    const { data } = await supabase.from('whatsapp_instances').select('*');
    if (!data) return;

    for (const row of data as InstanceRow[]) {
      try {
        const status = await this.syncStatus(row.instance_name);
        if (!status.connected) {
          console.warn(`[instance-manager] Instance ${row.instance_name} disconnected — attempting reconnect`);
          const provider = providerRegistry.get(row.provider);
          await provider.connectInstance(row.instance_name).catch((err: unknown) => {
            console.error(`[instance-manager] Reconnect failed for ${row.instance_name}:`, err);
          });
        }
      } catch (err) {
        console.error(`[instance-manager] Health check error for ${row.instance_name}:`, err);
      }
    }
  }

  /** Atualiza status de uma instância a partir de um webhook de conexão */
  async handleConnectionEvent(instanceName: string, state: InstanceStatus['state']): Promise<void> {
    const newStatus =
      state === 'open' ? 'connected' :
      state === 'connecting' ? 'connecting' : 'disconnected';

    await supabase
      .from('whatsapp_instances')
      .update({
        status: newStatus,
        last_connected_at: state === 'open' ? new Date().toISOString() : undefined,
      })
      .eq('instance_name', instanceName);
  }
}

export const instanceManager = new InstanceManager();
