import { supabase } from '../config/supabase';
import { getHabitualLatePayerIds } from '../integrations/sgp/billing';
import {
  resolveDueSoonCustomers,
  isCpfSendAllowed,
  logSkippedOutsideAllowlist,
} from './billing-allowlist';
import { whatsappService } from '../services/whatsapp-service';
import { env } from '../config/env';
import { titleCaseName } from '../lib/format';
import { pixLine } from '../templates/billing';

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
    resolveDueSoonCustomers(5),
  ]);

  for (const customer of customers) {
    if (!habituals.has(customer.customerId)) continue;
    if (await alreadySentCadence(customer.customerId, 'd5_habitual')) continue;
    if (!isCpfSendAllowed(customer.document)) {
      logSkippedOutsideAllowlist(customer.customerId, customer.phone, 'd5_habitual');
      continue;
    }

    try {
      const fullName = titleCaseName(customer.name);
      const msg =
        `Olá, ${fullName}! 👋\n\nSua fatura de R$ ${customer.amount.toFixed(2)} vence em 5 dias (${customer.dueDate}).\n\n` +
        pixLine(customer.pixCode ?? '', '💳 Pague via PIX (copia e cola):') +
        `Qualquer dúvida, é só falar! 😊`;

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
    resolveDueSoonCustomers(2),
  ]);

  for (const customer of customers) {
    const isHabitualLatePayer = habituals.has(customer.customerId);
    const notificationType = isHabitualLatePayer ? 'd2_habitual' : 'd2_regular';
    if (await alreadySentCadence(customer.customerId, notificationType)) continue;
    if (!isCpfSendAllowed(customer.document)) {
      logSkippedOutsideAllowlist(customer.customerId, customer.phone, notificationType);
      continue;
    }

    try {
      const fullName = titleCaseName(customer.name);
      const msg = isHabitualLatePayer
        ? `Olá, ${fullName}! ⚠️\n\nFaltam 2 dias para o vencimento da sua fatura de R$ ${customer.amount.toFixed(2)}. Evite juros e risco de suspensão futura pagando agora.\n\n` +
          pixLine(customer.pixCode ?? '', '💳 PIX copia e cola:') +
          `Qualquer dúvida, é só falar! 😊`
        : `Olá, ${fullName}! 👋\n\nSó um lembrete rápido: sua fatura de R$ ${customer.amount.toFixed(2)} vence em 2 dias.\n\n` +
          pixLine(customer.pixCode ?? '', '💳 PIX copia e cola:') +
          `Qualquer dúvida, é só falar! 😊`;

      await whatsappService.sendText(env.DEFAULT_TENANT_ID, customer.phone, msg);
      await logCadenceNotification(customer.customerId, customer.phone, notificationType);
    } catch (err) {
      console.error(`[billing-cadence:d2] failed for ${customer.customerId}:`, err);
    }
  }
}
