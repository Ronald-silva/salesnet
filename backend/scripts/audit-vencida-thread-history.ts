import { supabase } from '../src/config/supabase';

async function main() {
  const phone = '+558591993833';

  const { data: threads, error } = await supabase
    .from('conversation_threads')
    .select('tenant_id, cpf, messages, updated_at')
    .eq('phone', phone);

  if (error) console.error('query error:', error);

  for (const thread of threads ?? []) {
    console.log('=== tenant_id:', thread.tenant_id, '===');
    console.log('thread.cpf:', thread.cpf);
    console.log('thread.updated_at:', thread.updated_at);

    const msgs = (thread.messages ?? []) as Array<{ role: string; content: string }>;
    console.log(`${msgs.length} messages in thread. Last 20:`);
    for (const m of msgs.slice(-20)) {
      console.log(`[${m.role}] ${m.content.slice(0, 300)}`);
    }
    console.log();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('fatal:', e); process.exit(1); });
