/**
 * Read-only diagnostic (Ronald, Item 3 step 7 troubleshooting): checks whether
 * production Supabase's PostgREST schema cache currently sees
 * interaction_logs.tier_downgraded (migration 040), and separately reports
 * conversation_threads.human_mode for the sandbox phone — a second run of
 * diag-tier-downgraded-live.ts produced no processor logs at all, which is
 * consistent with isHumanMode() short-circuiting processMessage() before any
 * logging happens (unrelated to the migration/schema-cache question).
 *
 * Run with: npx ts-node --project tsconfig.json scripts/diag-check-tier-downgraded-schema.ts
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { supabase } from '../src/config/supabase';

async function main() {
  const phone = env.TEST_SANDBOX_PHONE!;
  assertSandboxNumber(phone);
  const tenantId = env.DEFAULT_TENANT_ID;

  const { data: thread, error: threadErr } = await supabase
    .from('conversation_threads')
    .select('human_mode, status, updated_at')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  console.log('[check] conversation_threads:', JSON.stringify(thread), threadErr?.message ?? '');

  const { data: rows, error: colErr } = await supabase
    .from('interaction_logs')
    .select('*')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (colErr) {
    console.log('[check] interaction_logs select * error:', colErr.message);
  } else {
    console.log('[check] interaction_logs latest row keys:', rows?.[0] ? Object.keys(rows[0]).join(',') : '(no rows)');
    console.log('[check] has tier_downgraded key:', rows?.[0] ? Object.prototype.hasOwnProperty.call(rows[0], 'tier_downgraded') : 'n/a');
  }

  // select * bypasses needing to name the column explicitly, but PostgREST still
  // needs its own schema cache to know the column exists to include it in '*'.
  // A targeted select on just the new column isolates the cache question cleanly.
  const { error: targetedErr } = await supabase
    .from('interaction_logs')
    .select('tier_downgraded')
    .limit(1);
  console.log('[check] targeted select tier_downgraded error:', targetedErr?.message ?? '(none — column visible to PostgREST)');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
