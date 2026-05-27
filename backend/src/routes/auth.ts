import { Router } from 'express';
import { randomInt, randomUUID } from 'crypto';
import { normalizePhone } from '../lib/phone';
import { getCustomerByPhone } from '../integrations/sgp';
import { whatsappService } from '../services/whatsapp-service';
import { supabase } from '../config/supabase';
import { env } from '../config/env';

export const authRouter = Router();

function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

authRouter.post('/request-otp', async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone) {
    res.status(400).json({ error: 'phone is required' });
    return;
  }

  const normalized = normalizePhone(phone);

  try {
    await getCustomerByPhone(normalized);
  } catch {
    res.status(404).json({ error: 'phone not found' });
    return;
  }

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabase.from('otp_codes').upsert({ phone: normalized, code, expires_at: expiresAt });

  try {
    await whatsappService.sendText(
      env.DEFAULT_TENANT_ID,
      normalized,
      `Seu código de acesso SalesNet é: ${code}\nVálido por 10 minutos.`
    );
  } catch (err) {
    console.error('[auth] failed to send OTP:', err);
    res.status(500).json({ error: 'failed to send OTP' });
    return;
  }

  res.status(200).json({ ok: true });
});

authRouter.post('/verify-otp', async (req, res) => {
  const { phone, code } = req.body as { phone?: string; code?: string };
  if (!phone || !code) {
    res.status(400).json({ error: 'phone and code are required' });
    return;
  }

  const normalized = normalizePhone(phone);

  const { data: otpRow } = await supabase
    .from('otp_codes')
    .select('code, expires_at')
    .eq('phone', normalized)
    .gte('expires_at', new Date().toISOString())
    .single();

  if (!otpRow || (otpRow as { code: string }).code !== code) {
    res.status(401).json({ error: 'invalid or expired code' });
    return;
  }

  let customer;
  try {
    customer = await getCustomerByPhone(normalized);
  } catch {
    res.status(404).json({ error: 'customer not found' });
    return;
  }

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('client_sessions').insert({
    token,
    customer_id: customer.id,
    phone: normalized,
    expires_at: expiresAt,
  });

  res.status(200).json({ token, customerId: customer.id, name: customer.name });
});
