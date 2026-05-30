import { env } from '../config/env';

/** IDs de tenant consultados pelo painel admin (dados legados podem estar em `default`). */
export function adminTenantIds(): string[] {
  return [...new Set([env.DEFAULT_TENANT_ID, 'default', 'salesnet-default'])];
}
