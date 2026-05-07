import { TEMPLATES } from '../../integrations/twilio/templates';

describe('TEMPLATES', () => {
  const requiredKeys = [
    'BILLING_REMINDER_D3',
    'BILLING_REMINDER_D0',
    'BILLING_OVERDUE_D3',
    'BILLING_SUSPENDED_D5',
    'UPSELL_OFFER',
    'REFERRAL_REQUEST',
    'CHURN_RISK_OUTREACH',
  ] as const;

  it('exports an object with all required template keys', () => {
    requiredKeys.forEach((key) => {
      expect(TEMPLATES).toHaveProperty(key);
      expect(typeof TEMPLATES[key]).toBe('string');
      expect(TEMPLATES[key].length).toBeGreaterThan(0);
    });
  });
});
