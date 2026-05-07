import { getCustomersByPlan, getCustomerTickets } from '../../integrations/sgp';
import { sendMessage } from '../../integrations/twilio';
import { alreadySentCampaign, logCampaignSend } from './shared';

const NEXT_PLAN: Record<number, { mbps: number; priceDiff: number }> = {
  20: { mbps: 30, priceDiff: 10 },
  30: { mbps: 50, priceDiff: 10 },
};

export async function runUpsellCampaign(): Promise<void> {
  const [customers20, customers30] = await Promise.all([
    getCustomersByPlan(20),
    getCustomersByPlan(30),
  ]);

  const candidates = [...customers20, ...customers30].filter(c => c.status === 'active');

  for (const customer of candidates) {
    if (!customer.activatedAt || !customer.plan) continue;

    const daysSince = Math.floor(
      (Date.now() - new Date(customer.activatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince < 60) continue;

    if (await alreadySentCampaign(customer.id, 'upsell', 30)) continue;

    const tickets = await getCustomerTickets(customer.id, 10);
    const hasOpenTicket = tickets.some(t => t.status === 'open' || t.status === 'in_progress');
    if (hasOpenTicket) continue;

    const planMbps = customer.plan.downloadMbps;
    const next = NEXT_PLAN[planMbps];
    if (!next) continue;

    const monthsSince = Math.floor(daysSince / 30);
    const message =
      `Oi ${customer.name}! 🚀 Você usa ${planMbps}Mbps há ${monthsSince} meses sem problemas. ` +
      `Por R$${next.priceDiff}/mês a mais você vai para ${next.mbps}Mbps. Quer testar 7 dias grátis? Responda SIM.`;

    try {
      await sendMessage(customer.phone, message);
      await logCampaignSend(customer.id, 'upsell');
    } catch (err) {
      console.error(`[campaigns:upsell] failed for ${customer.id}:`, err);
    }
  }
}
