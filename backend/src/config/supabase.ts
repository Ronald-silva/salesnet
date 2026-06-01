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

// supabase-js auth state can override the Authorization header on PostgREST requests
// (e.g. SIGNED_IN/TOKEN_REFRESHED events calling rest.setAuth()). We intercept only
// /rest/v1/ calls to enforce the service_role key. Auth endpoint calls (/auth/v1/)
// must NOT be intercepted — supabase.auth.getUser(token) sends the user's token in
// Authorization and overriding it with service_role breaks JWT validation.
function makeServiceRoleFetch(key: string): typeof fetch {
  return (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : (input as Request).url;
    if (url.includes('/rest/v1/')) {
      const headers = new Headers(init?.headers);
      headers.set('apikey', key);
      headers.set('Authorization', `Bearer ${key}`);
      return globalThis.fetch(input, { ...init, headers });
    }
    return globalThis.fetch(input, init);
  };
}

const _key = getNormalizedSupabaseKey();

export const supabase = createClient(getNormalizedSupabaseUrl(), _key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: makeServiceRoleFetch(_key),
  },
});

/** PostgREST hints often name the role that actually ran the query (e.g. anon, not service_role). */
export function inferPostgrestRoleFromHint(hint: string | null | undefined): string | null {
  // Match the role in "GRANT ... TO <role>" — use the last TO capture to avoid
  // matching "to the" in the surrounding English prose.
  const matches = [...(hint?.matchAll(/\bTO\s+(\w+)/gi) ?? [])];
  return matches.at(-1)?.[1] ?? null;
}
