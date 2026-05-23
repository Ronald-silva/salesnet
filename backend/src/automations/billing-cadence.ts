import { supabase } from '../config/supabase';
import { getCustomersDueInDays, getCurrentInvoice, generatePixKey } from '../integrations/sgp';
import { getHabitualLatePayerIds } from '../integrations/sgp/billing';
import { whatsappService } from '../services/whatsapp-service';
import { env } from '../config/env';

async function alreadySentCadence(customerId: string, type: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('billing_notifications')
    .select('id')
    .eq('customer_id', customerId)
    .eq('type', type)
    .gte('sent_at', todayStart.toISOString())
    .single();

  return data !== null;
}

async function logCadenceNotification(customerId: string, phone: string, type: string): Promise<void> {
  await supabase.from('billing_notifications').insert({
    customer_id: customerId,
    phone,
    type,
    status: 'sent',
  });
}

export async function runBillingCadenceD5(): Promise<void> {
  const [habituals, customers] = await Promise.all([
    getHabitualLatePayerIds(),
    getCustomersDueInDays(5),
  ]);

  for (const customer of customers) {
    if (!habituals.has(customer.customerId)) continue;
    if (await alreadySentCadence(customer.customerId, 'd5_habitual')) continue;

    try {
      const invoice = await getCurrentInvoice(customer.customerId);
      const pix = await generatePixKey(invoice.id);

      const firstName = customer.name.split(' ')[0];
      const msg =
        `Oi ${firstName}! Sua fatura de R$${customer.amount.toFixed(2)} vence em 5 dias (${customer.dueDate}). ` +
        `Pague com PIX:\n${pix.pixKey}`;

      await whatsappService.sendText(env.DEFAULT_TENANT_ID, customer.phone, msg);
      await logCadenceNotification(customer.customerId, customer.phone, 'd5_habitual');
    } catch (err) {
      console.error(`[billing-cadence:d5] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingCadenceD2(): Promise<void> {
  const [habituals, customers] = await Promise.all([
    getHabitualLatePayerIds(),
    getCustomersDueInDays(2),
  ]);

  for (const customer of customers) {
    if (!habituals.has(customer.customerId)) continue;
    if (await alreadySentCadence(customer.customerId, 'd2_habitual')) continue;

    try {
      const invoice = await getCurrentInvoice(customer.customerId);
      const pix = await generatePixKey(invoice.id);

      const firstName = customer.name.split(' ')[0];
      const msg =
        `⚠️ ${firstName}, faltam 2 dias para sua fatura vencer e a internet ser suspensa. ` +
        `Pague agora via PIX:\n${pix.pixKey}`;

      await whatsappService.sendText(env.DEFAULT_TENANT_ID, customer.phone, msg);
      await logCadenceNotification(customer.customerId, customer.phone, 'd2_habitual');
    } catch (err) {
      console.error(`[billing-cadence:d2] failed for ${customer.customerId}:`, err);
    }
  }
}
