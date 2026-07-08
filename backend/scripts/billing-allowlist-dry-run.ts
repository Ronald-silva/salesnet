/**
 * Dry-run (read-only): computes the real billing stage (D-5/D-2/D0/D+3/D+5) for each of
 * the 4 CPFs in BILLING_SEND_ALLOWLIST against production SGP, WITHOUT sending anything.
 * Requested by Ronald before authorizing any real send — see project memory
 * project_billing_allowlist_restriction.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/billing-allowlist-dry-run.ts
 */
import { BILLING_SEND_ALLOWLIST } from '../src/automations/billing-allowlist';
import { getBillingStatusForAllowlist } from '../src/integrations/sgp/billing';

function maskCpf(cpf: string): string {
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`;
}

async function main() {
  console.log(`[dry-run] resolving billing status for ${BILLING_SEND_ALLOWLIST.length} allowlisted CPF(s) — NO messages will be sent\n`);

  const entries = await getBillingStatusForAllowlist(BILLING_SEND_ALLOWLIST);
  const resolvedCpfs = new Set(entries.map((e) => e.document));

  for (const cpf of BILLING_SEND_ALLOWLIST) {
    if (!resolvedCpfs.has(cpf)) {
      console.log(`--- CPF ${maskCpf(cpf)} ---`);
      console.log(`  NÃO resolvido: sem fatura em aberto, CPF não encontrado no SGP, ou erro de lookup (ver logs [billing] acima).`);
      console.log('');
    }
  }

  for (const e of entries) {
    console.log(`--- CPF ${maskCpf(e.document)} (contrato ${e.customerId}) — ${e.name} ---`);
    console.log(`  vencimento=${e.dueDate}  valor=R$${e.amount.toFixed(2)}  dias_ate_vencimento=${e.daysUntilDue}`);
    console.log(`  estágio=${e.stage ?? 'NENHUM (fora das janelas D-5/D-2/D0/D+3/D+5 hoje)'}`);
    console.log(`  pix_disponivel=${e.pixCode ? 'sim (codigopix em cache)' : 'não (mensagem seguiria sem linha de PIX)'}`);
    console.log('');
  }

  const byStage = new Map<string, number>();
  for (const e of entries) {
    if (!e.stage) continue;
    byStage.set(e.stage, (byStage.get(e.stage) ?? 0) + 1);
  }

  console.log('[dry-run] resumo por estágio:');
  for (const stage of ['d5', 'd2', 'd0', 'd3_overdue', 'd5_overdue']) {
    console.log(`  ${stage}: ${byStage.get(stage) ?? 0}`);
  }
  console.log('\n[dry-run] NENHUMA mensagem foi enviada. NENHUMA linha foi gravada em billing_notifications.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[dry-run] fatal error:', err);
    process.exit(1);
  });
