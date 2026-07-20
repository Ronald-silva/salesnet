/**
 * Read-only audit (Ronald, 2026-07-20): fetch Maria's real current invoice from SGP
 * (contract 103971 / sgp_cliente_id 1139474) to compute the 6-stage billing cadence
 * dates against her REAL due date. Does not send anything, does not modify any table.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/audit-maria-invoice-dates.ts
 */
import { supabase } from '../src/config/supabase';
import { getCustomerInvoices } from '../src/integrations/sgp/billing';

async function main() {
  const { data: recipient, error } = await supabase
    .from('billing_recipients')
    .select('*')
    .eq('contract_id', '103971')
    .single();

  if (error || !recipient) {
    console.error('recipient lookup failed:', error?.message);
    return;
  }

  console.log('cadence_start_date:', recipient.cadence_start_date);
  console.log('stages_enabled:', recipient.stages_enabled);
  console.log('active/paused:', recipient.active, recipient.paused);

  const invoices = await getCustomerInvoices('103971');
  console.log(`\n${invoices.length} invoice(s) returned by SGP for contract 103971:`);
  for (const inv of invoices) {
    console.log(JSON.stringify({
      id: inv.id,
      amount: inv.amount,
      dueDate: inv.dueDate,
      status: inv.status,
      hasPixCode: !!inv.pixCode,
    }));
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
