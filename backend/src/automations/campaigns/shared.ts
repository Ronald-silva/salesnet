import { supabase } from '../../config/supabase';

export type CampaignType = 'upsell' | 'referral' | 'churn_risk_high';

export async function alreadySentCampaign(
  customerId: string,
  type: CampaignType,
  withinDays: number
): Promise<boolean> {
  const since = new Date();
  since.setDate(since.getDate() - withinDays);

  const { data } = await supabase
    .from('campaign_sends')
    .select('id')
    .eq('customer_id', customerId)
    .eq('type', type)
    .gte('sent_at', since.toISOString())
    .single();

  return data !== null;
}

export async function logCampaignSend(customerId: string, type: CampaignType): Promise<void> {
  const { error } = await supabase
    .from('campaign_sends')
    .insert({ customer_id: customerId, type });
  if (error) {
    console.error(`[campaigns] failed to log send for ${customerId} type=${type}:`, error);
  }
}
