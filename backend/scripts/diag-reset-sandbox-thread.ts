/**
 * One-off cleanup: my two back-to-back live diagnostic runs against
 * TEST_SANDBOX_PHONE landed in the SAME conversation thread, so the second
 * run's LLM call saw the first run's exchange (about a different CPF) in its
 * history and got confused. Resetting the sandbox thread between diagnostic
 * runs avoids that cross-contamination. Only touches TEST_SANDBOX_PHONE's own
 * row — never a real customer's data.
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { supabase } from '../src/config/supabase';

async function main() {
  const sandboxPhone = env.TEST_SANDBOX_PHONE!;
  assertSandboxNumber(sandboxPhone);

  const { error } = await supabase
    .from('conversation_threads')
    .delete()
    .eq('phone', sandboxPhone)
    .eq('tenant_id', env.DEFAULT_TENANT_ID);

  if (error) {
    console.error('delete failed:', error.message);
    process.exit(1);
  }
  console.log(`conversation_threads reset for sandbox phone ${sandboxPhone} / tenant ${env.DEFAULT_TENANT_ID}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
