/**
 * Dry-run somente leitura: mostra os recipients elegíveis por estágio e a decisão
 * financeira de hoje. Nunca envia WhatsApp nem cria billing_dispatch_jobs.
 *
 * Run: npx ts-node --project tsconfig.json scripts/billing-recipients-dry-run.ts
 */
import { isCpfSendAllowed } from '../src/automations/billing-allowlist';
import { getBillingStatusForAllowlist, hasOpenInvoice } from '../src/integrations/sgp/billing';
import { listActiveEligibleRecipients } from '../src/lib/billing-recipients';

const STAGES: Array<{ dispatchStage: string; sgpStage: string }> = [
  { dispatchStage: 'd5_habitual', sgpStage: 'd5' },
  { dispatchStage: 'd3', sgpStage: 'd3' },
  { dispatchStage: 'd2_habitual', sgpStage: 'd2' },
  { dispatchStage: 'd2_regular', sgpStage: 'd2' },
  { dispatchStage: 'd0', sgpStage: 'd0' },
  { dispatchStage: 'overdue_d3', sgpStage: 'd3_overdue' },
  { dispatchStage: 'suspended_d5', sgpStage: 'd5_overdue' },
];

function maskCpf(cpf: string): string {
  return cpf.length >= 11 ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}` : '***';
}

async function main(): Promise<void> {
  console.log('[dry-run] billing_recipients ativos por estágio — nada será enviado ou gravado.\n');

  for (const { dispatchStage, sgpStage } of STAGES) {
    const recipients = await listActiveEligibleRecipients('salesnet-default', dispatchStage);
    if (recipients.length === 0) {
      console.log(`--- estágio ${dispatchStage} --- nenhum recipient elegível hoje\n`);
      continue;
    }

    const statuses = await getBillingStatusForAllowlist(recipients.map((recipient) => recipient.cpf));
    const matched = statuses.filter((status) => status.stage === sgpStage);
    console.log(`--- ${dispatchStage} (SGP=${sgpStage}) — ${recipients.length} elegível(is), ${matched.length} na janela ---`);

    for (const entry of matched) {
      const allowed = isCpfSendAllowed(entry.document);
      const stillOpen = await hasOpenInvoice(entry.customerId);
      const decision = !allowed
        ? 'BLOQUEADO: filtro adicional BILLING_ALLOWLIST_CPFS'
        : !stillOpen
          ? 'NÃO ENVIARIA: fatura já paga'
          : 'ENVIARIA';

      console.log(`  CPF ${maskCpf(entry.document)} · contrato ${entry.customerId} · ${entry.name}`);
      console.log(`    vencimento=${entry.dueDate} valor=R$${entry.amount.toFixed(2)} PIX=${entry.pixCode ? 'sim' : 'não'}`);
      console.log(`    decisão: ${decision}`);
    }
    console.log('');
  }

  console.log('[dry-run] nenhuma mensagem enviada; nenhuma linha criada em billing_dispatch_jobs.');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('[dry-run] fatal error:', error);
    process.exit(1);
  });
