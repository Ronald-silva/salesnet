import axios from 'axios';
import { env } from '../../config/env';

/**
 * SGP form-data client.
 * All SGP endpoints accept POST with application/x-www-form-urlencoded.
 * System-level auth: append app=<SGP_APP_NAME>&token=<SGP_API_TOKEN> to every call.
 */
export const sgpClient = axios.create({
  baseURL: env.SGP_BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

/** Build URLSearchParams with system auth pre-filled. */
export function systemParams(extra: Record<string, string | number | undefined> = {}): URLSearchParams {
  const p = new URLSearchParams();
  p.set('app', env.SGP_APP_NAME);
  p.set('token', env.SGP_API_TOKEN);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) p.set(k, String(v));
  }
  return p;
}

sgpClient.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response?.status;
    const url   = err.config?.url;
    console.error(`[SGP] ${status ?? 'NETWORK'} on ${url ?? '?'}:`, err.message);
    return Promise.reject(err);
  },
);
