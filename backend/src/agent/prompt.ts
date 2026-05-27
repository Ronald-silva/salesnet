/**
 * Compat layer — o SYSTEM_PROMPT é gerado em runtime pela ISP Agent Skill.
 * Preferir importar de `./skill` em código novo.
 */
import { env } from '../config/env';
import { getSkillConfigSync, buildSystemPrompt, buildModeContext, normalizeSkillTenantKey } from './skill';

function resolveSkillTenantId(): string {
  return normalizeSkillTenantKey(env.DEFAULT_TENANT_ID);
}

export const SYSTEM_PROMPT = buildSystemPrompt(getSkillConfigSync('salesnet'));

export function getBillingModeContext(): string {
  return buildModeContext('billing', getSkillConfigSync(resolveSkillTenantId()));
}

export function getSupportModeContext(): string {
  return buildModeContext('support', getSkillConfigSync(resolveSkillTenantId()));
}

export function getCommercialModeContext(): string {
  return buildModeContext('commercial', getSkillConfigSync(resolveSkillTenantId()));
}

export function getProspectModeContext(): string {
  return buildModeContext('prospect', getSkillConfigSync(resolveSkillTenantId()));
}
