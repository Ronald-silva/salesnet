import cron from 'node-cron';
import { runBillingJobD3, runBillingJobD0, runBillingJobOverdueD3, runBillingJobSuspendD5 } from './billing-reminders';
import { startCampaigns, expansionRouter as campaignExpansionRouter } from './campaigns';
import { runBillingCadenceD5, runBillingCadenceD2 } from './billing-cadence';
import { sendVisitReminders, sendVisitFollowups } from './visit-followup';
import { processScheduledMessages } from './scheduled-messages';
import { runDataCleanup } from './data-cleanup';
import { runPatternDetection } from './pattern-detector';

export function startAutomations(): void {
  // node-cron roda em UTC (Railway não define TZ no processo — confirmado
  // em auditoria; ver CLAUDE.md, seção Automações). As 6 expressões abaixo
  // já vêm deslocadas +3h para disparar no horário Fortaleza (UTC-3, fixo,
  // sem horário de verão desde 2019) documentado no comentário — antes deste
  // fix os comentários diziam "08:00" mas a expressão cron rodava 08:00 UTC
  // = 05:00 Fortaleza. O dedupe diário em billing-day-window.ts também foi
  // corrigido para usar o dia civil de Fortaleza, não meia-noite UTC — sem
  // isso, mesmo com o horário de disparo certo, uma notificação enviada
  // tarde da noite Fortaleza podia "vazar" pra janela de dedupe do dia
  // civil seguinte (ou vice-versa) e falsos-negativos/positivos de "já
  // enviei hoje" apareceriam perto da virada do dia.

  // D-3: 08:00 Fortaleza = 11:00 UTC
  cron.schedule('0 11 * * *', () => {
    runBillingJobD3().catch((err) => console.error('[cron:d3]', err));
  });

  // D0: 08:05 Fortaleza = 11:05 UTC
  cron.schedule('5 11 * * *', () => {
    runBillingJobD0().catch((err) => console.error('[cron:d0]', err));
  });

  // D+3 overdue: 08:10 Fortaleza = 11:10 UTC
  cron.schedule('10 11 * * *', () => {
    runBillingJobOverdueD3().catch((err) => console.error('[cron:overdue_d3]', err));
  });

  // D+5 suspend: 08:15 Fortaleza = 11:15 UTC
  cron.schedule('15 11 * * *', () => {
    runBillingJobSuspendD5().catch((err) => console.error('[cron:suspended_d5]', err));
  });

  // D-5 habitual late payers: 07:45 Fortaleza = 10:45 UTC
  cron.schedule('45 10 * * *', () => {
    runBillingCadenceD5().catch((err) => console.error('[cron:cadence_d5]', err));
  });

  // D-2 habitual late payers: 07:50 Fortaleza = 10:50 UTC
  cron.schedule('50 10 * * *', () => {
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

  // LGPD retention purge: 03:00 Fortaleza (UTC-3) = 06:00 UTC
  cron.schedule('0 6 * * *', () => {
    runDataCleanup().catch((err) => console.error('[cron:data-cleanup]', err));
  });

  // Pattern detection (operational alerts): every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    runPatternDetection().catch((err) => console.error('[cron:pattern-detector]', err));
  });

  startCampaigns();

  console.log('[automations] billing cron jobs scheduled');
}

export { paymentWebhookRouter } from './payment-webhook';
export { campaignExpansionRouter };
