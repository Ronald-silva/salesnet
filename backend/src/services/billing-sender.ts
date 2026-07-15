import { whatsappService } from './whatsapp-service';
import { withRetry } from '../utils/retry';
import { markJobProcessing, markJobSent, markJobFailed } from '../lib/billing-dispatch-jobs';

/**
 * Envia um job de billing_dispatch_jobs com retry curto (1s/3s, 3 tentativas no total —
 * mesma disciplina de sendTextWithDeliveryStatus em processor.ts) e SEMPRE resolve o
 * status do job (sent ou failed) — nunca deixa preso em 'processing' se sendText lançar.
 * Reusado tanto pelos crons da régua (Task 8) quanto pelo endpoint de teste manual (Task 9).
 */
export async function sendDispatchJob(
  jobId: string,
  tenantId: string,
  phone: string,
  message: string,
): Promise<{ status: 'sent'; providerMessageId: string } | { status: 'failed'; error: string }> {
  await markJobProcessing(jobId);

  try {
    const result = await withRetry(() => whatsappService.sendText(tenantId, phone, message), {
      delaysMs: [1000, 3000],
    });
    await markJobSent(jobId, message, result.messageId);
    return { status: 'sent', providerMessageId: result.messageId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await markJobFailed(jobId, errorMessage);
    return { status: 'failed', error: errorMessage };
  }
}
