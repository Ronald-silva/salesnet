/**
 * Read-only verification (Ronald, 2026-07-20): confirm whether the prospect-loop fix
 * (commits 637d52a/538e268/222b8af/c8db66c, pushed to origin/main at 2026-07-20T15:07:32-03:00)
 * holds up against real production traffic, not just the sandbox reproduction.
 *
 * Does NOT modify any table. Run with:
 *   npx ts-node --project tsconfig.json scripts/audit-prospect-loop-fix-live.ts
 */
import { supabase } from '../src/config/supabase';

const DEPLOY_PUSH_ISO = '2026-07-20T15:07:32-03:00'; // c8db66c push time (floor for deploy window)
const PRE_WINDOW_DAYS = 30;
const TEST_TENANT_HINTS = ['test-tenant', 'sandbox']; // exclude obvious diag/test tenants

interface ToolCallEntry {
  name: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

interface LogRow {
  id: string;
  phone: string;
  tenant_id: string;
  created_at: string;
  session_mode: string;
  tool_calls: ToolCallEntry[] | null;
  response: string | null;
}

function maskPhone(phone: string): string {
  return phone && phone.length > 4 ? `****${phone.slice(-4)}` : '****';
}

async function fetchLogsSince(sinceIso: string): Promise<LogRow[]> {
  const rows: LogRow[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('interaction_logs')
      .select('id, phone, tenant_id, created_at, session_mode, tool_calls, response')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`interaction_logs query failed: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as LogRow[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function main() {
  console.log(`[verify] now = ${new Date().toISOString()}`);
  console.log(`[verify] deploy push floor = ${DEPLOY_PUSH_ISO}`);
  const minutesSinceDeploy = (Date.now() - new Date(DEPLOY_PUSH_ISO).getTime()) / 60000;
  console.log(`[verify] minutes since push: ${minutesSinceDeploy.toFixed(1)}\n`);

  // ── Post-deploy window ──────────────────────────────────────────────────
  const postRows = await fetchLogsSince(DEPLOY_PUSH_ISO);
  const postRowsProd = postRows.filter(
    (r) => !TEST_TENANT_HINTS.some((h) => r.tenant_id?.toLowerCase().includes(h)),
  );
  console.log(`=== JANELA PÓS-DEPLOY (>= ${DEPLOY_PUSH_ISO}) ===`);
  console.log(`  total rows (todos tenants): ${postRows.length}`);
  console.log(`  total rows (excluindo tenants de teste): ${postRowsProd.length}`);
  const tenantCounts = new Map<string, number>();
  for (const r of postRows) tenantCounts.set(r.tenant_id, (tenantCounts.get(r.tenant_id) ?? 0) + 1);
  console.log(`  distribuição por tenant_id:`, Object.fromEntries(tenantCounts));

  const prospectRows = postRowsProd.filter((r) => r.session_mode === 'prospect');
  console.log(`\n  session_mode='prospect': ${prospectRows.length}`);
  const prospectWithRegistrar = prospectRows.filter((r) =>
    Array.isArray(r.tool_calls) && r.tool_calls.some((c) => c.name === 'registrar_interesse'),
  );
  console.log(`  desses, com registrar_interesse em tool_calls: ${prospectWithRegistrar.length}`);

  if (prospectRows.length > 0) {
    console.log('\n  detalhe das sessões prospect (phone mascarado):');
    for (const r of prospectRows) {
      console.log(
        `    id=${r.id} phone=${maskPhone(r.phone)} tenant=${r.tenant_id} at=${r.created_at}\n` +
        `      response="${String(r.response).slice(0, 300).replace(/\n/g, ' ')}"\n` +
        `      tool_calls=${JSON.stringify(r.tool_calls)}`,
      );
    }
  }

  // ── leads table since deploy ────────────────────────────────────────────
  const { data: leadsData, error: leadsError, count: leadsCount } = await supabase
    .from('leads')
    .select('id, created_at, tenant_id', { count: 'exact' })
    .gte('created_at', DEPLOY_PUSH_ISO)
    .order('created_at', { ascending: true });
  if (leadsError) {
    console.log(`\n[verify] leads query error: ${leadsError.message}`);
  } else {
    console.log(`\n=== leads criados desde o deploy: ${leadsCount ?? leadsData?.length ?? 0} ===`);
    for (const l of leadsData ?? []) console.log(`    id=${l.id} tenant=${l.tenant_id} at=${l.created_at}`);
  }

  // ── Opportunity check: did any real traffic even hit plans/coverage intent? ──
  const PLANS_RE = /\b(planos?|preços?|valores?|mensalidade|quanto custa)\b/i;
  const COVERAGE_RE = /\b(cobertura|bairro|atende|chega (na|no) minha (rua|casa))\b/i;
  const opportunityRows = postRowsProd.filter(
    (r) => PLANS_RE.test(r.response ?? '') || false,
  );
  console.log(`\n=== Oportunidade de bug (heurística sobre linhas pós-deploy) ===`);
  console.log(`  total mensagens (linhas interaction_logs) pós-deploy, tenant produção: ${postRowsProd.length}`);
  console.log(`  session_mode distribution:`, Object.fromEntries(
    [...postRowsProd.reduce((m, r) => m.set(r.session_mode, (m.get(r.session_mode) ?? 0) + 1), new Map<string, number>())],
  ));

  // ── Pre-deploy baseline (last 30 days before fix) for contrast ──────────
  const before = new Date(new Date(DEPLOY_PUSH_ISO).getTime() - PRE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const preRows = await fetchLogsSince(before);
  const preBeforeDeploy = preRows.filter((r) => r.created_at < DEPLOY_PUSH_ISO);
  const preProd = preBeforeDeploy.filter(
    (r) => !TEST_TENANT_HINTS.some((h) => r.tenant_id?.toLowerCase().includes(h)),
  );
  const preProspect = preProd.filter((r) => r.session_mode === 'prospect');
  console.log(`\n=== BASELINE PRÉ-DEPLOY (últimos ${PRE_WINDOW_DAYS} dias antes do push) ===`);
  console.log(`  total rows produção: ${preProd.length}`);
  console.log(`  session_mode='prospect': ${preProspect.length}`);

  console.log('\n[verify] done — no rows modified.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[verify] fatal error:', err);
    process.exit(1);
  });
