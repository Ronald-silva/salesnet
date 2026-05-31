import type { Response } from 'express';

const MISCONFIGURED_HINT =
  'SUPABASE_SERVICE_ROLE_KEY must be the service_role secret from Supabase → Project Settings → API (not the anon/public key).';

/** Maps Supabase PostgREST errors to admin API responses; logs the raw message. */
export function respondSupabaseQueryError(
  res: Response,
  error: { message: string },
  fallbackError: string,
  logLabel: string,
): void {
  console.error(`[admin] ${logLabel}:`, error.message);

  if (/permission denied/i.test(error.message)) {
    res.status(503).json({
      error: 'database_misconfigured',
      hint: MISCONFIGURED_HINT,
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
