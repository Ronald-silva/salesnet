/**
 * Templates — Entry Point
 *
 * Resolve qualquer template por nome → texto interpolado.
 */

import { BILLING_TEMPLATE_DEFS, type BillingTemplateName } from './billing';
import { CAMPAIGN_TEMPLATE_DEFS, type CampaignTemplateName } from './campaigns';

const ALL_TEMPLATES = {
  ...BILLING_TEMPLATE_DEFS,
  ...CAMPAIGN_TEMPLATE_DEFS,
} as const;

export type TemplateName = BillingTemplateName | CampaignTemplateName;

export function resolveTemplate(
  name: TemplateName,
  variables: Record<string, string>,
): string {
  const tpl = ALL_TEMPLATES[name];
  if (!tpl) throw new Error(`Template "${name}" not found`);
  return tpl(variables);
}

export { BILLING_TEMPLATE_DEFS, CAMPAIGN_TEMPLATE_DEFS };
export type { BillingTemplateName, CampaignTemplateName };
