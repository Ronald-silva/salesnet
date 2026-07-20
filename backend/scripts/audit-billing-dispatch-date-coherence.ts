/**
 * Read-only audit (Ronald, 2026-07-20): billing_dispatch_jobs / billing_recipients
 * date coherence, ahead of the first Larissa (Fernando's wife) live test and any
 * further real dispatch to Maria (already active in billing_recipients).
 *
 * Does NOT modify any table. Run with:
 *   npx ts-node --project tsconfig.json scripts/audit-billing-dispatch-date-coherence.ts
 */
import { supabase } from '../src/config/supabase';

function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '(none)';
  return phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}
function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return '(none)';
  return cpf.length >= 6 ? `${cpf.slice(0, 3)}***${cpf.slice(-2)}` : '***';
}

async function main() {
  console.log('=== billing_recipients (all, incl. removed/paused) ===');
  const { data: recipients, error: recErr } = await supabase
    .from('billing_recipients')
    .select('*')
    .order('created_at', { ascending: true });
  if (recErr) {
    console.error('billing_recipients query failed:', recErr.message);
  } else {
    for (const r of recipients ?? []) {
      console.log(JSON.stringify({
        id: r.id,
        contract_id: r.contract_id,
        sgp_cliente_id: r.sgp_cliente_id,
        cpf: maskCpf(r.cpf),
        customer_name: r.customer_name,
        phone: maskPhone(r.phone),
        active: r.active,
        paused: r.paused,
        stages_enabled: r.stages_enabled,
        cadence_start_date: r.cadence_start_date,
        next_dispatch_at: r.next_dispatch_at,
        notes: r.notes,
        created_by: r.created_by,
        created_at: r.created_at,
        removed_at: r.removed_at,
        last_synced_at: r.last_synced_at,
      }));
    }
    console.log(`total recipients: ${(recipients ?? []).length}`);
  }

  console.log('\n=== billing_dispatch_jobs (all) ===');
  const { data: jobs, error: jobErr } = await supabase
    .from('billing_dispatch_jobs')
    .select('*')
    .order('created_at', { ascending: true });
  if (jobErr) {
    console.error('billing_dispatch_jobs query failed:', jobErr.message);
  } else {
    for (const j of jobs ?? []) {
      console.log(JSON.stringify({
        id: j.id,
        billing_recipient_id: j.billing_recipient_id,
        contract_id: j.contract_id,
        stage: j.stage,
        scheduled_for: j.scheduled_for,
        status: j.status,
        phone: maskPhone(j.phone),
        idempotency_key: j.idempotency_key,
        sent_at: j.sent_at,
        failed_at: j.failed_at,
        error_message: j.error_message,
        created_at: j.created_at,
      }));
    }
    console.log(`total jobs: ${(jobs ?? []).length}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
