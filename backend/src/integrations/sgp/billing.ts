import { sgpClient, systemParams } from './client';
import { getCustomerByCpf } from './customers';
import { isValidCpf, normalizeCpf } from '../../lib/cpf';
import {
  TitulosResponseSchema,
  InvoiceSchema,
  PixKeySchema,
  BillingStatusEntrySchema,
  type Invoice,
  type PixKey,
  type OverdueCustomer,
  type DueSoonCustomer,
  type SuspendReactivateResponse,
  type BillingStage,
  type BillingStatusEntry,
} from './types';

// SGP às vezes devolve links apontando para o frontend Vercel em vez do próprio SGP.
function fixSgpLink(url: string | undefined): string {
  if (!url) return ''
  if (url.startsWith('https://salesnet.sgp.tsmx.com.br')) return url
  if (url.includes('salesnet-green.vercel.app'))
    return url.replace(
      /https?:\/\/salesnet-green\.vercel\.app/g,
      'https://salesnet.sgp.tsmx.com.br'
    )
  if (url.startsWith('/'))
    return 'https://salesnet.sgp.tsmx.com.br' + url
  return 'https://salesnet.sgp.tsmx.com.br/' + url
}

function faturaToInvoice(f: { id: number; valor: number; valorcorrigido: number; vencimento: string; statusid: number; codigopix?: string; gerarpix?: boolean; linhadigitavel?: string; link?: string }): Invoice {
  let status: Invoice['status'];
  if (f.statusid === 2) status = 'paid';
  else if (f.statusid === 3) status = 'cancelled';
  else {
    const today = new Date().toISOString().split('T')[0]!;
    status = f.vencimento < today ? 'overdue' : 'open';
  }

  const fixedLink = fixSgpLink(f.link) || undefined;

  return InvoiceSchema.parse({
    id:             String(f.id),
    amount:         f.valorcorrigido ?? f.valor,
    dueDate:        f.vencimento,
    status,
    pixCode:        f.codigopix?.trim() || undefined,
    canGeneratePix: f.gerarpix,
    barcode:        f.linhadigitavel || undefined,
    link:           fixedLink,
    pdfLink:        fixedLink ? `${fixedLink}?format=pdf` : undefined,
  });
}

/** Returns the most recent open invoice for a contract. */
export async function getCurrentInvoice(contratoId: string): Promise<Invoice> {
  const body = systemParams({ contrato: contratoId, status: '1', limit: '1' });
  const { data } = await sgpClient.post('/api/central/titulos/', body.toString());
  const parsed = TitulosResponseSchema.parse(data);

  if (!parsed.faturas.length) {
    // No open invoice — return last paid invoice as context
    const bodyAll = systemParams({ contrato: contratoId, limit: '1' });
    const { data: dataAll } = await sgpClient.post('/api/central/titulos/', bodyAll.toString());
    const parsedAll = TitulosResponseSchema.parse(dataAll);
    if (!parsedAll.faturas.length) throw new Error('Nenhuma fatura encontrada');
    return faturaToInvoice(parsedAll.faturas[0]!);
  }

  return faturaToInvoice(parsed.faturas[0]!);
}

/** Generate or return existing PIX code for an invoice.
 *  forceNew=true bypasses cached codigopix and calls the SGP endpoint directly
 *  (use when the client reports the previous code was expired or invalid).
 */
export async function generatePixKey(invoiceId: string, contratoId?: string, forceNew = false): Promise<PixKey> {
  // Only use cached code if not forcing a new one
  if (!forceNew && contratoId) {
    try {
      const body = systemParams({ contrato: contratoId, limit: '50' });
      const { data } = await sgpClient.post('/api/central/titulos/', body.toString());
      const parsed = TitulosResponseSchema.parse(data);
      const fatura = parsed.faturas.find((f) => String(f.id) === invoiceId);
      if (fatura?.codigopix) {
        return PixKeySchema.parse({ invoiceId, pixKey: fatura.codigopix.trim() });
      }
    } catch {
      // fall through to direct PIX generation
    }
  }

  // Call the SGP PIX generation endpoint (always generates fresh code)
  const body = systemParams({ contrato: contratoId ?? '' });
  const { data } = await sgpClient.post(`/api/central/pagamento/pix/${invoiceId}`, body.toString());

  const pixCode = data?.codigopix ?? data?.pix ?? data?.codigo ?? data?.qrcode;
  if (!pixCode) throw new Error('PIX não disponível para esta fatura');

  return PixKeySchema.parse({ invoiceId, pixKey: String(pixCode).trim() });
}

/** Returns all invoices for a contract (paid + open). */
export async function getCustomerInvoices(contratoId: string): Promise<Invoice[]> {
  const body = systemParams({ contrato: contratoId, limit: '20' });
  const { data } = await sgpClient.post('/api/central/titulos/', body.toString());
  const parsed = TitulosResponseSchema.parse(data);
  return parsed.faturas.map(faturaToInvoice);
}

/**
 * Not natively supported by SGP API — would require iterating all contracts.
 * Returns empty array; billing automation relies on SGP status fields from
 * individual lookups or a future bulk endpoint.
 */
export async function getOverdueCustomers(_daysOverdue: number): Promise<OverdueCustomer[]> {
  return [];
}

export async function getCustomersDueInDays(_days: number): Promise<DueSoonCustomer[]> {
  return [];
}

function computeBillingStage(daysUntilDue: number): BillingStage | null {
  switch (daysUntilDue) {
    case 5:  return 'd5';
    case 2:  return 'd2';
    case 0:  return 'd0';
    case -3: return 'd3_overdue';
    case -5: return 'd5_overdue';
    default: return null;
  }
}

/**
 * Resolves billing status directly for a fixed list of CPFs — no SGP bulk-listing
 * endpoint exists (getOverdueCustomers/getCustomersDueInDays above remain stubs for
 * that reason). Looks up each CPF individually (consultacliente + titulos) and
 * SEQUENTIALLY — never in parallel — to avoid bursting the SGP with concurrent calls.
 * A failure on one CPF (invalid checksum, not found, invoice lookup error) is logged
 * and skipped; it never aborts the rest of the list.
 */
export async function getBillingStatusForAllowlist(cpfs: string[]): Promise<BillingStatusEntry[]> {
  const results: BillingStatusEntry[] = [];
  const today = new Date().toISOString().split('T')[0]!;

  for (const rawCpf of cpfs) {
    const cpf = normalizeCpf(rawCpf);
    if (!isValidCpf(cpf)) {
      console.error(`[billing] getBillingStatusForAllowlist: skipping CPF that fails checksum validation`);
      continue;
    }

    let customer: { id: string; name: string; phone: string };
    try {
      customer = await getCustomerByCpf(cpf);
    } catch (err) {
      console.error(`[billing] getBillingStatusForAllowlist: lookup failed for a CPF in the allowlist:`, err);
      continue;
    }

    try {
      const body = systemParams({ contrato: customer.id, status: '1', limit: '5' });
      const { data } = await sgpClient.post('/api/central/titulos/', body.toString());
      const parsed = TitulosResponseSchema.parse(data);
      if (!parsed.faturas.length) continue; // no open invoice — nothing to notify

      const nearest = [...parsed.faturas].sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]!;
      const daysUntilDue = Math.round((Date.parse(nearest.vencimento) - Date.parse(today)) / 86_400_000);

      results.push(BillingStatusEntrySchema.parse({
        customerId:   customer.id,
        document:     cpf,
        name:         customer.name,
        phone:        customer.phone,
        dueDate:      nearest.vencimento,
        amount:       nearest.valorcorrigido ?? nearest.valor,
        daysUntilDue,
        pixCode:      nearest.codigopix?.trim() || undefined,
        stage:        computeBillingStage(daysUntilDue),
      }));
    } catch (err) {
      console.error(`[billing] getBillingStatusForAllowlist: invoice lookup failed for contrato ${customer.id}:`, err);
    }
  }

  return results;
}

/** SGP does not expose a suspend endpoint via Central API — stub. */
export async function suspendCustomer(contratoId: string): Promise<SuspendReactivateResponse> {
  console.warn('[SGP] suspendCustomer not implemented:', contratoId);
  return { customerId: contratoId, status: 'suspended', updatedAt: new Date().toISOString() };
}

/** SGP does not expose a reactivate endpoint via Central API — stub. */
export async function reactivateCustomer(contratoId: string): Promise<SuspendReactivateResponse> {
  console.warn('[SGP] reactivateCustomer not implemented:', contratoId);
  return { customerId: contratoId, status: 'active', updatedAt: new Date().toISOString() };
}

export async function getHabitualLatePayerIds(
  minOverdueCount = 2,
  monthsBack = 6,
): Promise<Set<string>> {
  const { supabase } = await import('../../config/supabase');

  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const { data } = await supabase
    .from('billing_notifications')
    .select('customer_id')
    .in('type', ['overdue_d3', 'suspended_d5'])
    .gte('sent_at', since.toISOString());

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ customer_id: string }>) {
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
  }

  const ids = new Set<string>();
  for (const [id, count] of counts) {
    if (count >= minOverdueCount) ids.add(id);
  }
  return ids;
}
