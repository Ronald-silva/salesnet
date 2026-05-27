import { Router } from 'express';
import { env } from '../../config/env';
import { supabase } from '../../config/supabase';
import { whatsappService } from '../../services/whatsapp-service';

export const expansionRouter = Router();

const RATE_LIMIT_BATCH = 50;
const RATE_LIMIT_DELAY_MS = 60_000;

async function sendBatch(phones: string[], message: string): Promise<number> {
  let sent = 0;
  for (let i = 0; i < phones.length; i++) {
    try {
      await whatsappService.sendText(env.DEFAULT_TENANT_ID, phones[i], message);
      sent++;
    } catch (err) {
      console.error(`[campaigns:expansion] failed to send to ${phones[i]}:`, err);
    }
    if (sent % RATE_LIMIT_BATCH === 0 && sent > 0 && i < phones.length - 1) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }
  return sent;
}

expansionRouter.post('/expansion', async (req, res) => {
  const { neighborhood, message } = req.body as {
    neighborhood?: string;
    message?: string;
  };

  if (!neighborhood || !message) {
    res.status(400).json({ error: 'neighborhood and message are required' });
    return;
  }

  const { data, error } = await supabase
    .from('waitlist')
    .select('phone')
    .eq('neighborhood', neighborhood);

  if (error) {
    console.error('[campaigns:expansion] supabase error:', error);
    res.status(500).json({ error: 'failed to query waitlist' });
    return;
  }

  const phones = ((data ?? []) as { phone: string }[]).map(r => r.phone);
  const sent = await sendBatch(phones, message);
  res.status(200).json({ ok: true, sent });
});
