import { supabase } from '../config/supabase';
import { env } from '../config/env';

export interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ThreadRow {
  id: string;
  phone: string;
  tenant_id?: string;
  cpf?: string | null;
  messages: MessageEntry[];
  human_mode: boolean;
  churn_risk: boolean;
  created_at: string;
  updated_at: string;
}

const MAX_HISTORY = 20;

function resolveTenantId(tenantId?: string): string {
  return tenantId ?? env.DEFAULT_TENANT_ID;
}

export async function getThread(phone: string, tenantId?: string): Promise<ThreadRow> {
  const tid = resolveTenantId(tenantId);
  const { data: existing } = await supabase
    .from('conversation_threads')
    .select('*')
    .eq('phone', phone)
    .eq('tenant_id', tid)
    .maybeSingle();

  if (existing) return existing as ThreadRow;

  const { data: created, error } = await supabase
    .from('conversation_threads')
    .insert({
      phone,
      tenant_id: tid,
      messages: [],
      human_mode: false,
      churn_risk: false,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create thread: ${error.message}`);
  return created as ThreadRow;
}

export async function saveMessage(
  phone: string,
  role: 'user' | 'assistant',
  content: string,
  tenantId?: string,
): Promise<void> {
  const tid = resolveTenantId(tenantId);
  const thread = await getThread(phone, tid);
  const entry: MessageEntry = { role, content, timestamp: new Date().toISOString() };
  const messages = [...thread.messages, entry].slice(-MAX_HISTORY);

  const { error } = await supabase
    .from('conversation_threads')
    .update({ messages, updated_at: new Date().toISOString() })
    .eq('phone', phone)
    .eq('tenant_id', tid);

  if (error) throw new Error(`Failed to save message: ${error.message}`);
}

export async function isHumanMode(phone: string, tenantId?: string): Promise<boolean> {
  const tid = resolveTenantId(tenantId);
  const { data } = await supabase
    .from('conversation_threads')
    .select('human_mode')
    .eq('phone', phone)
    .eq('tenant_id', tid)
    .maybeSingle();

  return data?.human_mode ?? false;
}

export async function setHumanMode(
  phone: string,
  active: boolean,
  tenantId?: string,
): Promise<void> {
  const tid = resolveTenantId(tenantId);
  const { error } = await supabase
    .from('conversation_threads')
    .upsert(
      { phone, tenant_id: tid, human_mode: active },
      { onConflict: 'tenant_id,phone' },
    );

  if (error) throw new Error(`Failed to set human mode: ${error.message}`);
}

export async function getThreadCpf(phone: string, tenantId?: string): Promise<string | null> {
  const tid = resolveTenantId(tenantId);
  const { data } = await supabase
    .from('conversation_threads')
    .select('cpf')
    .eq('phone', phone)
    .eq('tenant_id', tid)
    .maybeSingle();

  return (data?.cpf as string | null | undefined) ?? null;
}

export async function persistThreadCpf(
  phone: string,
  tenantId: string | undefined,
  cpf: string,
): Promise<void> {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return;

  const tid = resolveTenantId(tenantId);
  const { error } = await supabase
    .from('conversation_threads')
    .upsert(
      { phone, tenant_id: tid, cpf: clean },
      { onConflict: 'tenant_id,phone' },
    );

  if (error) console.warn('[memory] persistThreadCpf failed:', error.message);
}
