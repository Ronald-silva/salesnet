import type { ISPSkillConfig } from './types';

export function mergeSkillConfig(
  base: ISPSkillConfig,
  partial: Partial<ISPSkillConfig>,
): ISPSkillConfig {
  return {
    ...base,
    ...partial,
    tenantId: base.tenantId,
    business: { ...base.business, ...partial.business },
    plans: partial.plans ?? base.plans,
    coveredNeighborhoods: partial.coveredNeighborhoods ?? base.coveredNeighborhoods,
    erpCapabilities: { ...base.erpCapabilities, ...partial.erpCapabilities },
    toneOverride: partial.toneOverride ?? base.toneOverride,
    extraFaqs: partial.extraFaqs ?? base.extraFaqs,
  };
}
