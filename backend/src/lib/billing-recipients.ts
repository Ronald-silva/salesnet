import { supabase } from '../config/supabase';

export interface BillingRecipient {
  id: string;
  tenant_id: string;
  contract_id: string;
  sgp_cliente_id: string | null;
  cpf: string;
  customer_name: string;
  phone: string;
  active: boolean;
  paused: boolean;
  stages_enabled: string[];
  channel: string;
  cadence_start_date: string;
  next_dispatch_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  paused_at: string | null;
  paused_by: string | null;
  removed_at: string | null;
  removed_by: string | null;
  last_synced_at: string | null;
}

export interface CreateBillingRecipientInput {
  tenantId: string;
  contractId: string;
  sgpClienteId?: string;
  cpf: string;
  customerName: string;
  phone: string;
  stagesEnabled?: string[];
  cadenceStartDate?: string;
  notes?: string;
  createdBy: string;
}

const DEFAULT_STAGES = ['d5_habitual', 'd3', 'd2_habitual', 'd2_regular', 'd0', 'overdue_d3', 'suspended_d5'];

export async function listBillingRecipients(
  tenantId: string,
  filter: 'active' | 'paused' | 'removed' | 'all',
): Promise<BillingRecipient[]> {
  let query = supabase.from('billing_recipients').select('*').eq('tenant_id', tenantId);

  if (filter === 'active') query = query.eq('active', true).eq('paused', false).is('removed_at', null);
  else if (filter === 'paused') query = query.eq('paused', true).is('removed_at', null);
  else if (filter === 'removed') query = query.not('removed_at', 'is', null);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('[billing-recipients] listBillingRecipients failed:', error.message);
    return [];
  }
  return (data ?? []) as BillingRecipient[];
}

export async function getBillingRecipientById(id: string): Promise<BillingRecipient | null> {
  const { data, error } = await supabase.from('billing_recipients').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data as BillingRecipient;
}

export async function createBillingRecipient(
  input: CreateBillingRecipientInput,
): Promise<{ ok: true; recipient: BillingRecipient } | { ok: false; error: 'duplicate' | 'unknown'; message?: string }> {
  const { data, error } = await supabase
    .from('billing_recipients')
    .insert({
      tenant_id: input.tenantId,
      contract_id: input.contractId,
      sgp_cliente_id: input.sgpClienteId ?? null,
      cpf: input.cpf,
      customer_name: input.customerName,
      phone: input.phone,
      stages_enabled: input.stagesEnabled ?? DEFAULT_STAGES,
      cadence_start_date: input.cadenceStartDate ?? new Date().toISOString().split('T')[0],
      notes: input.notes ?? null,
      created_by: input.createdBy,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'duplicate' };
    console.error('[billing-recipients] createBillingRecipient failed:', error.message);
    return { ok: false, error: 'unknown', message: error.message };
  }
  return { ok: true, recipient: data as BillingRecipient };
}

export async function pauseBillingRecipient(id: string, pausedBy: string): Promise<boolean> {
  const { error } = await supabase
    .from('billing_recipients')
    .update({ paused: true, paused_at: new Date().toISOString(), paused_by: pausedBy, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[billing-recipients] pauseBillingRecipient failed:', error.message);
  return !error;
}

export async function reactivateBillingRecipient(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('billing_recipients')
    .update({ paused: false, paused_at: null, paused_by: null, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[billing-recipients] reactivateBillingRecipient failed:', error.message);
  return !error;
}

export async function removeBillingRecipient(id: string, removedBy: string): Promise<boolean> {
  const { error } = await supabase
    .from('billing_recipients')
    .update({ active: false, removed_at: new Date().toISOString(), removed_by: removedBy, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('[billing-recipients] removeBillingRecipient failed:', error.message);
  return !error;
}

export async function updateBillingRecipientConfig(
  id: string,
  patch: { stagesEnabled?: string[]; notes?: string; cadenceStartDate?: string; channel?: string },
): Promise<boolean> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.stagesEnabled !== undefined) update['stages_enabled'] = patch.stagesEnabled;
  if (patch.notes !== undefined) update['notes'] = patch.notes;
  if (patch.cadenceStartDate !== undefined) update['cadence_start_date'] = patch.cadenceStartDate;
  if (patch.channel !== undefined) update['channel'] = patch.channel;

  const { error } = await supabase.from('billing_recipients').update(update).eq('id', id);
  if (error) console.error('[billing-recipients] updateBillingRecipientConfig failed:', error.message);
  return !error;
}

/** Fail-safe: qualquer erro de consulta retorna [] — nunca "todos autorizados". */
export async function listActiveEligibleRecipients(tenantId: string, stage: string): Promise<BillingRecipient[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('billing_recipients')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('active', true)
    .eq('paused', false)
    .is('removed_at', null)
    .lte('cadence_start_date', today)
    .contains('stages_enabled', [stage]);

  if (error) {
    console.error('[billing-recipients] listActiveEligibleRecipients failed — returning [] (fail-safe):', error.message);
    return [];
  }
  return (data ?? []) as BillingRecipient[];
}
