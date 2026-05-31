import type { Response } from 'express';
import { inferPostgrestRoleFromHint } from '../config/supabase';

function permissionDeniedHint(postgrestHint: string | null | undefined): string {
  const effectiveRole = inferPostgrestRoleFromHint(postgrestHint);
  if (effectiveRole && effectiveRole !== 'service_role') {
    return (
      `PostgREST ran as role "${effectiveRole}", not service_role. ` +
      'The JWT may be invalid on this host (signature/truncation) or the wrong API key is active. ' +
      'Compare /health keyFp and keyLen with local .env; check Railway Supabase integration overrides.'
    );
  }
  return (
    'PostgREST denied table access for service_role. ' +
    'If SET ROLE service_role works in SQL Editor, check Railway SUPABASE_URL and integration overrides.'
  );
}

/** Maps Supabase PostgREST errors to admin API responses; logs the raw message. */
export function respondSupabaseQueryError(
  res: Response,
  error: { message: string; hint?: string | null; code?: string },
  fallbackError: string,
  logLabel: string,
): void {
  console.error(`[admin] ${logLabel}:`, error.message, error.hint ?? '', error.code ?? '');

  if (/permission denied/i.test(error.message)) {
    res.status(503).json({
      error: 'database_misconfigured',
      hint: permissionDeniedHint(error.hint),
      postgrestHint: error.hint ?? undefined,
      postgrestRole: inferPostgrestRoleFromHint(error.hint) ?? undefined,
    });
    return;
  }

  if (/does not exist/i.test(error.message) && /relation/i.test(error.message)) {
    res.status(503).json({
      error: 'database_schema_missing',
      hint: 'Run pending SQL migrations in Supabase (see backend/src/db/migrations/).',
      detail: error.message,
    });
    return;
  }

  res.status(500).json({ error: fallbackError });
}
