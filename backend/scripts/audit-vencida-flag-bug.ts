/**
 * Read-only audit (2026-07-20): reproduce the "(vencida)" bug reported by Ronald —
 * Sofia listed 8 invoices (Jun/2026-Jan/2027) for CPF 02284204317 and marked ALL of
 * them as "(vencida)", even ones months in the future. Does not modify anything,
 * does not send anything, does not call gerar_pix.
 *
 * Run: npx ts-node --project tsconfig.json scripts/audit-vencida-flag-bug.ts
 */
import { sgpClient, systemParams } from '../src/integrations/sgp/client';
import { TitulosResponseSchema } from '../src/integrations/sgp/types';
import { getCustomerByCpf } from '../src/integrations/sgp/customers';
import { getCustomerInvoices } from '../src/integrations/sgp/billing';

async function main() {
  const cpf = '02284204317';

  const customer = await getCustomerByCpf(cpf);
  console.log('resolved contract:', customer.id, customer.name);

  // Raw SGP payload — exact vencimento string format, statusid, status text.
  const body = systemParams({ contrato: customer.id, limit: '20' });
  const { data } = await sgpClient.post('/api/central/titulos/', body.toString());
  const parsed = TitulosResponseSchema.parse(data);

  const today = new Date().toISOString().split('T')[0]!;
  console.log(`\ntoday (ISO, used by faturaToInvoice comparison): ${today}\n`);

  console.log('RAW SGP faturas:');
  for (const f of parsed.faturas) {
    console.log(JSON.stringify({
      id: f.id,
      vencimento: f.vencimento,
      vencimento_atualizado: f.vencimento_atualizado,
      status: f.status,
      statusid: f.statusid,
    }));
  }

  console.log('\nNormalized via getCustomerInvoices (what listar_faturas/get_fatura_atual return to the LLM):');
  const invoices = await getCustomerInvoices(customer.id);
  for (const inv of invoices) {
    console.log(JSON.stringify({ id: inv.id, dueDate: inv.dueDate, status: inv.status }));
  }

  console.log('\nManual string comparison check (dueDate < today):');
  for (const inv of invoices) {
    console.log(`  dueDate=${inv.dueDate}  dueDate<today=${inv.dueDate < today}  computed status=${inv.status}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
