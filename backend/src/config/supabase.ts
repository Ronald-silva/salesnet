import { createClient } from '@supabase/supabase-js';
import { env } from './env';

function decodeJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function assertSupabaseServiceRoleKey(): void {
  const role = decodeJwtRole(env.SUPABASE_SERVICE_ROLE_KEY);
  if (role === 'service_role') return;

  console.error(
    `[supabase] SUPABASE_SERVICE_ROLE_KEY has role "${role ?? 'unknown'}" — expected "service_role". ` +
      'Database queries will fail with "permission denied". ' +
      'Copy the service_role secret from Supabase → Project Settings → API (not the anon/public key).',
  );
}

assertSupabaseServiceRoleKey();

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
