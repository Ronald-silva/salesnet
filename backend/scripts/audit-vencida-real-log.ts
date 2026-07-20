/**
 * Read-only audit (2026-07-20): pull the REAL interaction_logs row for Ronald's
 * live test (CPF 02284204317 / contract 103971) to see the actual tool_calls and
 * actual LLM response text, instead of re-deriving from a fresh SGP call (which
 * may reflect state that has since changed).
 */
import { supabase } from '../src/config/supabase';

async function main() {
  const { data, error } = await supabase
    .from('interaction_logs')
    .select('id, phone, created_at, session_mode, tool_calls, response, delivery_status')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('query failed:', error.message);
    return;
  }

  for (const row of data ?? []) {
    const toolCallsStr = JSON.stringify(row.tool_calls ?? []);
    if (toolCallsStr.includes('02284204317') || toolCallsStr.includes('103971') || (row.response ?? '').includes('vencida')) {
      console.log('=== MATCH ===');
      console.log('id:', row.id, 'created_at:', row.created_at, 'phone:', row.phone, 'session_mode:', row.session_mode);
      console.log('delivery_status:', row.delivery_status);
      console.log('tool_calls:', JSON.stringify(row.tool_calls, null, 2));
      console.log('response:', row.response);
      console.log();
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
