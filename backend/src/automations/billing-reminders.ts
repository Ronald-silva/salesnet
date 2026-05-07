import { supabase } from '../config/supabase';
import {
  getCustomersDueInDays,
  getOverdueCustomers,
  suspendCustomer,
  getCurrentInvoice,
  generatePixKey,
} from '../integrations/sgp';
import { sendTemplate, TEMPLATES } from '../integrations/twilio';

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
  const customers = await getCustomersDueInDays(3);
  for (const customer of customers) {
    if (await alreadySentToday(customer.customerId, 'd3')) continue;
    try {
      const invoice = await getCurrentInvoice(customer.customerId);
      const pix = await generatePixKey(invoice.id);
      await sendTemplate(customer.phone, TEMPLATES.BILLING_REMINDER_D3, {
        nome: customer.name,
        valor: customer.amount.toFixed(2),
        data_vencimento: customer.dueDate,
        chave_pix: pix.pixKey,
      });
      await logNotification(customer.customerId, customer.phone, 'd3');
    } catch (err) {
      console.error(`[billing:d3] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingJobD0(): Promise<void> {
  const customers = await getCustomersDueInDays(0);
  for (const customer of customers) {
    if (await alreadySentToday(customer.customerId, 'd0')) continue;
    try {
      const invoice = await getCurrentInvoice(customer.customerId);
      const pix = await generatePixKey(invoice.id);
      await sendTemplate(customer.phone, TEMPLATES.BILLING_REMINDER_D0, {
        nome: customer.name,
        valor: customer.amount.toFixed(2),
        data_vencimento: customer.dueDate,
        chave_pix: pix.pixKey,
      });
      await logNotification(customer.customerId, customer.phone, 'd0');
    } catch (err) {
      console.error(`[billing:d0] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingJobOverdueD3(): Promise<void> {
  const customers = await getOverdueCustomers(3);
  for (const customer of customers) {
    if (await alreadySentToday(customer.customerId, 'overdue_d3')) continue;
    try {
      const invoice = await getCurrentInvoice(customer.customerId);
      const pix = await generatePixKey(invoice.id);
      await sendTemplate(customer.phone, TEMPLATES.BILLING_OVERDUE_D3, {
        nome: customer.name,
        valor: customer.amountDue.toFixed(2),
        chave_pix: pix.pixKey,
      });
      await logNotification(customer.customerId, customer.phone, 'overdue_d3');
    } catch (err) {
      console.error(`[billing:overdue_d3] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingJobSuspendD5(): Promise<void> {
  const customers = await getOverdueCustomers(5);
  for (const customer of customers) {
    if (await alreadySentToday(customer.customerId, 'suspended_d5')) continue;
    try {
      const invoice = await getCurrentInvoice(customer.customerId);
      const pix = await generatePixKey(invoice.id);
      await sendTemplate(customer.phone, TEMPLATES.BILLING_SUSPENDED_D5, {
        nome: customer.name,
        valor: customer.amountDue.toFixed(2),
        chave_pix: pix.pixKey,
      });
      await suspendCustomer(customer.customerId);
      await logNotification(customer.customerId, customer.phone, 'suspended_d5');
    } catch (err) {
      console.error(`[billing:suspended_d5] failed for ${customer.customerId}:`, err);
    }
  }
}
