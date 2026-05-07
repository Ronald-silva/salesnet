import { Router } from 'express';
import { reactivateCustomer } from '../integrations/sgp';
import { sendMessage } from '../integrations/twilio';

export const paymentWebhookRouter = Router();

paymentWebhookRouter.post('/payment-confirmed', async (req, res) => {
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
    await reactivateCustomer(customerId);
    const amountStr = amount !== undefined ? `R$ ${Number(amount).toFixed(2)}` : 'seu pagamento';
    await sendMessage(
      phone,
      `Olá! Recebemos seu pagamento de ${amountStr} com sucesso. ` +
      `Sua conexão foi reativada. Obrigado por estar conosco!`
    );
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[payment-webhook] reactivation failed for ${customerId}:`, err);
    res.status(500).json({ error: 'reactivation failed' });
  }
});
