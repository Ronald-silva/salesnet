const TOKEN_KEY = 'salesnet_token';
const CUSTOMER_KEY = 'salesnet_customer';

export interface StoredSession {
  token: string;
  customerId: string;
  name: string;
}

export function saveSession(session: StoredSession): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(session));
}

export function getSession(): StoredSession | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const raw = localStorage.getItem(CUSTOMER_KEY);
  if (!token || !raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
