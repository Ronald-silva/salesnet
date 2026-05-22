/**
 * Provider Registry
 *
 * Factory e registry de providers WhatsApp.
 * Resolve o provider correto por tenant ou usa o padrão global.
 */

import type { WhatsAppProvider } from './whatsapp-provider';

export class ProviderRegistry {
  private providers = new Map<string, WhatsAppProvider>();
  /** tenantId → providerName */
  private tenantMapping = new Map<string, string>();
  private defaultProviderName: string | null = null;

  /** Registra um provider */
  register(provider: WhatsAppProvider, isDefault = false): this {
    this.providers.set(provider.name, provider);
    if (isDefault || !this.defaultProviderName) {
      this.defaultProviderName = provider.name;
    }
    return this;
  }

  /** Define o provider padrão para um tenant específico */
  setTenantProvider(tenantId: string, providerName: string): this {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider "${providerName}" not registered`);
    }
    this.tenantMapping.set(tenantId, providerName);
    return this;
  }

  /** Obtém provider por nome */
  get(name: string): WhatsAppProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Provider "${name}" not registered`);
    return provider;
  }

  /** Obtém provider para um tenant (ou o padrão se não configurado) */
  getForTenant(tenantId: string): WhatsAppProvider {
    const providerName = this.tenantMapping.get(tenantId) ?? this.defaultProviderName;
    if (!providerName) {
      throw new Error('No default provider registered');
    }
    return this.get(providerName);
  }

  /** Obtém o provider padrão */
  getDefault(): WhatsAppProvider {
    if (!this.defaultProviderName) {
      throw new Error('No default provider registered');
    }
    return this.get(this.defaultProviderName);
  }

  /** Lista todos os providers registrados */
  list(): string[] {
    return [...this.providers.keys()];
  }
}

/** Singleton global */
export const providerRegistry = new ProviderRegistry();
