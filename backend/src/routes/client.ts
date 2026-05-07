import { Router } from 'express';
import { clientAuthMiddleware, AuthenticatedRequest } from '../middleware/clientAuth';
import {
  getCurrentInvoice,
  generatePixKey,
  getConnectionStatus,
  getCustomerTickets,
  openTicket,
  getCustomerInvoices,
} from '../integrations/sgp';
import { supabase } from '../config/supabase';

export const clientRouter = Router();
clientRouter.use(clientAuthMiddleware);

clientRouter.get('/invoice', async (req: AuthenticatedRequest, res) => {
  try {
    const invoice = await getCurrentInvoice(req.customerId!);
    const pix = await generatePixKey(invoice.id);
    res.json({ ...invoice, pixKey: pix.pixKey });
  } catch (err) {
    console.error('[client] invoice error:', err);
    res.status(500).json({ error: 'failed to fetch invoice' });
  }
});

clientRouter.get('/connection', async (req: AuthenticatedRequest, res) => {
  try {
    const status = await getConnectionStatus(req.customerId!);
    res.json(status);
  } catch (err) {
    console.error('[client] connection error:', err);
    res.status(500).json({ error: 'failed to fetch connection status' });
  }
});

clientRouter.get('/tickets', async (req: AuthenticatedRequest, res) => {
  try {
    const tickets = await getCustomerTickets(req.customerId!, 20);
    res.json(tickets);
  } catch (err) {
    console.error('[client] tickets error:', err);
    res.status(500).json({ error: 'failed to fetch tickets' });
  }
});

clientRouter.post('/tickets', async (req: AuthenticatedRequest, res) => {
  const { type, description } = req.body as { type?: string; description?: string };
  if (!type || !description) {
    res.status(400).json({ error: 'type and description are required' });
    return;
  }
  try {
    const ticket = await openTicket(req.customerId!, type, description);
    res.status(201).json(ticket);
  } catch (err) {
    console.error('[client] open ticket error:', err);
    res.status(500).json({ error: 'failed to open ticket' });
  }
});

clientRouter.get('/referral', async (req: AuthenticatedRequest, res) => {
  const { data } = await supabase
    .from('referral_links')
    .select('code, conversions, created_at')
    .eq('customer_id', req.customerId!);

  const row = ((data ?? []) as { code: string; conversions: number; created_at: string }[])[0];
  if (!row) {
    res.json({ link: null, conversions: 0 });
    return;
  }
  res.json({
    link: `salesnet.com.br/indicar?ref=${row.code}`,
    conversions: row.conversions,
    createdAt: row.created_at,
  });
});

clientRouter.get('/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const invoices = await getCustomerInvoices(req.customerId!);
    res.json(invoices);
  } catch (err) {
    console.error('[client] invoices error:', err);
    res.status(500).json({ error: 'failed to fetch invoices' });
  }
});
