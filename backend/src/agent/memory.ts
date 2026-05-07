import { supabase } from '../config/supabase';

export interface MessageEntry {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ThreadRow {
  id: string;
  phone: string;
  messages: MessageEntry[];
  human_mode: boolean;
  churn_risk: boolean;
  created_at: string;
  updated_at: string;
}

const MAX_HISTORY = 20;

export async function getThread(phone: string): Promise<ThreadRow> {
  const { data: existing } = await supabase
    .from('conversation_threads')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) return existing as ThreadRow;

  const { data: created, error } = await supabase
    .from('conversation_threads')
    .insert({ phone, messages: [], human_mode: false, churn_risk: false })
    .select()
    .single();

  if (error) throw new Error(`Failed to create thread: ${error.message}`);
  return created as ThreadRow;
}

export async function saveMessage(
  phone: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  const thread = await getThread(phone);
  const entry: MessageEntry = { role, content, timestamp: new Date().toISOString() };
  const messages = [...thread.messages, entry].slice(-MAX_HISTORY);

  const { error } = await supabase
    .from('conversation_threads')
    .update({ messages, updated_at: new Date().toISOString() })
    .eq('phone', phone);

  if (error) throw new Error(`Failed to save message: ${error.message}`);
}

export async function isHumanMode(phone: string): Promise<boolean> {
  const { data } = await supabase
    .from('conversation_threads')
    .select('human_mode')
    .eq('phone', phone)
    .maybeSingle();

  return data?.human_mode ?? false;
}

export async function setHumanMode(phone: string, active: boolean): Promise<void> {
  const { error } = await supabase
    .from('conversation_threads')
    .upsert({ phone, human_mode: active }, { onConflict: 'phone' });

  if (error) throw new Error(`Failed to set human mode: ${error.message}`);
}
