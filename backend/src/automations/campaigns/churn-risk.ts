import { getAllActiveCustomers, getCustomerTickets, type Ticket } from '../../integrations/sgp';
import { sendMessage } from '../../integrations/twilio';
import { supabase } from '../../config/supabase';
import { alreadySentCampaign, logCampaignSend } from './shared';

type ChurnLevel = 'low' | 'medium' | 'high';
type ChurnReason = 'too_many_tickets' | 'recurring_overdue' | 'cancellation_ticket';

interface ChurnSignal {
  reason: ChurnReason;
  level: ChurnLevel;
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function detectTicketRisk(tickets: Ticket[]): ChurnSignal | null {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Rule c: cancellation ticket in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const hasCancellation = tickets.some(
    t => {
      const ticket = t as { type?: string; createdAt?: string };
      return typeof ticket.type === 'string' &&
        ticket.type.toLowerCase().includes('cancelamento') &&
        ticket.createdAt !== undefined &&
        new Date(ticket.createdAt) >= sevenDaysAgo;
    }
  );
  if (hasCancellation) return { reason: 'cancellation_ticket', level: 'high' };

  // Rule a: 3+ open/in_progress tickets this calendar month
  const thisMonthOpen = tickets.filter(t => {
    const ticket = t as { status?: string; createdAt?: string };
    return (ticket.status === 'open' || ticket.status === 'in_progress') &&
      ticket.createdAt !== undefined &&
      new Date(ticket.createdAt) >= monthStart;
  });
  if (thisMonthOpen.length >= 5) return { reason: 'too_many_tickets', level: 'high' };
  if (thisMonthOpen.length >= 3) return { reason: 'too_many_tickets', level: 'medium' };

  return null;
}

async function detectRecurringOverdue(customerId: string): Promise<ChurnSignal | null> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const { data } = await supabase
    .from('billing_notifications')
    .select('sent_at')
    .eq('customer_id', customerId)
    .eq('type', 'overdue_d3')
    .gte('sent_at', ninetyDaysAgo.toISOString());

  if (!data || data.length === 0) return null;

  const months = new Set(
    (data as { sent_at: string }[]).map(row => getMonthKey(new Date(row.sent_at)))
  );
  if (months.size >= 2) return { reason: 'recurring_overdue', level: 'medium' };

  return null;
}

export async function runChurnRiskCampaign(): Promise<void> {
  const customers = await getAllActiveCustomers();

  for (const customer of customers) {
    try {
      const tickets = await getCustomerTickets(customer.id, 20);
      const ticketSignal = detectTicketRisk(tickets);
      const overdueSignal = await detectRecurringOverdue(customer.id);

      const signal = ticketSignal ?? overdueSignal;
      if (!signal) continue;

      await supabase.from('churn_risks').insert({
        customer_id: customer.id,
        reason: signal.reason,
        level: signal.level,
      });

      if (signal.level === 'high') {
        const alreadySent = await alreadySentCampaign(customer.id, 'churn_risk_high', 7);
        if (!alreadySent) {
          await sendMessage(
            customer.phone,
            `Oi ${customer.name}, percebemos que você teve algumas dificuldades ultimamente. ` +
            `Posso te ajudar? Um técnico pode ir até você amanhã sem custo adicional.`
          );
          await logCampaignSend(customer.id, 'churn_risk_high');
        }
      }
    } catch (err) {
      console.error(`[campaigns:churn-risk] failed for ${customer.id}:`, err);
    }
  }
}
