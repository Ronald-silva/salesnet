import { Router, type Request, type Response } from 'express';
import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { providerRegistry } from '../integrations/whatsapp/provider-registry';

type CheckResult = { ok: boolean; latencyMs?: number };

async function checkSupabase(): Promise<CheckResult & { latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const { error } = await supabase.from('whatsapp_instances').select('id').limit(1);
    return {
      ok: !error,
      latencyMs: Date.now() - start,
      ...(error ? { error: error.message } : {}),
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
  checks: { supabase: CheckResult & { latencyMs: number }; evolutionGo: CheckResult };
}> {
  const [supabaseCheck, evolutionGoCheck] = await Promise.all([
    checkSupabase(),
    checkEvolutionGo(),
  ]);

  const supabaseOk = supabaseCheck.ok;
  const evolutionOk = evolutionGoCheck.ok;

  const status: 'ok' | 'degraded' | 'down' =
    supabaseOk && evolutionOk ? 'ok' : supabaseOk ? 'degraded' : 'down';

  return {
    status,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: {
      supabase: supabaseCheck,
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
