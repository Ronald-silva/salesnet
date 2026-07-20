/**
 * Read-only audit (Ronald, 2026-07-20): reproduce the EXACT SGP query used by
 * getBillingStatusForAllowlist (status='1', limit='5') for contract 103971 (Maria),
 * to check ordering/truncation against the full open-invoice list. Does not modify
 * anything, does not send anything.
 *
 * Run: npx ts-node --project tsconfig.json scripts/audit-sgp-titulos-limit5-order.ts
 */
import { sgpClient, systemParams } from '../src/integrations/sgp/client';
import { TitulosResponseSchema } from '../src/integrations/sgp/types';

async function main() {
  const body = systemParams({ contrato: '103971', status: '1', limit: '5' });
  const { data } = await sgpClient.post('/api/central/titulos/', body.toString());
  const parsed = TitulosResponseSchema.parse(data);

  console.log(`status=1&limit=5 returned ${parsed.faturas.length} faturas (raw SGP order):`);
  for (const f of parsed.faturas) {
    console.log(`  id=${f.id} vencimento=${f.vencimento} statusid=${f.statusid} valor=${f.valor}`);
  }

  const nearest = [...parsed.faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  console.log('\ncomputed "nearest" (client-side sort of the 5 returned):', nearest?.vencimento);

  console.log('\n--- comparison: status=1&limit=20 (full open list) ---');
  const bodyFull = systemParams({ contrato: '103971', status: '1', limit: '20' });
  const { data: dataFull } = await sgpClient.post('/api/central/titulos/', bodyFull.toString());
  const parsedFull = TitulosResponseSchema.parse(dataFull);
  console.log(`status=1&limit=20 returned ${parsedFull.faturas.length} faturas:`);
  for (const f of parsedFull.faturas) {
    console.log(`  id=${f.id} vencimento=${f.vencimento} statusid=${f.statusid}`);
  }
  const trueNearest = [...parsedFull.faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  console.log('\ntrue nearest (full list, client-side sort):', trueNearest?.vencimento);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
