/**
 * Read-only audit (Ronald, 2026-07-20): what actually happened in today's 6 billing
 * cron runs (10:45-11:15 UTC = 07:45-08:15 Fortaleza), which ran BEFORE the limit=5 fix
 * (still uncommitted at time of writing). Does not modify anything.
 *
 * Run: npx ts-node --project tsconfig.json scripts/audit-todays-cron-window.ts
 */
import { supabase } from '../src/config/supabase';

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '(none)';
  return phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

async function main() {
  const { data, error } = await supabase
    .from('billing_dispatch_jobs')
    .select('*')
    .gte('created_at', '2026-07-20T10:40:00.000Z')
    .lte('created_at', '2026-07-20T11:20:00.000Z')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('query failed:', error.message);
    return;
  }
  console.log(`${(data ?? []).length} job(s) created in today's 10:40-11:20 UTC cron window:\n`);
  for (const j of data ?? []) {
    console.log(JSON.stringify({
      id: j.id,
      contract_id: j.contract_id,
      stage: j.stage,
      scheduled_for: j.scheduled_for,
      status: j.status,
      phone: maskPhone(j.phone),
      message: j.message,
      sent_at: j.sent_at,
      failed_at: j.failed_at,
      error_message: j.error_message,
      created_at: j.created_at,
    }, null, 2));
  }

  console.log('\n--- also: ALL jobs ever created for contract_id=103971 (Maria), any date ---');
  const { data: mariaJobs, error: mariaErr } = await supabase
    .from('billing_dispatch_jobs')
    .select('*')
    .eq('contract_id', '103971')
    .order('created_at', { ascending: true });
  if (mariaErr) {
    console.error('maria query failed:', mariaErr.message);
  } else {
    console.log(`${(mariaJobs ?? []).length} job(s) total for contract 103971`);
    for (const j of mariaJobs ?? []) {
      console.log(JSON.stringify({ stage: j.stage, status: j.status, scheduled_for: j.scheduled_for, created_at: j.created_at, message: j.message }, null, 2));
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('fatal:', e); process.exit(1); });
