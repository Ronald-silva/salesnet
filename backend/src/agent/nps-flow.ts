import { supabase } from '../config/supabase';

type NpsPending = {
  sessionId: string;
  scheduledAt: Date;
  sent: boolean;
};

const pendingNps = new Map<string, NpsPending>();

export function getPendingNps(phone: string): NpsPending | undefined {
  return pendingNps.get(phone);
}

export function clearPendingNps(phone: string): void {
  pendingNps.delete(phone);
}

export async function shouldSendNps(phone: string, tenantId: string): Promise<boolean> {
  if (pendingNps.has(phone)) return false;

  // Query the last interaction log (called before inserting the current one,
  // so this reflects the previous session)
  const { data: log } = await supabase
    .from('interaction_logs')
    .select('created_at, session_mode')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!log) return false;

  const entry = log as { created_at: string; session_mode: string | null };

  if (entry.session_mode === 'prospect') return false;

  const lastAt = new Date(entry.created_at);
  const diffMs = Date.now() - lastAt.getTime();
  const thirtyMin = 30 * 60 * 1000;
  const twoHours  = 2 * 60 * 60 * 1000;

  if (diffMs < thirtyMin || diffMs > twoHours) return false;

  // Guard against sending NPS twice in the same window
  const windowStart = new Date(Date.now() - twoHours).toISOString();
  const { count } = await supabase
    .from('nps_responses')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .eq('tenant_id', tenantId)
    .gte('created_at', windowStart);

  return (count ?? 0) === 0;
}

export function parseNpsResponse(message: string): number | null {
  const trimmed = message.trim();
  if (!/^\d$/.test(trimmed)) return null;
  const n = parseInt(trimmed, 10);
  if (n < 1 || n > 5) return null;
  return n;
}

export async function saveNpsResponse(
  phone: string,
  tenantId: string,
  score: number,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.from('nps_responses').insert({
    phone,
    tenant_id: tenantId,
    score,
    session_id: sessionId,
  });
  if (error) throw new Error(`Failed to save NPS response: ${error.message}`);
}

export function scheduleNps(
  phone: string,
  tenantId: string,
  sessionId: string,
  sendFn: (tenantId: string, phone: string, text: string) => Promise<void>,
): void {
  const DELAY_MS = 30 * 60 * 1000;
  const state: NpsPending = { sessionId, scheduledAt: new Date(), sent: false };
  pendingNps.set(phone, state);

  setTimeout(() => {
    void (async () => {
      const current = pendingNps.get(phone);
      if (!current || current.sessionId !== sessionId) return;

      try {
        await sendFn(
          tenantId,
          phone,
          'Obrigada por falar com a SalesNet! 😊\n\nDe *1 a 5*, como você avalia nosso atendimento?\n\n1 = Muito insatisfeito\n5 = Muito satisfeito',
        );
        current.sent = true;
      } catch (err) {
        console.error('[nps] failed to send NPS question:', err);
        pendingNps.delete(phone);
      }
    })();
  }, DELAY_MS);
}
