import { createHmac, timingSafeEqual } from 'crypto';
import { Router, Request } from 'express';
import { env } from '../config/env';
import { whatsappService } from '../services/whatsapp-service';

type RawRequest = Request & { rawBody?: Buffer };

function validateSgpWebhook(rawBody: unknown, headers: Record<string, string>): boolean {
  const secret = env.SGP_WEBHOOK_SECRET;
  if (!secret) return false; // fail-secure: reject all if secret not configured

  if (!(rawBody instanceof Buffer)) return false;

  const rawSig = headers['x-sgp-signature'] ?? '';
  const signature = rawSig.startsWith('sha256=') ? rawSig.slice(7) : rawSig;
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    const expectedBuf = Buffer.from(expected, 'utf8');
    const receivedBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.byteLength !== receivedBuf.byteLength) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

export const paymentWebhookRouter = Router();

paymentWebhookRouter.post('/payment-confirmed', async (req, res) => {
  const headers = req.headers as Record<string, string>;
  const rawBody = (req as RawRequest).rawBody ?? Buffer.alloc(0);

  if (!validateSgpWebhook(rawBody, headers)) {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    console.warn(`[payment-webhook] Invalid HMAC signature from ${ip}`);
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { customerId, phone, amount } = req.body as {
    customerId?: string;
    phone?: string;
    amount?: number;
  };

  if (!customerId || !phone) {
    res.status(400).json({ error: 'customerId and phone are required' });
    return;
  }

  try {
    // Stub: SGP does not expose a reactivation endpoint.
    // Notify the operator to reactivate manually.
    const adminPhone = env.ADMIN_ALERT_PHONE;
    if (adminPhone) {
      await whatsappService.sendText(
        env.DEFAULT_TENANT_ID,
        adminPhone,
        `⚠️ Pagamento confirmado — reativar manualmente:\nContrato: ${customerId}\nValor: R$ ${amount ?? '?'}`,
      ).catch((err: unknown) => console.error('[payment-webhook] admin alert failed:', err));
    }

    const amountStr = amount !== undefined ? `R$ ${Number(amount).toFixed(2)}` : 'seu pagamento';
    await whatsappService.sendText(
      env.DEFAULT_TENANT_ID,
      phone,
      `Olá! Recebemos seu pagamento de ${amountStr} com sucesso. ` +
      `Sua conexão será reativada em alguns minutos. Obrigado por estar conosco!`,
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[payment-webhook] payment confirmation failed for ${customerId}:`, err);
    res.status(500).json({ error: 'payment confirmation failed' });
  }
});
