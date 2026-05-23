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
}

export interface ConversationDetail {
  id: string;
  phone: string;
  human_mode: boolean;
  churn_risk: boolean;
  updated_at: string;
  messages: Array<{ role: string; content: string; timestamp?: string; source?: string }>;
  customer?: {
    name?: string;
    plan?: { name?: string };
    status?: string;
  } | null;
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
  created_at: string;
  status: string;
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

  getWhatsAppStatus: () =>
    request<{ connected: boolean; state: string; phoneNumber?: string }>('/whatsapp/status'),
  getWhatsAppQR: () =>
    request<{ qrCode: string }>('/whatsapp/qr'),
};
