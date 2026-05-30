import { sgpClient, systemParams } from './client';
import {
  ContratoSchema,
  CustomerSchema,
  normalizeStatus,
  extractDownloadMbps,
  type Customer,
  type Contrato,
} from './types';
import { normalizePhone } from '../../lib/phone';

/** Map a raw SGP Contrato to our normalized Customer shape. */
function contratoToCustomer(c: Contrato, rawPhone: string): Customer {
  const status = normalizeStatus(c.contratoStatus);
  const mbps = extractDownloadMbps(c.planointernet ?? '');

  return CustomerSchema.parse({
    id:       String(c.contratoId),
    name:     c.razaoSocial,
    phone:    rawPhone,
    document: c.cpfCnpj,
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

async function consultacliente(params: Record<string, string>): Promise<Contrato[]> {
  const body = systemParams(params as Record<string, string>);
  const { data } = await sgpClient.post('/api/ura/consultacliente/', body.toString());
  const contratos = (data?.contratos ?? []) as unknown[];
  return contratos.map((c) => ContratoSchema.parse(c));
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

export async function getCustomerByCpf(cpf: string): Promise<Customer> {
  const clean = cpf.replace(/\D/g, '');
  const contratos = await consultacliente({ cpf: clean });
  if (!contratos.length) throw new Error(`Cliente não encontrado para o CPF ${cpf}`);
  return contratoToCustomer(selectBestContrato(contratos), cpf);
}

export async function getCustomerById(id: string): Promise<Customer> {
  // id = contratoId — look up via CPF/CNPJ is not possible without it,
  // so we search by contrato param (supported by consultacliente)
  const body = systemParams({ contrato: id });
  const { data } = await sgpClient.post('/api/ura/consultacliente/', body.toString());
  const contratos = (data?.contratos ?? []) as unknown[];
  const parsed = contratos.map((c) => ContratoSchema.parse(c));
  if (!parsed.length) throw new Error(`Contrato ${id} não encontrado`);
  return contratoToCustomer(parsed[0]!, '');
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
