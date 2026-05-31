import { supabase } from '../config/supabase';
import { whatsappService } from '../services/whatsapp-service';
import { sanitizeOutgoingMessage } from '../utils/sanitize-outgoing';

interface ScheduledMessageRow {
  id: string;
  tenant_id: string;
  phone: string;
  message: string;
}

export async function processScheduledMessages(): Promise<void> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('id, tenant_id, phone, message')
    .lte('send_after', now)
    .eq('sent', false)
    .order('send_after', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[scheduled-messages] query failed:', error);
    return;
  }

  for (const row of (data ?? []) as ScheduledMessageRow[]) {
    try {
      await whatsappService.sendText(
        row.tenant_id,
        row.phone,
        sanitizeOutgoingMessage(row.message),
      );
      const { error: updateError } = await supabase
        .from('scheduled_messages')
        .update({ sent: true, sent_at: new Date().toISOString() })
        .eq('id', row.id);
      if (updateError) {
        console.error(`[scheduled-messages] failed to mark sent id=${row.id}:`, updateError);
      }
    } catch (err) {
      console.error(`[scheduled-messages] send failed id=${row.id} phone=${row.phone}:`, err);
    }
  }
}
