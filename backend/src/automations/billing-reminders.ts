import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { suspendCustomer } from '../integrations/sgp';
import {
  resolveDueSoonCustomers,
  resolveOverdueCustomers,
  isCpfSendAllowed,
  logSkippedOutsideAllowlist,
} from './billing-allowlist';
import { whatsappService } from '../services/whatsapp-service';
import { titleCaseName } from '../lib/format';
import type { BillingTemplateName } from '../templates';

type NotificationType = 'd3' | 'd0' | 'overdue_d3' | 'suspended_d5';

export async function alreadySentToday(customerId: string, type: NotificationType): Promise<boolean> {
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

export async function logNotification(
  customerId: string,
  phone: string,
  type: NotificationType
): Promise<void> {
  const { error } = await supabase.from('billing_notifications').insert({
    customer_id: customerId,
    phone,
    type,
    status: 'sent',
  });
  if (error) {
    console.error(`[billing] failed to log notification for ${customerId} type=${type}:`, error);
  }
}

export async function runBillingJobD3(): Promise<void> {
  const customers = await resolveDueSoonCustomers(3);
  for (const customer of customers) {
    if (await alreadySentToday(customer.customerId, 'd3')) continue;
    if (!isCpfSendAllowed(customer.document)) {
      logSkippedOutsideAllowlist(customer.customerId, customer.phone, 'd3');
      continue;
    }
    try {
      await whatsappService.sendTemplate(env.DEFAULT_TENANT_ID, customer.phone, 'billing_reminder_d3' as BillingTemplateName, {
        nome: titleCaseName(customer.name),
        valor: customer.amount.toFixed(2),
        data_vencimento: customer.dueDate,
        chave_pix: customer.pixCode ?? '',
      });
      await logNotification(customer.customerId, customer.phone, 'd3');
    } catch (err) {
      console.error(`[billing:d3] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingJobD0(): Promise<void> {
  const customers = await resolveDueSoonCustomers(0);
  for (const customer of customers) {
    if (await alreadySentToday(customer.customerId, 'd0')) continue;
    if (!isCpfSendAllowed(customer.document)) {
      logSkippedOutsideAllowlist(customer.customerId, customer.phone, 'd0');
      continue;
    }
    try {
      await whatsappService.sendTemplate(env.DEFAULT_TENANT_ID, customer.phone, 'billing_reminder_d0' as BillingTemplateName, {
        nome: titleCaseName(customer.name),
        valor: customer.amount.toFixed(2),
        data_vencimento: customer.dueDate,
        chave_pix: customer.pixCode ?? '',
      });
      await logNotification(customer.customerId, customer.phone, 'd0');
    } catch (err) {
      console.error(`[billing:d0] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingJobOverdueD3(): Promise<void> {
  const customers = await resolveOverdueCustomers(3);
  for (const customer of customers) {
    if (await alreadySentToday(customer.customerId, 'overdue_d3')) continue;
    if (!isCpfSendAllowed(customer.document)) {
      logSkippedOutsideAllowlist(customer.customerId, customer.phone, 'overdue_d3');
      continue;
    }
    try {
      await whatsappService.sendTemplate(env.DEFAULT_TENANT_ID, customer.phone, 'billing_overdue_d3' as BillingTemplateName, {
        nome: titleCaseName(customer.name),
        valor: customer.amountDue.toFixed(2),
        chave_pix: customer.pixCode ?? '',
      });
      await logNotification(customer.customerId, customer.phone, 'overdue_d3');
    } catch (err) {
      console.error(`[billing:overdue_d3] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingJobSuspendD5(): Promise<void> {
  const customers = await resolveOverdueCustomers(5);
  for (const customer of customers) {
    if (await alreadySentToday(customer.customerId, 'suspended_d5')) continue;
    if (!isCpfSendAllowed(customer.document)) {
      logSkippedOutsideAllowlist(customer.customerId, customer.phone, 'suspended_d5');
      continue;
    }
    try {
      await whatsappService.sendTemplate(env.DEFAULT_TENANT_ID, customer.phone, 'billing_suspended_d5' as BillingTemplateName, {
        nome: titleCaseName(customer.name),
        valor: customer.amountDue.toFixed(2),
        chave_pix: customer.pixCode ?? '',
      });
      await suspendCustomer(customer.customerId);
      await logNotification(customer.customerId, customer.phone, 'suspended_d5');
    } catch (err) {
      console.error(`[billing:suspended_d5] failed for ${customer.customerId}:`, err);
    }
  }
}
