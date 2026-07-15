// backend/scripts/verify-billing-recipients-schema.ts
/**
 * Read-only-ish (limpa tudo que insere) verificação de que a migration
 * 20260715120000_billing_recipients_and_dispatch_jobs.sql foi aplicada corretamente:
 * tabelas existem, índice único parcial em billing_recipients funciona, índice único
 * de idempotency_key em billing_dispatch_jobs funciona.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/verify-billing-recipients-schema.ts
 */
import { supabase } from '../src/config/supabase';

async function main() {
  console.log('[verify] checking billing_recipients / billing_dispatch_jobs exist and enforce constraints...\n');

  const sentinelContract = `__verify_sentinel_${Date.now()}`;

  const first = await supabase
    .from('billing_recipients')
    .insert({
      tenant_id: 'salesnet-default',
      contract_id: sentinelContract,
      cpf: '00000000000',
      customer_name: 'Verify Sentinel',
      phone: '+5585900000000',
      created_by: 'verify-script',
    })
    .select('id')
    .single();

  if (first.error) {
    console.error('[verify] FAIL: could not insert into billing_recipients —', first.error.message);
    process.exit(1);
  }
  console.log('[verify] PASS: billing_recipients insert ok, id=', first.data.id);

  const dup = await supabase
    .from('billing_recipients')
    .insert({
      tenant_id: 'salesnet-default',
      contract_id: sentinelContract,
      cpf: '00000000000',
      customer_name: 'Verify Sentinel Dup',
      phone: '+5585900000000',
      created_by: 'verify-script',
    })
    .select('id')
    .single();

  if (dup.error) {
    if (dup.error.code === '23505') {
      console.log('[verify] PASS: duplicate active (tenant_id, contract_id) correctly rejected —', dup.error.code);
    } else {
      console.error('[verify] FAIL: duplicate active check got unexpected error —', dup.error.code, dup.error.message);
    }
  } else {
    console.error('[verify] FAIL: duplicate active recipient was NOT rejected — partial unique index missing or wrong.');
    await supabase.from('billing_recipients').delete().eq('id', dup.data.id);
  }

  const job1 = await supabase
    .from('billing_dispatch_jobs')
    .insert({
      billing_recipient_id: first.data.id,
      contract_id: sentinelContract,
      stage: 'test',
      scheduled_for: new Date().toISOString().split('T')[0],
      phone: '+5585900000000',
      idempotency_key: `${sentinelContract}:test:${new Date().toISOString().split('T')[0]}`,
    })
    .select('id')
    .single();

  if (job1.error) {
    console.error('[verify] FAIL: could not insert into billing_dispatch_jobs —', job1.error.message);
  } else {
    console.log('[verify] PASS: billing_dispatch_jobs insert ok, id=', job1.data.id);

    const job2 = await supabase
      .from('billing_dispatch_jobs')
      .insert({
        billing_recipient_id: first.data.id,
        contract_id: sentinelContract,
        stage: 'test',
        scheduled_for: new Date().toISOString().split('T')[0],
        phone: '+5585900000000',
        idempotency_key: `${sentinelContract}:test:${new Date().toISOString().split('T')[0]}`,
      })
      .select('id')
      .single();

    if (job2.error) {
      if (job2.error.code === '23505') {
        console.log('[verify] PASS: duplicate idempotency_key correctly rejected —', job2.error.code);
      } else {
        console.error('[verify] FAIL: duplicate idempotency_key check got unexpected error —', job2.error.code, job2.error.message);
      }
    } else {
      console.error('[verify] FAIL: duplicate idempotency_key was NOT rejected — unique index missing.');
      await supabase.from('billing_dispatch_jobs').delete().eq('id', job2.data.id);
    }

    await supabase.from('billing_dispatch_jobs').delete().eq('id', job1.data.id);
  }

  await supabase.from('billing_recipients').delete().eq('id', first.data.id);
  console.log('\n[verify] cleanup done — no sentinel rows left behind.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[verify] fatal error:', err);
    process.exit(1);
  });
