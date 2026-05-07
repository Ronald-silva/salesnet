import { getToken } from '@/lib/auth';

const BASE = '/api';

function authHeaders(): HeadersInit {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface Invoice {
  id: string;
  amount: number;
  dueDate: string;
  status: 'open' | 'paid' | 'overdue' | 'cancelled';
  pixKey?: string;
}

export interface ConnectionStatus {
  online: boolean;
  currentDownloadMbps?: number;
  currentUploadMbps?: number;
  lastSeen?: string;
}

export interface Ticket {
  id: string;
  type: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
}

export interface ReferralInfo {
  link: string | null;
  conversions: number;
}

export const clientApi = {
  requestOtp: (phone: string) =>
    apiFetch<{ ok: boolean }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),

  verifyOtp: (phone: string, code: string) =>
    apiFetch<{ token: string; customerId: string; name: string }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    }),

  getInvoice: () => apiFetch<Invoice>('/client/invoice'),
  getConnection: () => apiFetch<ConnectionStatus>('/client/connection'),
  getTickets: () => apiFetch<Ticket[]>('/client/tickets'),
  openTicket: (type: string, description: string) =>
    apiFetch<{ ticketId: string; status: string }>('/client/tickets', {
      method: 'POST',
      body: JSON.stringify({ type, description }),
    }),
  getReferral: () => apiFetch<ReferralInfo>('/client/referral'),
  getInvoices: () => apiFetch<Invoice[]>('/client/invoices'),
};
