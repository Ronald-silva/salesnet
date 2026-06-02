import { getAdminToken, getAdminRefreshToken, setAdminToken, clearAdminSession } from '@/lib/adminAuth';

const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api/admin`;

function headers(token?: string | null): HeadersInit {
  const t = token ?? getAdminToken();
  return t
    ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getAdminRefreshToken();
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { accessToken: string; refreshToken: string };
    setAdminToken(data.accessToken);
    // update refresh token too
    localStorage.setItem('salesnet_admin_refresh', data.refreshToken);
    return data.accessToken;
  } catch {
    return null;
  }
}

async function request<T>(path: string, init?: RequestInit, _retry = true): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });

  if (response.status === 401 && _retry) {
    const newToken = await tryRefresh();
    if (newToken) {
      const retried = await fetch(`${BASE}${path}`, {
        ...init,
        headers: { ...headers(newToken), ...(init?.headers ?? {}) },
      });
      if (retried.ok) return retried.json() as Promise<T>;
    }
    // refresh failed — clear session so AdminGuard redirects to login
    clearAdminSession();
    window.location.href = '/admin/login';
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export interface ConversationSummary {
  id: string;
  phone: string;
  name: string;
  lastText: string;
  mode: 'bot' | 'human';
  churnRisk: boolean;
  updatedAt: string;
  sessionMode: string | null;
}

export interface ConversationContext {
  nps: { score: number; date: string } | null;
  openTickets: number;
  activeSchedule: { date: string; period: string } | null;
}

export interface ConversationDetail {
  id: string;
  phone: string;
  human_mode: boolean;
  churn_risk: boolean;
  notes?: string | null;
  session_mode?: string | null;
  updated_at: string;
  messages: Array<{ role: string; content: string; timestamp?: string; source?: string }>;
  customer?: {
    name?: string;
    plan?: { name?: string };
    status?: string;
  } | null;
}

export interface InvoiceInfo {
  id: string;
  amount: number;
  dueDate: string;
  status: 'open' | 'paid' | 'overdue' | 'cancelled';
  pixCode?: string;
  canGeneratePix?: boolean;
  barcode?: string;
  link?: string;
}

export interface DashboardMetrics {
  totalConversations: number;
  botResolutionRate: number;
  recoveredRevenue: number;
  newLeadsFromBot: number;
  activeChurnRisks: number;
  campaignsSent: number;
  campaignResponseRate: number;
  trend: Array<{ label: string; conversations: number }>;
}

export interface CampaignStat {
  type: string;
  totalSent: number;
  lastSentAt: string;
}

export interface ChurnRiskItem {
  id: string;
  customer_id: string;
  name: string;
  plan: string;
  reason: string;
  level: 'low' | 'medium' | 'high';
  nps_score: number | null;
  created_at: string;
  status: string;
}

export interface LeadItem {
  id: string;
  phone: string;
  name: string | null;
  neighborhood: string | null;
  desired_plan: string | null;
  notes: string | null;
  status: 'new' | 'contacted' | 'converted' | 'lost';
  created_at: string;
}

export interface TicketItem {
  id: string;
  phone: string;
  contrato: string;
  sgp_chamado_id: string | null;
  tipo: string;
  descricao: string;
  status: 'aberto' | 'em_andamento' | 'resolvido';
  customer_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface NpsReport {
  period_days: number;
  total: number;
  average: number | null;
  distribution: Record<string, number>;
  detractors: Array<{ phone: string; score: number; created_at: string }>;
}

export interface OutageReport {
  period_days: number;
  total: number;
  neighborhoods: Array<{ neighborhood: string; count: number; lastReportedAt: string }>;
}

export interface FinanceReport {
  period_days: number;
  total_notifications: number;
  negociacoes: number;
  recovered_revenue: number;
  by_type: Array<{ type: string; count: number }>;
}

export interface BusinessConfig {
  business: {
    providerName: string;
    agentName: string;
    agentGender: 'f' | 'm';
    city: string;
    whatsappSupportHours: string;
    humanSupportHours?: string;
    installationFeeReais: number;
    installationDaysMax: number;
    loyaltyMonths: number;
    tvAddonMonthly?: number;
    earlyPaymentDiscountPct?: number;
    paymentMethods: string[];
  };
  plans: Array<{ name: string; downloadMbps: number; uploadMbps: number; priceMonthly: number; popular?: boolean }>;
  coveredNeighborhoods: string[];
  toneOverride: string | null;
  llmDailyBudget: number | null;
}

export type BusinessConfigPatch = Partial<{
  business: Partial<BusinessConfig['business']>;
  plans: BusinessConfig['plans'];
  coveredNeighborhoods: string[];
  toneOverride: string | null;
  llmDailyBudget: number | null;
}>;

export interface WhatsAppInstance {
  id: string;
  instanceName: string;
  status?: string;
  tenant_id?: string;
}

export type AlertType =
  | 'outage_cluster'
  | 'billing_spike'
  | 'churn_wave'
  | 'slow_speed_cluster'
  | 'nps_drop';

export type AlertStatus = 'open' | 'acknowledged' | 'resolved';

export interface OperationalAlert {
  id: string;
  tenant_id: string;
  alert_type: AlertType;
  affected_area: string | null;
  affected_count: number | null;
  details: Record<string, unknown> | null;
  status: AlertStatus;
  created_at: string;
  resolved_at: string | null;
}

export interface AlertsResponse {
  data: OperationalAlert[];
  openCount: number;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: { id: string; email: string; role: 'admin' } }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getConversations: (filter: string, search: string) =>
    request<ConversationSummary[]>(
      `/conversations?filter=${encodeURIComponent(filter)}&search=${encodeURIComponent(search)}`
    ),

  getConversation: (id: string) => request<ConversationDetail>(`/conversations/${id}`),
  setHumanMode: (id: string, active: boolean) =>
    request<{ ok: true; active: boolean }>(`/conversations/${id}/human-mode`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    }),
  reply: (id: string, message: string) =>
    request<{ ok: true }>(`/conversations/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  getMetrics: () => request<DashboardMetrics>('/metrics'),
  getCampaigns: () => request<CampaignStat[]>('/campaigns'),
  runExpansionCampaign: (neighborhood: string, message: string) =>
    request<{ ok: true; sent: number }>('/campaigns/expansion', {
      method: 'POST',
      body: JSON.stringify({ neighborhood, message }),
    }),
  getChurnRisks: () => request<ChurnRiskItem[]>('/churn-risks'),
  churnOutreach: (id: string) =>
    request<{ ok: true }>(`/campaigns/churn-outreach/${id}`, { method: 'POST' }),

  getConversationInvoice: (id: string) =>
    request<InvoiceInfo | null>(`/conversations/${id}/invoice`),
  generatePix: (id: string) =>
    request<{ pixCode: string }>(`/conversations/${id}/generate-pix`, { method: 'POST' }),
  getConversationContext: (id: string) =>
    request<ConversationContext>(`/conversations/${id}/context`),

  getLeads: (status: string) =>
    request<LeadItem[]>(`/leads?status=${encodeURIComponent(status)}`),
  updateLead: (id: string, patch: { status?: string; notes?: string }) =>
    request<{ ok: true }>(`/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  getTickets: (status: string) =>
    request<TicketItem[]>(`/tickets?status=${encodeURIComponent(status)}`),
  updateTicket: (id: string, status: string) =>
    request<{ ok: true }>(`/tickets/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  getNps: (days: number) => request<NpsReport>(`/nps?days=${days}`),
  getOutages: (days: number) => request<OutageReport>(`/outages?days=${days}`),
  getFinance: (days: number) => request<FinanceReport>(`/financeiro?days=${days}`),
  searchCustomer: (q: string) =>
    request<Record<string, unknown>>(`/customers/search?q=${encodeURIComponent(q)}`),

  getConfig: () => request<BusinessConfig>('/config'),
  updateConfig: (patch: BusinessConfigPatch) =>
    request<{ ok: true }>('/config', { method: 'PATCH', body: JSON.stringify(patch) }),

  getInstances: () => request<{ instances: WhatsAppInstance[] }>('/instances'),
  createInstance: (instanceName: string) =>
    request<{ instance: WhatsAppInstance }>('/instances', {
      method: 'POST',
      body: JSON.stringify({ instanceName }),
    }),
  getInstanceQr: (id: string) =>
    request<{ qrCode: string; pairingCode?: string }>(`/instances/${id}/qrcode`),
  deleteInstance: (id: string) =>
    request<{ ok: true }>(`/instances/${id}`, { method: 'DELETE' }),

  getWhatsAppStatus: () =>
    request<{ connected: boolean; state: string; phoneNumber?: string }>('/whatsapp/status'),
  getWhatsAppQR: () =>
    request<{ qrCode: string }>('/whatsapp/qr'),
  getRoiReport: (days: number) =>
    request<RoiReport>(`/reports/roi?days=${days}`),

  getSchedules: (params: ScheduleQuery) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.period) qs.set('period', params.period);
    if (params.date) qs.set('date', params.date);
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    return request<ScheduleListResponse>(`/schedules?${qs.toString()}`);
  },
  getTodaySchedules: () => request<ScheduleTodayResponse>('/schedules/today'),
  updateScheduleStatus: (id: string, status: ScheduleStatus) =>
    request<{ ok: true; status: ScheduleStatus }>(`/schedules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  rescheduleSchedule: (id: string, visit_date: string, period: SchedulePeriod) =>
    request<{ ok: true; visit_date: string; period: SchedulePeriod }>(`/schedules/${id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ visit_date, period }),
    }),
  cancelSchedule: (id: string) =>
    request<{ ok: true }>(`/schedules/${id}`, { method: 'DELETE' }),
  offerBringForward: (id: string) =>
    request<{ ok: true; phone: string }>(`/schedules/${id}/oferecer-antecipacao`, {
      method: 'POST',
    }),

  getAlerts: (status = 'open') =>
    request<AlertsResponse>(`/alerts?status=${encodeURIComponent(status)}`),
  updateAlertStatus: (id: string, status: AlertStatus) =>
    request<{ ok: true; status: AlertStatus }>(`/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
};

export type SchedulePeriod = 'morning' | 'afternoon';
export type ScheduleStatus = 'scheduled' | 'done' | 'cancelled';

export interface ScheduleQuery {
  status?: string;
  period?: string;
  date?: string;
  page?: number;
  limit?: number;
}

export interface ScheduleItem {
  id: string;
  customer_id: string;
  phone: string;
  customer_name?: string;
  visit_date: string;
  period: SchedulePeriod;
  period_label: 'Manhã (8h-12h)' | 'Tarde (14h-18h)';
  status: string;
  type: string;
  address?: string;
  bring_forward_status?: string;
  created_at: string;
}

export interface ScheduleListResponse {
  data: ScheduleItem[];
  total: number;
  page: number;
}

export interface ScheduleTodayResponse {
  data: ScheduleItem[];
  total: number;
  date: string;
  summary: { total: number; morning: number; afternoon: number; pending: number };
}

export interface RoiReport {
  period_days: number;
  taxa_resolucao_sem_humano: number;
  tempo_medio_resposta_ms: number;
  sessoes_por_modo: Record<string, number>;
  pix_gerados: number;
  leads_qualificados: number;
  chamados_abertos: number;
  nps_medio: number | null;
  nps_total_respostas: number;
  custo_llm_usd: number;
  total_tokens: number;
}
