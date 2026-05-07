const ADMIN_TOKEN_KEY = 'salesnet_admin_token';
const ADMIN_USER_KEY = 'salesnet_admin_user';

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin';
}

export interface AdminSession {
  accessToken: string;
  user: AdminUser;
}

export function saveAdminSession(session: AdminSession): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, session.accessToken);
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(session.user));
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getAdminUser(): AdminUser | null {
  const raw = localStorage.getItem(ADMIN_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminUser;
  } catch {
    return null;
  }
}

export function clearAdminSession(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}
