import { supabase } from '../config/supabase';
import { whatsappService } from '../services/whatsapp-service';
import { env } from '../config/env';
import { sanitizeOutgoingMessage } from '../utils/sanitize-outgoing';

interface VisitRow {
  id: string;
  phone: string;
  visit_date: string;
  period: string;
}

export async function sendVisitReminders(): Promise<void> {
  const todayStr = new Date().toISOString().split('T')[0];

  const { data } = await supabase
    .from('scheduled_visits')
    .select('id, phone, visit_date, period')
    .eq('tenant_id', env.DEFAULT_TENANT_ID)
    .eq('reminder_sent', false)
    .eq('status', 'scheduled')
    .eq('visit_date', todayStr);

  for (const visit of ((data ?? []) as VisitRow[])) {
    const period = visit.period === 'morning' ? 'manhã' : 'tarde';
    const msg = `Lembrete: o técnico da SalesNet chegará no seu endereço hoje pela ${period}. Certifique-se de que alguém estará em casa. 🔧`;

    try {
      await whatsappService.sendText(
        env.DEFAULT_TENANT_ID,
        visit.phone,
        sanitizeOutgoingMessage(msg),
      );
      await supabase
        .from('scheduled_visits')
        .update({ reminder_sent: true })
        .eq('id', visit.id)
        .eq('tenant_id', env.DEFAULT_TENANT_ID);
    } catch (err) {
      console.error(`[visit-reminder] failed for visit ${visit.id}:`, err);
    }
  }
}

export async function sendVisitFollowups(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const { data } = await supabase
    .from('scheduled_visits')
    .select('id, phone, visit_date, period')
    .eq('tenant_id', env.DEFAULT_TENANT_ID)
    .eq('followup_sent', false)
    .eq('status', 'done')
    .lte('visit_date', yesterdayStr);

  for (const visit of ((data ?? []) as VisitRow[])) {
    const msg = `Oi! O técnico da SalesNet passou aí. Seu problema foi resolvido? Responda 👍 se sim ou 👎 se ainda tiver alguma pendência.`;

    try {
      await whatsappService.sendText(
        env.DEFAULT_TENANT_ID,
        visit.phone,
        sanitizeOutgoingMessage(msg),
      );
      await supabase
        .from('scheduled_visits')
        .update({ followup_sent: true })
        .eq('id', visit.id)
        .eq('tenant_id', env.DEFAULT_TENANT_ID);
    } catch (err) {
      console.error(`[visit-followup] failed for visit ${visit.id}:`, err);
    }
  }
}
