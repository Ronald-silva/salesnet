import { sgpClient, systemParams } from './client';
import {
  ContratoSchema,
  CustomerSchema,
  normalizeStatus,
  extractDownloadMbps,
  stripPhone,
  type Customer,
  type Contrato,
} from './types';

/** Convert E.164 / any format → bare digits (DDD+number, no country code). */
function toSgpPhone(phone: string): string {
  const digits = stripPhone(phone);
  // Strip leading 55 (Brazil country code) if present and result would be 10-11 digits
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

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

export async function getCustomerByPhone(phone: string): Promise<Customer> {
  const sgpPhone = toSgpPhone(phone);
  const contratos = await consultacliente({ telefone: sgpPhone });
  if (!contratos.length) throw new Error(`Cliente não encontrado para o telefone ${phone}`);
  // Prefer active contracts; fall back to first
  const active = contratos.find((c) => c.contratoStatus === 1) ?? contratos[0];
  return contratoToCustomer(active!, phone);
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
