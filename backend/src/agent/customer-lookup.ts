import * as sgp from '../integrations/sgp';
import { supabase } from '../config/supabase';
import { grantTemporaryFinancialAccess, persistThreadCpf } from './memory';
import { normalizeCpf, extractCpfFromText, extractBareCpfWhenAsked, hasInvalidBareCpfCandidate } from '../lib/cpf';
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
  /** True only when the current WhatsApp number is linked to the CPF/contract. */
  phoneLinked: boolean;
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

  async function persistCpfIfVerified(cpf: string): Promise<boolean> {
    const verified = await isPhoneRegisteredToCpf(whatsappPhone, cpf);
    if (verified) {
      await persistThreadCpf(whatsappPhone, tenantId, cpf);
    }
    return verified;
  }

  async function tryResolveByCpf(cpf: string, fromMessage: boolean): Promise<CustomerLookupResult | null> {
    try {
      attempts.push(`cpf:${cpf.slice(0, 3)}***`);
      const customer = await sgp.getCustomerByCpf(cpf, whatsappPhone);
      const phoneLinked = await persistCpfIfVerified(cpf);
      if (!phoneLinked && fromMessage) {
        try {
          await grantTemporaryFinancialAccess(whatsappPhone, tenantId, customer.id);
        } catch (err) {
          console.error('[customer-lookup] temporary financial authorization failed:', err);
        }
      }
      return { customer, method: 'cpf', cpfUsed: cpf, attempts, phoneLinked };
    } catch (err) {
      logIfUnexpected(`cpf lookup for ${cpf.slice(0, 3)}***`, err);
      attempts.push(`cpf_stored_phone:${cpf.slice(0, 3)}***`);
      const fromStored = await tryLookupByStoredCpfPhone(cpf, tenantId);
      if (fromStored) {
        await persistThreadCpf(whatsappPhone, tenantId, cpf);
        return { customer: fromStored, method: 'cpf_stored_phone', cpfUsed: cpf, attempts, phoneLinked: true };
      }
      return null;
    }
  }

  // CPF explícito na mensagem vence a identificação por telefone: um número cadastrado
  // como contato de outro contrato no SGP (ex.: mesmo telefone em vários cadastros)
  // ficaria preso àquele cliente e nunca alcançaria o contrato do CPF informado.
  if (messageCpf && messageCpf.length === 11) {
    const byMessageCpf = await tryResolveByCpf(messageCpf, true);
    if (byMessageCpf) return byMessageCpf;
  }

  try {
    attempts.push('phone');
    const customer = await sgp.getCustomerByPhone(whatsappPhone);
    if (customer.document) {
      await persistThreadCpf(whatsappPhone, tenantId, customer.document);
    }
    return { customer, method: 'phone', attempts, phoneLinked: true };
  } catch (err) {
    logIfUnexpected(`phone lookup for ${whatsappPhone}`, err);
    // fall through to thread CPF
  }

  const threadCpf = params.cpfFromThread ? normalizeCpf(params.cpfFromThread) : null;
  if (threadCpf && threadCpf.length === 11 && threadCpf !== messageCpf) {
    const byThreadCpf = await tryResolveByCpf(threadCpf, false);
    if (byThreadCpf) return byThreadCpf;
  }

  return { customer: { error: 'Cliente não encontrado' }, method: null, attempts, phoneLinked: false };
}

export function buildIdentificationContext(
  lookup: CustomerLookupResult,
  whatsappPhone: string,
): string {
  if (!isCustomerError(lookup.customer)) {
    if (lookup.method === 'cpf' || lookup.method === 'cpf_stored_phone') {
      return (
        `\n\n## Identificação` +
        `\nCliente localizado via CPF. Continue normalmente com orientações e atendimento.` +
        (lookup.phoneLinked
          ? `\nO WhatsApp atual está vinculado ao cadastro.`
          : `\nO WhatsApp atual não está vinculado ao cadastro. Não mencione divergência nem trate isso como inconsistência. Faturas, PIX e confirmação de pagamento estão autorizados temporariamente pelo CPF informado. Não execute alterações cadastrais ou contratuais; para elas, oriente a Central do Cliente ou o atendimento humano.`)
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

export { extractCpfFromText, extractBareCpfWhenAsked, hasInvalidBareCpfCandidate };
