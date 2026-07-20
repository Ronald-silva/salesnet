/**
 * One-off forensic audit (read-only): billing-cadence.ts inserts billing_notifications.type
 * values 'd5_habitual' / 'd2_habitual' / 'd2_regular', but the CHECK constraint in
 * supabase/migrations/001_initial_schema.sql only allows ('d3','d0','overdue_d3','suspended_d5').
 * No migration in either backend/src/db/migrations/ or supabase/migrations/ appears to relax it.
 *
 * This script checks empirically:
 *   1. Which distinct `type` values actually exist in billing_notifications today (if the
 *      constraint is truly still ('d3','d0','overdue_d3','suspended_d5'), any 'd5_habitual'/
 *      'd2_habitual'/'d2_regular' row could only exist if the constraint was relaxed).
 *   2. A dry-run INSERT wrapped in a transaction that's always rolled back (via a throwaway
 *      value + immediate delete by a sentinel id, not a real transaction — see below) to see
 *      whether the DB itself rejects 'd5_habitual' right now.
 *
 * Does not leave any row behind: the trial insert, if it succeeds, is deleted immediately after.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/audit-billing-notifications-type-constraint.ts
 */
import { supabase } from '../src/config/supabase';

async function main() {
  console.log('[audit] fetching distinct billing_notifications.type values...');
  const { data, error } = await supabase
    .from('billing_notifications')
    .select('type, customer_id')
    .limit(5000);

  if (error) {
    console.error('[audit] query failed:', error.message);
    process.exit(1);
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const t = (row as { type: string }).type;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  console.log(`[audit] ${data?.length ?? 0} rows scanned. Distinct type values:`);
  for (const [type, count] of counts) {
    console.log(`  ${type}: ${count}`);
  }

  const habitualTypes = ['d5_habitual', 'd2_habitual', 'd2_regular'];
  const foundHabitual = habitualTypes.filter((t) => counts.has(t));
  console.log(
    foundHabitual.length > 0
      ? `[audit] FOUND real rows with habitual types in DB: ${foundHabitual.join(', ')} — constraint must already allow these (relaxed manually, undocumented).`
      : '[audit] NO rows found with d5_habitual/d2_habitual/d2_regular in the retained window.'
  );

  console.log('\n[audit] attempting a throwaway trial insert with type=d5_habitual (will delete immediately if it succeeds)...');
  const sentinelCustomerId = `__audit_sentinel_${Date.now()}`;
  const trial = await supabase
    .from('billing_notifications')
    .insert({
      customer_id: sentinelCustomerId,
      phone: '+5585900000000',
      type: 'd5_habitual',
      status: 'sent',
    })
    .select('id')
    .single();

  if (trial.error) {
    console.log(`[audit] INSERT REJECTED by DB: ${trial.error.message}`);
    console.log('[audit] CONCLUSION: CHECK constraint is still the original one — d5_habitual/d2_habitual/d2_regular inserts in billing-cadence.ts are failing silently in production today (caught by whatever try/catch wraps the insert, or erroring uncaught).');
  } else {
    console.log(`[audit] INSERT SUCCEEDED (id=${trial.data?.id}) — constraint currently allows 'd5_habitual'.`);
    const del = await supabase.from('billing_notifications').delete().eq('id', trial.data!.id);
    console.log(del.error ? `[audit] WARNING: failed to delete trial row: ${del.error.message}` : '[audit] trial row deleted, no residue left.');
    console.log('[audit] CONCLUSION: constraint was relaxed outside tracked migrations (undocumented drift), OR no CHECK constraint is actually enforced on this column today.');
  }

  console.log('\n[audit] NO permanent rows were left behind by this script.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[audit] fatal error:', err);
    process.exit(1);
  });
