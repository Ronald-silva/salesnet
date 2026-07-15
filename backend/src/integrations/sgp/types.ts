import { z } from 'zod';

// ── Contrato (real SGP response from /api/ura/consultacliente/) ───────────────

/**
 * `.catch()` silently swallowing a real shape mismatch into a default value is exactly
 * the pattern that hid the original telefones/emails bug for weeks (see git history of
 * this file). Any field using this must log when the fallback actually fires, so a
 * future mismatch surfaces immediately instead of degrading silently (e.g. a customer
 * whose contratoStatus arrives malformed defaulting to 0 → wrongly read as 'suspended').
 */
function logSchemaFallback<T>(field: string, fallback: T) {
  return (ctx: { error: z.ZodError; input: unknown }): T => {
    console.error(
      `[sgp] ContratoSchema field '${field}' fell back to default —`,
      JSON.stringify(ctx.error.issues),
      '| raw:', JSON.stringify(ctx.input),
    );
    return fallback;
  };
}

export const ContratoSchema = z.object({
  contratoId:           z.number(),
  clienteId:            z.number(),
  // SGP may return null for these on cancelled/incomplete contracts
  razaoSocial:          z.string().catch(''),
  cpfCnpj:              z.string().catch(''),
  // SGP returns objects here, not plain strings — e.g.
  // { tipoContato: "Celular Pessoal", contato: "(85) 99603-2957", inscricoes: [] }.
  // Confirmed against production payloads for every contrato sampled (2026-07-05);
  // no plain-string entries observed, so no union is added — see customers.ts:resolveCustomerPhone.
  telefones: z.array(z.object({
    contato:     z.string(),
    tipoContato: z.string().optional(),
    inscricoes:  z.array(z.unknown()).optional(),
  })).catch(logSchemaFallback('telefones', [])),
  emails: z.array(z.object({
    contato:     z.string(),
    tipoContato: z.string().optional(),
    inscricoes:  z.array(z.unknown()).optional(),
  })).catch(logSchemaFallback('emails', [])),

  // Contract status: 1=Ativo, 2=Suspenso/Bloqueado, 3=Cancelado
  contratoStatus:        z.number().catch(logSchemaFallback('contratoStatus', 0)),
  contratoStatusDisplay: z.string().catch(''),

  // Plan
  planointernet:         z.string().catch(''),
  servico_plano:         z.string().optional(),
  servico_grupo:         z.string().optional(),   // "fibra"
  servico_login:         z.string().optional(),
  servico_tipo_conexao:  z.string().optional(),

  // Address
  endereco_logradouro:   z.string().optional(),
  endereco_numero:       z.union([z.string(), z.number()]).optional(),
  endereco_bairro:       z.string().optional(),
  endereco_cidade:       z.string().optional(),
  endereco_uf:           z.string().optional(),
  endereco_cep:          z.string().optional(),

  // Billing
  cobVencimento:              z.number().optional(),   // due day of month
  contratoValorAberto:        z.number().default(0),   // total open balance
  contratoTitulosAReceber:    z.number().default(0),   // unpaid invoice count

  // Central do Assinante credentials (for customer-facing calls)
  contratoCentralLogin: z.string().optional(),
  contratoCentralSenha: z.string().optional(),

  popNome: z.string().optional(),
}).passthrough();

export type Contrato = z.infer<typeof ContratoSchema>;

// ── Customer — normalized shape expected by the rest of the system ─────────────

export const CustomerSchema = z.object({
  id:     z.string(),   // String(contratoId)
  name:   z.string(),
  phone:  z.string(),
  document: z.string().optional(),
  sgpClienteId: z.string().optional(),
  status: z.enum(['active', 'suspended', 'cancelled']),
  plan: z.object({
    name:        z.string(),
    downloadMbps: z.number().optional(),
  }).optional(),
  address: z.object({
    street:       z.string().optional(),
    number:       z.string().optional(),
    neighborhood: z.string().optional(),
    city:         z.string().optional(),
    state:        z.string().optional(),
    zipCode:      z.string().optional(),
  }).optional(),
  // SGP extras passed through for Sofia's context
  contratoValorAberto:     z.number().optional(),
  contratoTitulosAReceber: z.number().optional(),
  cobVencimento:           z.number().optional(),
  contratoCentralLogin:    z.string().optional(),
  contratoCentralSenha:    z.string().optional(),
});

export type Customer = z.infer<typeof CustomerSchema>;

/**
 * Single source of truth for SGP portal credential field names. Anything that
 * crosses a trust boundary with Customer data (LLM prompt/history, persisted
 * interaction_logs, admin API responses) must be redacted through this list —
 * never re-list these fields ad hoc at each call site.
 */
const SENSITIVE_CUSTOMER_FIELDS = new Set<string>(['contratoCentralLogin', 'contratoCentralSenha']);

/**
 * Recursively strips SGP portal credentials from any value (object/array, any
 * depth). Safe to call on tool results, tool-call logs, or partial customer
 * data — fields that aren't present are simply not there to strip.
 */
export function redactSensitiveFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitiveFields(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_CUSTOMER_FIELDS.has(k)) continue;
      out[k] = redactSensitiveFields(v);
    }
    return out as T;
  }
  return value;
}

// ── Invoice (from /api/central/titulos/) ─────────────────────────────────────

export const FaturaSchema = z.object({
  id:                   z.number(),
  numero_documento:     z.number().optional(),
  vencimento:           z.string(),              // "YYYY-MM-DD"
  vencimento_atualizado: z.string().optional(),
  valor:                z.number(),
  valorcorrigido:       z.number(),
  status:               z.string(),              // "Pago", "Gerado", "Cancelado"
  statusid:             z.number(),              // 1=Em aberto, 2=Pago, 3=Cancelado
  data_pagamento:       z.string().nullable().optional(),
  codigopix:            z.string().optional(),   // already-generated PIX code
  gerarpix:             z.boolean().optional(),  // whether PIX can be generated
  linhadigitavel:       z.string().optional(),
  link:                 z.string().optional(),
}).passthrough();

export type Fatura = z.infer<typeof FaturaSchema>;

export const TitulosResponseSchema = z.object({
  paginacao: z.object({
    offset:  z.number(),
    limit:   z.number(),
    parcial: z.number(),
    total:   z.number(),
  }),
  faturas: z.array(FaturaSchema),
});

// ── Normalized Invoice — compatible with what tools.ts expects ────────────────

export const InvoiceSchema = z.object({
  id:       z.string(),
  amount:   z.number(),
  dueDate:  z.string(),
  status:   z.enum(['open', 'paid', 'overdue', 'cancelled']),
  pixCode:  z.string().optional(),
  canGeneratePix: z.boolean().optional(),
  barcode:  z.string().optional(),
  link:     z.string().optional(),
  pdfLink:  z.string().optional(),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

// ── PIX ───────────────────────────────────────────────────────────────────────

export const PixKeySchema = z.object({
  invoiceId: z.string(),
  pixKey:    z.string(),
  expiresAt: z.string().optional(),
});

export type PixKey = z.infer<typeof PixKeySchema>;

// ── Ticket (OS) — from /api/central/chamado/ ─────────────────────────────────

export const OpenTicketResponseSchema = z.object({
  status:      z.number().optional(),
  os_id:       z.number().optional(),
  ocorrencia_id: z.number().optional(),
  protocolo:   z.string().optional(),
  msg:         z.string().optional(),
}).passthrough();

export const TicketSchema = z.object({
  id:          z.string(),
  description: z.string(),
  status:      z.string(),
  createdAt:   z.string(),
}).passthrough();

export type OpenTicketResponse = z.infer<typeof OpenTicketResponseSchema>;
export type Ticket = z.infer<typeof TicketSchema>;

// ── Connection Status ─────────────────────────────────────────────────────────

export const ConnectionStatusSchema = z.object({
  customerId: z.string(),
  online:     z.boolean(),
  status:     z.string().optional(),
  lastSeen:   z.string().optional(),
});

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

// ── Overdue / DueSoon — returned by billing automation stubs ─────────────────

export const OverdueCustomerSchema = z.object({
  customerId:  z.string(),
  name:        z.string(),
  phone:       z.string(),
  daysOverdue: z.number(),
  amountDue:   z.number(),
  // Present when the record came from a CPF-targeted lookup (getBillingStatusForAllowlist);
  // used to re-verify the allowlist gate at send time regardless of source.
  document:    z.string().optional(),
  pixCode:     z.string().optional(),
});

export const DueSoonCustomerSchema = z.object({
  customerId: z.string(),
  name:       z.string(),
  phone:      z.string(),
  dueDate:    z.string(),
  amount:     z.number(),
  document:   z.string().optional(),
  pixCode:    z.string().optional(),
});

export const SuspendReactivateResponseSchema = z.object({
  customerId: z.string(),
  status:     z.enum(['suspended', 'active']),
  updatedAt:  z.string(),
});

export type OverdueCustomer = z.infer<typeof OverdueCustomerSchema>;
export type DueSoonCustomer = z.infer<typeof DueSoonCustomerSchema>;
export type SuspendReactivateResponse = z.infer<typeof SuspendReactivateResponseSchema>;

// ── Billing status by CPF (targeted allowlist lookup, no bulk endpoint needed) ─

export const BillingStageSchema = z.enum(['d5', 'd3', 'd2', 'd0', 'd3_overdue', 'd5_overdue']);
export type BillingStage = z.infer<typeof BillingStageSchema>;

export const BillingStatusEntrySchema = z.object({
  customerId:   z.string(),
  document:     z.string(),
  name:         z.string(),
  phone:        z.string(),
  dueDate:      z.string(),
  amount:       z.number(),
  daysUntilDue: z.number(), // negative = overdue
  pixCode:      z.string().optional(),
  stage:        BillingStageSchema.nullable(), // null = not in any tracked notification window today
});
export type BillingStatusEntry = z.infer<typeof BillingStatusEntrySchema>;

// ── Legacy list schemas (used by billing automations) ────────────────────────

export const OverdueCustomerListSchema  = z.array(OverdueCustomerSchema);
export const DueSoonCustomerListSchema  = z.array(DueSoonCustomerSchema);
export const TicketListSchema           = z.array(TicketSchema);
export const InvoiceListSchema          = z.array(InvoiceSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map SGP contratoStatus integer to normalized string. */
export function normalizeStatus(contratoStatus: number): 'active' | 'suspended' | 'cancelled' {
  if (contratoStatus === 1) return 'active';
  if (contratoStatus === 3) return 'cancelled';
  return 'suspended'; // 2 and any other value
}

/** Extract download Mbps from SGP plan name, e.g. "PLANO 50MB" → 50. */
export function extractDownloadMbps(planName: string): number | undefined {
  const m = planName.match(/(\d+)\s*(?:mb|mbps|mega)/i);
  return m ? parseInt(m[1], 10) : undefined;
}
