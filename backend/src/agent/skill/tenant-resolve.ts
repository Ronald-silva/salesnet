import { env } from '../../config/env';

/** Chave usada no registry em memória (config-loader). */
export function normalizeSkillTenantKey(rawTenantId: string): string {
  const aliases: Record<string, string> = {
    default: 'salesnet',
    'salesnet-default': 'salesnet',
    'test-tenant': 'salesnet',
  };
  return aliases[rawTenantId] ?? rawTenantId;
}

/** IDs candidatos para buscar overrides em tenants.settings no Supabase. */
export function tenantSettingsLookupIds(rawTenantId: string): string[] {
  const ids = new Set<string>([
    rawTenantId,
    env.DEFAULT_TENANT_ID,
    'salesnet-default',
    'default',
  ]);
  return [...ids];
}
