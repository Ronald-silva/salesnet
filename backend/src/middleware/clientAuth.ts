import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AuthenticatedRequest extends Request {
  customerId?: string;
  customerPhone?: string;
}

export async function clientAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { data } = await supabase
    .from('client_sessions')
    .select('customer_id, phone')
    .eq('token', token)
    .gte('expires_at', new Date().toISOString())
    .single();

  if (!data) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  req.customerId = (data as { customer_id: string; phone: string }).customer_id;
  req.customerPhone = (data as { customer_id: string; phone: string }).phone;
  next();
}
