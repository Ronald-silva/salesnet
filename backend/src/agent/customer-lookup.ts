import * as sgp from '../integrations/sgp';
import { supabase } from '../config/supabase';
import { persistThreadCpf } from './memory';
import { normalizeCpf, extractCpfFromText, extractBareCpfWhenAsked } from '../lib/cpf';
import { isPhoneRegisteredToCpf } from './identity-verification';
import type { Customer } from '../integrations/sgp/types';

/**
 * getCustomerByPhone/getCustomerByCpf throw a plain Error with "não encontrado" in the
 * message for the one truly-expected outcome (SGP has no matching contrato). Anything
 * else — network timeout, SgpSchemaMismatchError, an unexpected ZodError from
 * CustomerSchema, etc. — is a real failure and must never vanish silently, or we
 * reproduce the exact "real failure looks like not-found" bug this file used to have.
 */
function logIfUnexpected(context: string, err: unknown): void {
  const isExpectedNotFound = err instanceof Error && /não encontrado/i.test(err.message);
  if (!isExpectedNotFound) {
    console.error(`[customer-lookup] ${context}:`, err);
  }
}

export type CustomerLookupMethod = 'phone' | 'cpf' | 'cpf_stored_phone';

export interface CustomerLookupResult {
  customer: Customer | { error: string };
  method: CustomerLookupMethod | null;
  cpfUsed?: string;
  attempts: string[];
}

function isCustomerError(c: Customer | { error: string }): c is { error: string } {
  return 'error' in c;
}

async function tryLookupByStoredCpfPhone(cpf: string, tenantId: string): Promise<Customer | null> {
  const cleanCpf = normalizeCpf(cpf);
  const { data } = await supabase
    .from('conversation_threads')
    .select('phone')
    .eq('tenant_id', tenantId)
    .eq('cpf', cleanCpf)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.phone) return null;

  try {
    return await sgp.getCustomerByPhone(data.phone as string);
  } catch {
    return null;
  }
}

/**
 * Identifies a customer: WhatsApp/phone first, then CPF (message or thread).
 * Persists CPF on success for future lookups when the number changes.
 */
export async function lookupCustomer(params: {
  whatsappPhone: string;
  tenantId: string;
  cpfFromMessage?: string | null;
  cpfFromThread?: string | null;
}): Promise<CustomerLookupResult> {
  const { whatsappPhone, tenantId } = params;
  const attempts: string[] = [];

  const messageCpf = params.cpfFromMessage ? normalizeCpf(params.cpfFromMessage) : null;

  async function persistCpfIfVerified(cpf: string): Promise<void> {
    if (await isPhoneRegisteredToCpf(whatsappPhone, cpf)) {
      await persistThreadCpf(whatsappPhone, tenantId, cpf);
    }
  }

  try {
    attempts.push('phone');
    const customer = await sgp.getCustomerByPhone(whatsappPhone);
    if (customer.document) {
      await persistThreadCpf(whatsappPhone, tenantId, customer.document);
    }
    return { customer, method: 'phone', attempts };
  } catch (err) {
    logIfUnexpected(`phone lookup for ${whatsappPhone}`, err);
    // fall through to CPF
  }

  const cpfCandidates = [
    messageCpf,
    params.cpfFromThread ? normalizeCpf(params.cpfFromThread) : null,
  ].filter((c): c is string => !!c && c.length === 11);
  const uniqueCpfs = [...new Set(cpfCandidates)];

  for (const cpf of uniqueCpfs) {
    try {
      attempts.push(`cpf:${cpf.slice(0, 3)}***`);
      const customer = await sgp.getCustomerByCpf(cpf, whatsappPhone);
      await persistCpfIfVerified(cpf);
      return { customer, method: 'cpf', cpfUsed: cpf, attempts };
    } catch (err) {
      logIfUnexpected(`cpf lookup for ${cpf.slice(0, 3)}***`, err);
      attempts.push(`cpf_stored_phone:${cpf.slice(0, 3)}***`);
      const fromStored = await tryLookupByStoredCpfPhone(cpf, tenantId);
      if (fromStored) {
        await persistThreadCpf(whatsappPhone, tenantId, cpf);
        return { customer: fromStored, method: 'cpf_stored_phone', cpfUsed: cpf, attempts };
      }
    }
  }

  return { customer: { error: 'Cliente não encontrado' }, method: null, attempts };
}

export function buildIdentificationContext(
  lookup: CustomerLookupResult,
  whatsappPhone: string,
): string {
  if (!isCustomerError(lookup.customer)) {
    if (lookup.method === 'cpf' || lookup.method === 'cpf_stored_phone') {
      return (
        `\n\n## Identificação` +
        `\nCliente identificado via CPF. O WhatsApp atual (${whatsappPhone}) pode diferir do telefone cadastrado.`
      );
    }
    return '';
  }

  return (
    `\n\n## Identificação` +
    `\nCliente NÃO identificado pelo WhatsApp (${whatsappPhone}).` +
    `\nOrdem tentada automaticamente: telefone → CPF.` +
    `\nSe o cliente ainda não informou o CPF, peça e use buscar_cliente com o campo cpf.` +
    `\nTentativas: ${lookup.attempts.join(', ')}`
  );
}

export { extractCpfFromText, extractBareCpfWhenAsked };
