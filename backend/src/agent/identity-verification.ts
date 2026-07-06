import * as sgp from '../integrations/sgp';
import { normalizePhone } from '../lib/phone';

/**
 * Single source of truth for "does this phone have a verified link to this CPF in the
 * SGP". Any tool that accepts a third-party identifier (cpf/contrato/customer_id
 * different from the current WhatsApp session) must gate persistence/disclosure
 * through this check instead of reimplementing it — see CLAUDE.md.
 *
 * A false negative (real customer, SGP data stale/incomplete) is the safe failure
 * mode: callers must fall back to asking for human confirmation, never to trusting
 * the identifier anyway.
 */
export async function isPhoneRegisteredToCpf(phone: string, cpf: string): Promise<boolean> {
  const target = normalizePhone(phone);
  try {
    const phones = await sgp.getContratoPhonesByCpf(cpf);
    return phones.includes(target);
  } catch {
    return false;
  }
}
