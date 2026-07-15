/**
 * Teste ao vivo controlado para o sandbox configurado em TEST_SANDBOX_PHONE.
 * Usa o mesmo fluxo do botão administrativo: recipient -> job stage=test -> sender.
 *
 * Run: npx ts-node --project tsconfig.json scripts/billing-recipients-live-test.ts
 */
import { env } from '../src/config/env';
import { createPendingJob } from '../src/lib/billing-dispatch-jobs';
import { createBillingRecipient, listBillingRecipients } from '../src/lib/billing-recipients';
import { normalizePhone } from '../src/lib/phone';
import { sendDispatchJob } from '../src/services/billing-sender';
import { assertSandboxNumber } from '../src/utils/test-sandbox';

const TEST_MESSAGE = '[TESTE INTERNO SALESNET] Esta é uma mensagem de validação do sistema de lembretes automáticos. Nenhuma ação é necessária.';

async function main(): Promise<void> {
  const phone = env.TEST_SANDBOX_PHONE;
  if (!phone) {
    throw new Error('TEST_SANDBOX_PHONE não configurado; nenhum teste ao vivo será executado.');
  }
  assertSandboxNumber(phone);

  const normalizedPhone = normalizePhone(phone);
  const existing = (await listBillingRecipients(env.DEFAULT_TENANT_ID, 'all')).find(
    (recipient) => normalizePhone(recipient.phone) === normalizedPhone && recipient.removed_at === null,
  );
  const recipient = existing ?? await createSandboxRecipient(normalizedPhone);

  const job = await createPendingJob({
    billingRecipientId: recipient.id,
    contractId: recipient.contract_id,
    stage: 'test',
    scheduledFor: new Date().toISOString().split('T')[0]!,
    phone: normalizedPhone,
    idempotencyKey: `${recipient.contract_id}:test:${Date.now()}`,
  });
  if (!job) throw new Error('falha ao criar job de teste');

  const outcome = await sendDispatchJob(job.id, env.DEFAULT_TENANT_ID, normalizedPhone, TEST_MESSAGE);
  console.log('[live-test] outcome:', outcome);
  if (outcome.status === 'failed') process.exitCode = 1;
}

async function createSandboxRecipient(phone: string) {
  const result = await createBillingRecipient({
    tenantId: env.DEFAULT_TENANT_ID,
    contractId: `sandbox-${phone.replace(/\D/g, '')}`,
    cpf: '00000000191',
    customerName: 'SANDBOX — teste interno',
    phone,
    createdBy: 'live-test-script',
  });
  if (!result.ok) throw new Error(`falha ao criar recipient sandbox: ${result.error}`);
  return result.recipient;
}

main().catch((error: unknown) => {
  console.error('[live-test] fatal error:', error);
  process.exit(1);
});
