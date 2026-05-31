import { Router, type Request, type Response } from 'express';
import {
  supabase,
  getSupabaseKeyRole,
  getSupabaseKeyProjectRef,
  getSupabaseUrlProjectRef,
  isSupabaseServiceRoleKey,
  getSupabaseKeyFingerprint,
  getNormalizedSupabaseKey,
  getNormalizedSupabaseUrl,
  isSupabaseKeyExpired,
  isCanonicalSupabaseUrl,
  inferPostgrestRoleFromHint,
} from '../config/supabase';
import { env } from '../config/env';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';

type CheckResult = { ok: boolean; latencyMs?: number };

async function checkSupabaseDirectRest(): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> {
  const url = getNormalizedSupabaseUrl();
  const key = getNormalizedSupabaseKey();
  try {
    const res = await fetch(`${url}/rest/v1/whatsapp_instances?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, status: res.status, error: body.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function checkSupabase(): Promise<
  CheckResult & {
    latencyMs: number;
    error?: string;
    code?: string;
    restDirectOk?: boolean;
    restDirectStatus?: number;
    restDirectError?: string;
    postgrestHint?: string | null;
    postgrestRole?: string | null;
    hint?: string;
  }
> {
  const start = Date.now();
  const [clientResult, directResult] = await Promise.all([
    supabase.from('whatsapp_instances').select('id').limit(1),
    checkSupabaseDirectRest(),
  ]);
  const error = clientResult.error;
  const permissionDenied = Boolean(error?.message && /permission denied/i.test(error.message));
  let hint: string | undefined;
  if (error) {
    const effectiveRole = inferPostgrestRoleFromHint(error.hint);
    if (!isCanonicalSupabaseUrl()) {
      hint =
        'SUPABASE_URL must be https://<ref>.supabase.co (no /rest/v1). Check Railway Variables and Supabase plugin overrides.';
    } else if (effectiveRole && effectiveRole !== 'service_role') {
      hint = `PostgREST effective role is "${effectiveRole}" (not service_role). JWT may be invalid on this host or wrong API key is active. Compare keyFp/keyLen with local curl.`;
    } else if (directResult.ok && permissionDenied) {
      hint = 'REST fetch OK but supabase-js client denied — check client auth options.';
    } else if (!directResult.ok && permissionDenied) {
      hint =
        'PostgREST denied access from this host. If local curl with the same key works, check Railway env overrides and SUPABASE_URL.';
    } else if (!isSupabaseServiceRoleKey()) {
      hint = 'SUPABASE_SERVICE_ROLE_KEY JWT payload role is not service_role.';
    }
  }
  return {
    ok: !error,
    latencyMs: Date.now() - start,
    ...(error
      ? {
          error: error.message,
          code: error.code,
          postgrestHint: error.hint ?? null,
          postgrestRole: inferPostgrestRoleFromHint(error.hint),
        }
      : {}),
    restDirectOk: directResult.ok,
    restDirectStatus: directResult.status,
    ...(directResult.error ? { restDirectError: directResult.error } : {}),
    ...(hint ? { hint } : {}),
  };
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
      supabaseUrl?: string;
      urlCanonical?: boolean;
      urlProjectRef?: string | null;
      jwtProjectRef?: string | null;
      projectRefMatch?: boolean;
      restDirectOk?: boolean;
      restDirectStatus?: number;
      restDirectError?: string;
      postgrestHint?: string | null;
      postgrestRole?: string | null;
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
        supabaseUrl: getNormalizedSupabaseUrl(),
        urlCanonical: isCanonicalSupabaseUrl(),
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
