/**
 * Read-only audit (2026-07-20): scan interaction_logs (last 7 days) for gerar_pix
 * tool calls, to check if the LLM generated PIX codes for invoices that were not
 * actually overdue/eligible at the time (mislabeling 'open' as 'vencida'/'atrasada'),
 * and whether any of this reached a REAL customer number (not Ronald's own test phone).
 */
import { supabase } from '../src/config/supabase';

const RONALD_PHONE = '+558591993833';

async function main() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('interaction_logs')
    .select('id, phone, created_at, tool_calls, response')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('query failed:', error.message);
    return;
  }

  let pixCallCount = 0;
  for (const row of data ?? []) {
    const toolCalls = (row.tool_calls ?? []) as Array<{ name: string; input: unknown; output: unknown }>;
    const pixCalls = toolCalls.filter((t) => t.name === 'gerar_pix');
    if (!pixCalls.length) continue;

    pixCallCount += pixCalls.length;
    const isRonald = row.phone === RONALD_PHONE;
    console.log(`\n=== interaction_logs id=${row.id} phone=${row.phone}${isRonald ? ' (RONALD TEST PHONE)' : ' *** REAL/OTHER NUMBER ***'} created_at=${row.created_at} ===`);
    for (const call of pixCalls) {
      console.log('  input:', JSON.stringify(call.input));
      console.log('  output:', JSON.stringify(call.output));
    }
  }

  console.log(`\n\nTotal gerar_pix calls in last 7 days: ${pixCallCount}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
