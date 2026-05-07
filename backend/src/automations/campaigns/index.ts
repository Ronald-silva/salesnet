import cron from 'node-cron';
import { runUpsellCampaign } from './upsell';
import { runReferralCampaign } from './referral';
import { runChurnRiskCampaign } from './churn-risk';

export function startCampaigns(): void {
  // Churn risk: every day at 08:30
  cron.schedule('30 8 * * *', () => {
    runChurnRiskCampaign().catch(err => console.error('[cron:churn-risk]', err));
  });

  // Referral: every day at 09:00
  cron.schedule('0 9 * * *', () => {
    runReferralCampaign().catch(err => console.error('[cron:referral]', err));
  });

  // Upsell: every Monday at 10:00
  cron.schedule('0 10 * * 1', () => {
    runUpsellCampaign().catch(err => console.error('[cron:upsell]', err));
  });

  console.log('[campaigns] campaign cron jobs scheduled');
}

export { expansionRouter } from './expansion';
