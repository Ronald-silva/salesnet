import { supabase } from '../config/supabase';

export type DispatchJobStatus = 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'skipped' | 'paid' | 'paused';

export interface DispatchJobRow {
  id: string;
  billing_recipient_id: string;
  contract_id: string;
  stage: string;
  scheduled_for: string;
  status: DispatchJobStatus;
  attempt_count: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  message: string | null;
  phone: string;
  provider_message_id: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export function buildIdempotencyKey(contractId: string, stage: string, scheduledFor: string): string {
  return `${contractId}:${stage}:${scheduledFor}`;
}

/** null (não erro) em conflito de idempotency_key — caller trata como "já agendado/enviado hoje". */
export async function createPendingJob(input: {
  billingRecipientId: string;
  contractId: string;
  stage: string;
  scheduledFor: string;
  phone: string;
}): Promise<DispatchJobRow | null> {
  const { data, error } = await supabase
    .from('billing_dispatch_jobs')
    .insert({
      billing_recipient_id: input.billingRecipientId,
      contract_id: input.contractId,
      stage: input.stage,
      scheduled_for: input.scheduledFor,
      phone: input.phone,
      idempotency_key: buildIdempotencyKey(input.contractId, input.stage, input.scheduledFor),
    })
    .select('*')
    .single();

  if (error) {
    if (error.code !== '23505') {
      console.error('[billing-dispatch-jobs] createPendingJob failed:', error.message);
    }
    return null;
  }
  return data as DispatchJobRow;
}

export async function markJobProcessing(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('billing_dispatch_jobs')
    .update({ status: 'processing', last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) console.error('[billing-dispatch-jobs] markJobProcessing failed:', error.message);
}

export async function markJobSent(jobId: string, message: string, providerMessageId: string | null): Promise<void> {
  const { error } = await supabase
    .from('billing_dispatch_jobs')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      message,
      provider_message_id: providerMessageId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) console.error('[billing-dispatch-jobs] markJobSent failed:', error.message);
}

export async function markJobFailed(jobId: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from('billing_dispatch_jobs')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (error) console.error('[billing-dispatch-jobs] markJobFailed failed:', error.message);
}

export async function markJobPaid(jobId: string): Promise<void> {
  const { error } = await supabase
    .from('billing_dispatch_jobs')
    .update({ status: 'paid', updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) console.error('[billing-dispatch-jobs] markJobPaid failed:', error.message);
}

export async function listJobsForRecipient(recipientId: string): Promise<DispatchJobRow[]> {
  const { data, error } = await supabase
    .from('billing_dispatch_jobs')
    .select('*')
    .eq('billing_recipient_id', recipientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[billing-dispatch-jobs] listJobsForRecipient failed:', error.message);
    return [];
  }
  return (data ?? []) as DispatchJobRow[];
}

/** Substitui a antiga leitura de billing_notifications (getHabitualLatePayerIds em integrations/sgp/billing.ts). */
export async function getHabitualLatePayerContractIds(minOverdueCount = 2, monthsBack = 6): Promise<Set<string>> {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const { data, error } = await supabase
    .from('billing_dispatch_jobs')
    .select('contract_id')
    .eq('status', 'sent')
    .in('stage', ['overdue_d3', 'suspended_d5'])
    .gte('created_at', since.toISOString());

  if (error) {
    console.error('[billing-dispatch-jobs] getHabitualLatePayerContractIds failed:', error.message);
    return new Set();
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ contract_id: string }>) {
    counts.set(row.contract_id, (counts.get(row.contract_id) ?? 0) + 1);
  }

  const ids = new Set<string>();
  for (const [id, count] of counts) {
    if (count >= minOverdueCount) ids.add(id);
  }
  return ids;
}
