import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

type JwtPayload = { role?: string; ref?: string; exp?: number; iss?: string };

/** Strip BOM, whitespace, and accidental surrounding quotes from Railway/env paste. */
export function normalizeSupabaseKey(raw: string): string {
  let key = raw.replace(/^\uFEFF/, '').trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key;
}

export function getNormalizedSupabaseUrl(): string {
  return env.SUPABASE_URL
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\/rest\/v1\/?$/i, '');
}

/** True when SUPABASE_URL is exactly https://<ref>.supabase.co */
export function isCanonicalSupabaseUrl(): boolean {
  return getSupabaseUrlProjectRef() !== null;
}

export function getNormalizedSupabaseKey(): string {
  return normalizeSupabaseKey(env.SUPABASE_SERVICE_ROLE_KEY);
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as JwtPayload;
  } catch {
    return null;
  }
}

/** SHA-256 fingerprint (first 8 hex) — safe to log; never exposes the secret. */
export function getSupabaseKeyFingerprint(): string {
  return createHash('sha256').update(getNormalizedSupabaseKey(), 'utf8').digest('hex').slice(0, 8);
}

/** Role claim from SUPABASE_SERVICE_ROLE_KEY JWT (for diagnostics only; signature not verified). */
export function getSupabaseKeyRole(): string | null {
  return decodeJwtPayload(getNormalizedSupabaseKey())?.role ?? null;
}

export function getSupabaseKeyProjectRef(): string | null {
  return decodeJwtPayload(getNormalizedSupabaseKey())?.ref ?? null;
}

export function getSupabaseKeyExpiry(): number | null {
  const exp = decodeJwtPayload(getNormalizedSupabaseKey())?.exp;
  return typeof exp === 'number' ? exp : null;
}

export function isSupabaseKeyExpired(): boolean {
  const exp = getSupabaseKeyExpiry();
  if (exp === null) return false;
  return exp * 1000 < Date.now();
}

export function getSupabaseUrlProjectRef(): string | null {
  const match = getNormalizedSupabaseUrl().match(/^https:\/\/([^.]+)\.supabase\.co\/?$/);
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

export const supabase = createClient(getNormalizedSupabaseUrl(), getNormalizedSupabaseKey(), {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

/** PostgREST hints often name the role that actually ran the query (e.g. anon, not service_role). */
export function inferPostgrestRoleFromHint(hint: string | null | undefined): string | null {
  const match = hint?.match(/TO\s+(\w+)/i);
  return match?.[1] ?? null;
}
