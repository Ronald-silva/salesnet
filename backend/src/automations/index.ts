import cron from 'node-cron';
import { runBillingJobD3, runBillingJobD0, runBillingJobOverdueD3, runBillingJobSuspendD5 } from './billing-reminders';
import { startCampaigns, expansionRouter as campaignExpansionRouter } from './campaigns';
import { runBillingCadenceD5, runBillingCadenceD2 } from './billing-cadence';
import { sendVisitReminders, sendVisitFollowups } from './visit-followup';
import { processScheduledMessages } from './scheduled-messages';

export function startAutomations(): void {
  // D-3: every day at 08:00
  cron.schedule('0 8 * * *', () => {
    runBillingJobD3().catch((err) => console.error('[cron:d3]', err));
  });

  // D0: every day at 08:05
  cron.schedule('5 8 * * *', () => {
    runBillingJobD0().catch((err) => console.error('[cron:d0]', err));
  });

  // D+3 overdue: every day at 08:10
  cron.schedule('10 8 * * *', () => {
    runBillingJobOverdueD3().catch((err) => console.error('[cron:overdue_d3]', err));
  });

  // D+5 suspend: every day at 08:15
  cron.schedule('15 8 * * *', () => {
    runBillingJobSuspendD5().catch((err) => console.error('[cron:suspended_d5]', err));
  });

  // D-5 habitual late payers: 07:45
  cron.schedule('45 7 * * *', () => {
    runBillingCadenceD5().catch((err) => console.error('[cron:cadence_d5]', err));
  });

  // D-2 habitual late payers: 07:50
  cron.schedule('50 7 * * *', () => {
    runBillingCadenceD2().catch((err) => console.error('[cron:cadence_d2]', err));
  });

  // Visit reminders: every hour at :00
  cron.schedule('0 * * * *', () => {
    sendVisitReminders().catch((err) => console.error('[cron:visit-reminder]', err));
  });

  // Visit followups: every day at 18:00
  cron.schedule('0 18 * * *', () => {
    sendVisitFollowups().catch((err) => console.error('[cron:visit-followup]', err));
  });

  // Scheduled messages (NPS follow-ups, etc.): every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    processScheduledMessages().catch((err) => console.error('[cron:scheduled-messages]', err));
  });

  startCampaigns();

  console.log('[automations] billing cron jobs scheduled');
}

export { paymentWebhookRouter } from './payment-webhook';
export { campaignExpansionRouter };
