import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AdminRequest extends Request {
  adminUserId?: string;
  adminEmail?: string;
}

function extractRole(user: unknown): string | undefined {
  if (!user || typeof user !== 'object') return undefined;
  const data = user as { app_metadata?: { role?: string } };
  return data.app_metadata?.role;
}

export async function adminAuthMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.headers.authorization?.replace('Bearer ', '').trim();
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: 'invalid token' });
    return;
  }

  const role = extractRole(data.user);
  if (role !== 'admin') {
    res.status(403).json({ error: 'admin role required' });
    return;
  }

  req.adminUserId = data.user.id;
  req.adminEmail = data.user.email ?? undefined;
  next();
}
