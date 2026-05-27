import { PLANS, COVERED_NEIGHBORHOODS, BUSINESS_INFO } from '../company-data';
import { supabase } from '../../config/supabase';
import { mergeSkillConfig } from './merge-config';
import { normalizeSkillTenantKey, tenantSettingsLookupIds } from './tenant-resolve';
import type { ISPSkillConfig } from './types';

export const salesnetConfig: ISPSkillConfig = {
  tenantId: 'salesnet',
  business: {
    providerName: 'SalesNet Telecom',
    agentName: 'Sofia',
    agentGender: 'f',
    city: BUSINESS_INFO.city,
    whatsappSupportHours: BUSINESS_INFO.supportHours,
    humanSupportHours: 'segunda a sexta, 8h às 18h',
    installationFeeReais: BUSINESS_INFO.installationFee,
    installationDaysMax: BUSINESS_INFO.installationDaysMax,
    loyaltyMonths: BUSINESS_INFO.loyaltyMonths,
    tvAddonMonthly: BUSINESS_INFO.tvAddonMonthly,
    earlyPaymentDiscountPct: BUSINESS_INFO.earlyPaymentDiscount,
    paymentMethods: [...BUSINESS_INFO.paymentMethods],
    hiringPageUrl: undefined,
  },
  plans: PLANS.map((p) => ({
    name: p.name,
    downloadMbps: p.downloadMbps,
    uploadMbps: p.uploadMbps,
    priceMonthly: p.priceMonthly,
    popular: p.popular,
  })),
  coveredNeighborhoods: [...COVERED_NEIGHBORHOODS],
  erpCapabilities: {
    canSuspend: false,
    canReactivate: false,
    canUpgrade: false,
    canListTickets: false,
    hasBulkCustomerQuery: false,
  },
};

const configRegistry = new Map<string, ISPSkillConfig>([
  ['salesnet', salesnetConfig],
  ['default', salesnetConfig],
  ['salesnet-default', salesnetConfig],
  ['test-tenant', salesnetConfig],
]);

const CACHE_TTL_MS = 60_000;
const configCache = new Map<string, { config: ISPSkillConfig; loadedAt: number }>();

function builtinConfig(tenantId: string): ISPSkillConfig {
  const key = normalizeSkillTenantKey(tenantId);
  const base = configRegistry.get(key) ?? configRegistry.get(tenantId) ?? salesnetConfig;
  return { ...base, tenantId: key };
}

function parseSkillOverride(settings: unknown): Partial<ISPSkillConfig> | null {
  if (!settings || typeof settings !== 'object') return null;
  const skill = (settings as { skill?: unknown }).skill;
  if (!skill || typeof skill !== 'object') return null;
  return skill as Partial<ISPSkillConfig>;
}

async function fetchTenantSkillOverride(
  rawTenantId: string,
): Promise<Partial<ISPSkillConfig> | null> {
  for (const id of tenantSettingsLookupIds(rawTenantId)) {
    const { data, error } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.warn(`[skill] tenants.settings lookup failed id=${id}:`, error.message);
      continue;
    }

    const partial = parseSkillOverride(data?.settings);
    if (partial) return partial;
  }
  return null;
}

/** Registry em memória — sem I/O (prompt.ts em import time). */
export function getSkillConfigSync(tenantId: string): ISPSkillConfig {
  return builtinConfig(tenantId);
}

/** Config com merge de tenants.settings.skill no Supabase (cache 60s). */
export async function getSkillConfig(tenantId: string): Promise<ISPSkillConfig> {
  const cacheKey = normalizeSkillTenantKey(tenantId);
  const cached = configCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const base = builtinConfig(tenantId);
  let merged = base;

  try {
    const partial = await fetchTenantSkillOverride(tenantId);
    if (partial) {
      merged = mergeSkillConfig(base, partial);
    }
  } catch (err) {
    console.warn('[skill] getSkillConfig db merge failed:', err);
  }

  configCache.set(cacheKey, { config: merged, loadedAt: Date.now() });
  return merged;
}

export function registerSkillConfig(tenantId: string, config: ISPSkillConfig): void {
  configRegistry.set(tenantId, config);
  configCache.delete(normalizeSkillTenantKey(tenantId));
}
