import { Router, type Request, type Response } from 'express';
import {
  supabase,
  getSupabaseKeyRole,
  getSupabaseKeyProjectRef,
  getSupabaseUrlProjectRef,
  isSupabaseServiceRoleKey,
  getSupabaseKeyFingerprint,
  getNormalizedSupabaseKey,
  isSupabaseKeyExpired,
} from '../config/supabase';
import { env } from '../config/env';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';

type CheckResult = { ok: boolean; latencyMs?: number };

async function checkSupabase(): Promise<CheckResult & { latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('whatsapp_instances').select('id').limit(1);
    const permissionDenied = Boolean(error?.message && /permission denied/i.test(error.message));
    const keyOk = isSupabaseServiceRoleKey();
    let hint: string | undefined;
    if (permissionDenied) {
      hint = keyOk
        ? 'JWT role is service_role but API still denied. DB grants are OK if SET ROLE service_role worked in SQL Editor. Re-copy the current service_role secret into Railway SUPABASE_SERVICE_ROLE_KEY (no quotes), compare keyFp with local .env, redeploy backend.'
        : 'SUPABASE_SERVICE_ROLE_KEY must be the service_role secret (Supabase → Settings → API), not anon/public.';
    }
    return {
      ok: !error,
      latencyMs: Date.now() - start,
      ...(error ? { error: error.message } : {}),
      ...(hint ? { hint } : {}),
    };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

async function checkEvolutionGo(): Promise<CheckResult> {
  if (env.WHATSAPP_PROVIDER !== 'evolution-go') {
    return { ok: true };
  }

  try {
    const provider = providerRegistry.get('evolution-go');
    const status = await provider.getInstanceStatus(env.EVOLUTION_INSTANCE_NAME);
    return { ok: status.connected };
  } catch {
    return { ok: false };
  }
}

export async function buildHealthPayload(): Promise<{
  status: 'ok' | 'degraded' | 'down';
  uptime: number;
  timestamp: string;
  checks: {
    supabase: CheckResult & {
      latencyMs: number;
      keyRole?: string | null;
      keyOk?: boolean;
      keyFp?: string;
      keyLen?: number;
      keyExpired?: boolean;
      urlProjectRef?: string | null;
      jwtProjectRef?: string | null;
      projectRefMatch?: boolean;
    };
    evolutionGo: CheckResult;
  };
}> {
  const [supabaseCheck, evolutionGoCheck] = await Promise.all([
    checkSupabase(),
    checkEvolutionGo(),
  ]);

  const supabaseOk = supabaseCheck.ok;
  const evolutionOk = evolutionGoCheck.ok;

  const status: 'ok' | 'degraded' | 'down' =
    supabaseOk && evolutionOk ? 'ok' : supabaseOk ? 'degraded' : 'down';

  const keyRole = getSupabaseKeyRole();
  const urlProjectRef = getSupabaseUrlProjectRef();
  const jwtProjectRef = getSupabaseKeyProjectRef();
  return {
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      supabase: {
        ...supabaseCheck,
        keyRole,
        keyOk: isSupabaseServiceRoleKey(),
        keyFp: getSupabaseKeyFingerprint(),
        keyLen: getNormalizedSupabaseKey().length,
        keyExpired: isSupabaseKeyExpired(),
        urlProjectRef,
        jwtProjectRef,
        projectRefMatch: urlProjectRef !== null && jwtProjectRef !== null && urlProjectRef === jwtProjectRef,
      },
      evolutionGo: evolutionGoCheck,
    },
  };
}

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const payload = await buildHealthPayload();
  const httpStatus = payload.status === 'down' ? 503 : 200;
  res.status(httpStatus).json(payload);
});

export { router as healthRouter };
