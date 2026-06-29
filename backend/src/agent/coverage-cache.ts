import { supabase } from '../config/supabase';
import { COVERED_NEIGHBORHOODS as FALLBACK } from './company-data';

interface CacheEntry {
  list: string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Returns the list of covered neighborhoods for the tenant.
 * Checks tenants.settings.coveredNeighborhoods first (Supabase), falls back
 * to the hardcoded COVERED_NEIGHBORHOODS array. Cache TTL: 1 hour.
 * Admin can update without deploy: UPDATE tenants SET settings = jsonb_set(settings, '{coveredNeighborhoods}', '["Bairro A","Bairro B"]')
 */
export async function getCoveredNeighborhoods(tenantId: string): Promise<string[]> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() < hit.expiresAt) return hit.list;

  try {
    const { data } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();
    const settings = data?.settings as Record<string, unknown> | null;
    const custom = settings?.coveredNeighborhoods;
    const list = Array.isArray(custom) && custom.length > 0 ? (custom as string[]) : FALLBACK;
    cache.set(tenantId, { list, expiresAt: Date.now() + TTL_MS });
    return list;
  } catch {
    return FALLBACK;
  }
}
