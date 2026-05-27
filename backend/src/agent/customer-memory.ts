import { supabase } from '../config/supabase';

export interface CustomerInsights {
  total_interactions: number;
  last_session_modes: string[];
  recurring_support: boolean;
  open_negotiation: boolean;
  churn_risk_active: boolean;
  days_since_first_contact: number;
  campaigns_received: string[];
}

export async function getCustomerInsights(phone: string, _tenantId: string): Promise<CustomerInsights> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [threadResult, logsResult, negotiationsResult, bnCustomerResult] = await Promise.all([
    supabase
      .from('conversation_threads')
      .select('churn_risk, created_at')
      .eq('phone', phone)
      .maybeSingle(),
    supabase
      .from('interaction_logs')
      .select('session_mode, created_at')
      .eq('phone', phone)
      .order('created_at', { ascending: false }),
    supabase
      .from('billing_notifications')
      .select('id')
      .eq('phone', phone)
      .eq('type', 'negociacao')
      .eq('status', 'registered')
      .gte('sent_at', thirtyDaysAgo)
      .limit(1),
    supabase
      .from('billing_notifications')
      .select('customer_id')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle(),
  ]);

  const thread = threadResult.data;
  const logs = logsResult.data ?? [];

  const last_session_modes = logs
    .filter((l) => l.session_mode != null)
    .slice(0, 5)
    .map((l) => l.session_mode as string);

  const supportInWindow = logs.filter(
    (l) => l.session_mode === 'support' && l.created_at >= thirtyDaysAgo,
  ).length;

  const customerId = bnCustomerResult.data?.customer_id as string | undefined;
  let campaigns_received: string[] = [];
  if (customerId) {
    const { data: campaignRows } = await supabase
      .from('campaign_sends')
      .select('type')
      .eq('customer_id', customerId);
    campaigns_received = [...new Set((campaignRows ?? []).map((r) => r.type as string))];
  }

  return {
    total_interactions:      logs.length,
    last_session_modes,
    recurring_support:       supportInWindow >= 2,
    open_negotiation:        (negotiationsResult.data?.length ?? 0) > 0,
    churn_risk_active:       thread?.churn_risk ?? false,
    days_since_first_contact: thread?.created_at
      ? Math.floor((Date.now() - new Date(thread.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0,
    campaigns_received,
  };
}

export function buildInsightsContext(insights: CustomerInsights): string {
  if (insights.total_interactions === 0) return '';

  const lines: string[] = [];

  if (insights.recurring_support) {
    lines.push('⚠️ Cliente com problemas recorrentes de suporte nos últimos 30 dias. Priorizar resolução, não vender.');
  }
  if (insights.churn_risk_active) {
    lines.push('⚠️ Cliente em risco de churn. Tom cuidadoso, verificar se há cortesia aplicável.');
  }
  if (insights.days_since_first_contact > 365) {
    lines.push('Cliente há mais de 1 ano. Tratamento preferencial.');
  }

  if (lines.length === 0) return '';
  return `\n\n## Histórico do cliente\n${lines.join('\n')}`;
}
