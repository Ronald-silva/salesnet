import { createHash } from 'crypto';
import { getCustomersByActivationDays, getCustomerTickets } from '../../integrations/sgp';
import { sendMessage } from '../../integrations/twilio';
import { supabase } from '../../config/supabase';
import { alreadySentCampaign, logCampaignSend } from './shared';

export function generateReferralCode(customerId: string): string {
  return createHash('sha256').update(customerId).digest('base64url').slice(0, 8);
}

export async function runReferralCampaign(): Promise<void> {
  const customers = await getCustomersByActivationDays(30);

  for (const customer of customers) {
    if (await alreadySentCampaign(customer.id, 'referral', 365)) continue;

    const tickets = await getCustomerTickets(customer.id, 10);
    const hasOpenTicket = tickets.some(t => t.status === 'open' || t.status === 'in_progress');
    if (hasOpenTicket) continue;

    const code = generateReferralCode(customer.id);

    try {
      await supabase.from('referral_links').upsert(
        { customer_id: customer.id, code },
        { onConflict: 'customer_id' }
      );

      const link = `salesnet.com.br/indicar?ref=${code}`;
      await sendMessage(
        customer.phone,
        `Oi ${customer.name}! Curtindo a internet? 😊 Indique um amigo e ganhe 1 mês de desconto! Seu link: ${link}`
      );
      await logCampaignSend(customer.id, 'referral');
    } catch (err) {
      console.error(`[campaigns:referral] failed for ${customer.id}:`, err);
    }
  }
}
