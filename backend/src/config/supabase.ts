import { createClient } from '@supabase/supabase-js';
import { env } from './env';

function decodeJwtPayload(token: string): { role?: string; ref?: string } | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { role?: string; ref?: string };
  } catch {
    return null;
  }
}

/** Role claim from SUPABASE_SERVICE_ROLE_KEY JWT (for diagnostics only). */
export function getSupabaseKeyRole(): string | null {
  return decodeJwtPayload(env.SUPABASE_SERVICE_ROLE_KEY.trim())?.role ?? null;
}

export function getSupabaseKeyProjectRef(): string | null {
  return decodeJwtPayload(env.SUPABASE_SERVICE_ROLE_KEY.trim())?.ref ?? null;
}

export function getSupabaseUrlProjectRef(): string | null {
  const match = env.SUPABASE_URL.trim().match(/^https:\/\/([^.]+)\.supabase\.co\/?$/);
  return match?.[1] ?? null;
}

export function isSupabaseServiceRoleKey(): boolean {
  return getSupabaseKeyRole() === 'service_role';
}

export function assertSupabaseServiceRoleKey(): void {
  if (isSupabaseServiceRoleKey()) return;

  const role = getSupabaseKeyRole();
  console.error(
    `[supabase] SUPABASE_SERVICE_ROLE_KEY has role "${role ?? 'unknown'}" — expected "service_role". ` +
      'Database queries will fail with "permission denied". ' +
      'Copy the service_role secret from Supabase → Project Settings → API (not the anon/public key).',
  );

  if (env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

assertSupabaseServiceRoleKey();

export const supabase = createClient(
  env.SUPABASE_URL.trim(),
  env.SUPABASE_SERVICE_ROLE_KEY.trim(),
);
