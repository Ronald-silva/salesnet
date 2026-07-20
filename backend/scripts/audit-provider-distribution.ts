/** Read-only: llm_provider/model distribution, last 30 days. No writes. */
import { supabase } from '../src/config/supabase';

async function main() {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select('llm_provider, llm_model, session_mode')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const key = `${r.llm_provider ?? 'null'}::${r.llm_model ?? 'null'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [k, v] of counts) console.log(k, v);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
