import { sgpClient, systemParams } from './client';
import {
  ContratoSchema,
  CustomerSchema,
  normalizeStatus,
  extractDownloadMbps,
  redactSensitiveFields,
  type Customer,
  type Contrato,
} from './types';
import { normalizePhone } from '../../lib/phone';

/** Map a raw SGP Contrato to our normalized Customer shape. */
function resolveCustomerPhone(c: Contrato, hint: string): string {
  const fromContract = (c.telefones ?? [])
    .map((t) => t.contato.replace(/\D/g, ''))
    .find((d) => d.length >= 10);

  if (fromContract) {
    const local = fromContract.replace(/^55/, '');
    return local.length <= 11 ? `+55${local}` : `+${fromContract}`;
  }

  const hintDigits = hint.replace(/\D/g, '');
  if (hintDigits.length >= 10 && hintDigits.length <= 13) {
    return hint.startsWith('+') ? hint : `+55${hintDigits.replace(/^55/, '')}`;
  }

  return hint;
}

function contratoToCustomer(c: Contrato, contactHint: string): Customer {
  const status = normalizeStatus(c.contratoStatus);
  const mbps = extractDownloadMbps(c.planointernet ?? '');

  return CustomerSchema.parse({
    id:       String(c.contratoId),
    name:     c.razaoSocial,
    phone:    resolveCustomerPhone(c, contactHint),
    document: c.cpfCnpj,
    sgpClienteId: String(c.clienteId),
    status,
    plan: {
      name:        c.planointernet ?? '',
      downloadMbps: mbps,
    },
    address: {
      street:       c.endereco_logradouro,
      number:       c.endereco_numero !== undefined ? String(c.endereco_numero) : undefined,
      neighborhood: c.endereco_bairro,
      city:         c.endereco_cidade,
      state:        c.endereco_uf,
      zipCode:      c.endereco_cep,
    },
    contratoValorAberto:     c.contratoValorAberto,
    contratoTitulosAReceber: c.contratoTitulosAReceber,
    cobVencimento:           c.cobVencimento,
    contratoCentralLogin:    c.contratoCentralLogin,
    contratoCentralSenha:    c.contratoCentralSenha,
  });
}

/**
 * Thrown when the SGP returned contratos but every single one failed ContratoSchema —
 * distinct from the "no contratos at all" case so callers don't mistake a schema
 * mismatch (our bug) for "cliente não encontrado" (a real absence of data).
 */
export class SgpSchemaMismatchError extends Error {
  constructor(total: number) {
    super(`SGP retornou ${total} contrato(s) mas nenhum bateu com ContratoSchema — ver logs [sgp] ContratoSchema parse error`);
    this.name = 'SgpSchemaMismatchError';
  }
}

async function consultacliente(params: Record<string, string>): Promise<Contrato[]> {
  const body = systemParams(params as Record<string, string>);
  const { data } = await sgpClient.post('/api/ura/consultacliente/', body.toString());
  const contratos = (data?.contratos ?? []) as unknown[];
  const parsed: Contrato[] = [];
  for (const c of contratos) {
    try {
      parsed.push(ContratoSchema.parse(c));
    } catch (err) {
      // `c` is the raw, unvalidated SGP contrato — it may still carry contratoCentralLogin/
      // contratoCentralSenha even though it failed ContratoSchema, so it must be redacted
      // before hitting console (Railway logs) just like any parsed Customer.
      console.error('[sgp] ContratoSchema parse error:', JSON.stringify(err), '| raw:', JSON.stringify(redactSensitiveFields(c)));
    }
  }
  if (contratos.length > 0 && parsed.length === 0) {
    throw new SgpSchemaMismatchError(contratos.length);
  }
  return parsed;
}

/**
 * The SGP can return several contratos for the same phone/CPF (e.g. customer
 * with multiple addresses or a cancelled + active contract). Pick a single one:
 *   1. Active contract (contratoStatus === 1 && contratoStatusDisplay === 'Ativo')
 *   2. Among multiple active: the most recent (highest contratoId)
 *   3. None active: the most recent overall (highest contratoId), any status
 * Always returns one Contrato (caller guarantees the array is non-empty).
 */
function selectBestContrato(contratos: Contrato[]): Contrato {
  const byMostRecent = (a: Contrato, b: Contrato) => b.contratoId - a.contratoId;
  const active = contratos
    .filter((c) => c.contratoStatus === 1 && c.contratoStatusDisplay === 'Ativo')
    .sort(byMostRecent);
  if (active.length) return active[0]!;
  return [...contratos].sort(byMostRecent)[0]!;
}

/**
 * Brazilian 9th-digit mismatch: WhatsApp often delivers mobile numbers without
 * the leading 9 (DDD + 8 digits), while the SGP stores them with it (DDD + 9 + 8),
 * or vice-versa. Generate both forms so a real customer is found either way.
 */
function sgpPhoneCandidates(local: string): string[] {
  const candidates = [local];
  if (local.length === 10) {
    // DDD + 8 → DDD + 9 + 8
    candidates.push(`${local.slice(0, 2)}9${local.slice(2)}`);
  } else if (local.length === 11 && local[2] === '9') {
    // DDD + 9 + 8 → DDD + 8
    candidates.push(`${local.slice(0, 2)}${local.slice(3)}`);
  }
  return [...new Set(candidates)];
}

export async function getCustomerByPhone(phone: string): Promise<Customer> {
  const sgpPhone = normalizePhone(phone).replace(/^\+55/, '');
  for (const candidate of sgpPhoneCandidates(sgpPhone)) {
    const contratos = await consultacliente({ telefone: candidate });
    if (contratos.length) {
      const chosen = selectBestContrato(contratos);
      if (contratos.length > 1) {
        console.log(`[sgp] multiple contracts found for phone, using contratoId: ${chosen.contratoId}`);
      }
      return contratoToCustomer(chosen, phone);
    }
  }
  throw new Error(`Cliente não encontrado para o telefone ${phone}`);
}

export async function getCustomerByCpf(cpf: string, contactPhone = ''): Promise<Customer> {
  const clean = cpf.replace(/\D/g, '');
  // SGP's /api/ura/consultacliente/ only recognizes this param as `cpfcnpj` — `cpf` is
  // silently ignored and the endpoint returns { msg: "CPF/CNPJ ou Contrato ID Não informados" }
  // without ever running a lookup. Confirmed live against production (2026-07-05).
  const contratos = await consultacliente({ cpfcnpj: clean });
  if (!contratos.length) throw new Error(`Cliente não encontrado para o CPF ${cpf}`);
  return contratoToCustomer(selectBestContrato(contratos), contactPhone);
}

/**
 * All phone numbers the SGP has on file for a CPF, across every contrato returned
 * (not just the best one — a person can have more than one contract with different
 * registered numbers). Used to verify a session's phone actually has a link to a
 * CPF before trusting/persisting it — see agent/identity-verification.ts.
 */
export async function getContratoPhonesByCpf(cpf: string): Promise<string[]> {
  const clean = cpf.replace(/\D/g, '');
  const contratos = await consultacliente({ cpfcnpj: clean });
  const phones = new Set<string>();
  for (const c of contratos) {
    for (const t of c.telefones ?? []) {
      const digits = t.contato.replace(/\D/g, '');
      if (digits.length < 10) continue;
      const local = digits.replace(/^55/, '');
      phones.add(local.length <= 11 ? normalizePhone(local) : normalizePhone(digits));
    }
  }
  return [...phones];
}

export async function getCustomerById(id: string): Promise<Customer> {
  const contratos = await consultacliente({ contrato: id });
  if (!contratos.length) throw new Error(`Contrato ${id} não encontrado`);
  return contratoToCustomer(contratos[0]!, '');
}

/** Not supported by SGP bulk API — returns empty array. */
export async function getCustomersByPlan(_downloadMbps: number): Promise<Customer[]> {
  return [];
}

/** Not supported by SGP bulk API — returns empty array. */
export async function getCustomersByActivationDays(_days: number): Promise<Customer[]> {
  return [];
}

/** Not supported by SGP bulk API — returns empty array. */
export async function getAllActiveCustomers(): Promise<Customer[]> {
  return [];
}
