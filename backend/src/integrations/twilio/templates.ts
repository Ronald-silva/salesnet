export const TEMPLATES = {
  BILLING_REMINDER_D3:  'HXplaceholder_billing_reminder_d3',
  BILLING_REMINDER_D0:  'HXplaceholder_billing_reminder_d0',
  BILLING_OVERDUE_D3:   'HXplaceholder_billing_overdue_d3',
  BILLING_SUSPENDED_D5: 'HXplaceholder_billing_suspended_d5',
  UPSELL_OFFER:         'HXplaceholder_upsell_offer',
  REFERRAL_REQUEST:     'HXplaceholder_referral_request',
  CHURN_RISK_OUTREACH:  'HXplaceholder_churn_risk_outreach',
} as const;

export type TemplateName = keyof typeof TEMPLATES;
