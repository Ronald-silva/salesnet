import { z } from 'zod';

// ── Contrato (real SGP response from /api/ura/consultacliente/) ───────────────

export const ContratoSchema = z.object({
  contratoId:           z.number(),
  clienteId:            z.number(),
  razaoSocial:          z.string(),
  cpfCnpj:              z.string(),
  telefones:            z.array(z.string()).default([]),
  emails:               z.array(z.string()).default([]),

  // Contract status: 1=Ativo, 2=Suspenso/Bloqueado, 3=Cancelado
  contratoStatus:        z.number(),
  contratoStatusDisplay: z.string(),

  // Plan
  planointernet:         z.string(),
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
});

export const DueSoonCustomerSchema = z.object({
  customerId: z.string(),
  name:       z.string(),
  phone:      z.string(),
  dueDate:    z.string(),
  amount:     z.number(),
});

export const SuspendReactivateResponseSchema = z.object({
  customerId: z.string(),
  status:     z.enum(['suspended', 'active']),
  updatedAt:  z.string(),
});

export type OverdueCustomer = z.infer<typeof OverdueCustomerSchema>;
export type DueSoonCustomer = z.infer<typeof DueSoonCustomerSchema>;
export type SuspendReactivateResponse = z.infer<typeof SuspendReactivateResponseSchema>;

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

/** Strip formatting from a Brazilian phone string → digits only. */
export function stripPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
