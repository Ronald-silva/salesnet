/**
 * One-off action script (authorized by Ronald 2026-07-20, Item 3 step 7
 * troubleshooting): resets conversation_threads.human_mode to false for
 * TEST_SANDBOX_PHONE. Discovered via diag-check-tier-downgraded-schema.ts that
 * human_mode was true on the sandbox thread, silently short-circuiting every
 * processMessage() call before any logging — unrelated to the tier_downgraded
 * migration/schema-cache issue, but blocking every live diagnostic against
 * this number until reset.
 *
 * assertSandboxNumber() enforced per CLAUDE.md "Política de testes ao vivo
 * contra produção" — this only ever targets the sandbox phone, never a real
 * customer/team number.
 *
 * Run with: npx ts-node --project tsconfig.json scripts/diag-reset-sandbox-human-mode.ts
 */
import { assertSandboxNumber } from '../src/utils/test-sandbox';
import { env } from '../src/config/env';
import { supabase } from '../src/config/supabase';

async function main() {
  const phone = env.TEST_SANDBOX_PHONE!;
  assertSandboxNumber(phone);
  const tenantId = env.DEFAULT_TENANT_ID;

  const { data: before } = await supabase
    .from('conversation_threads')
    .select('human_mode, status, updated_at')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  console.log('[reset] before:', JSON.stringify(before));

  const { error } = await supabase
    .from('conversation_threads')
    .update({ human_mode: false })
    .eq('phone', phone)
    .eq('tenant_id', tenantId);
  if (error) throw new Error(`update failed: ${error.message}`);

  const { data: after } = await supabase
    .from('conversation_threads')
    .select('human_mode, status, updated_at')
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  console.log('[reset] after:', JSON.stringify(after));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
