import { supabase } from '../src/config/supabase';

async function main() {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select('*')
    .eq('id', 'e27b7b71-60f3-42fa-a16d-fd4ffdf49c63')
    .single();
  if (error) { console.error(error); return; }
  console.log(JSON.stringify(data, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
