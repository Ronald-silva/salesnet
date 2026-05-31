import type { Response } from 'express';

const MISCONFIGURED_HINT =
  'Supabase denied table access. If SET ROLE service_role works in SQL Editor, re-copy the current service_role secret into Railway (no quotes), redeploy, and compare /health keyFp with local .env.';

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
