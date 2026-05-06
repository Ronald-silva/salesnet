import { z } from 'zod';

// --- Customer ---

export const CustomerPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  downloadMbps: z.number().finite(),
  uploadMbps: z.number().finite(),
  monthlyPrice: z.number().finite(),
});

export const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  document: z.string(),          // CPF or CNPJ
  email: z.string().email().optional(),
  phone: z.string().min(7),
  address: z.object({
    street: z.string(),
    number: z.string(),
    neighborhood: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }),
  status: z.enum(['active', 'suspended', 'cancelled']),
  plan: CustomerPlanSchema.optional(),
});

// --- Billing ---

export const InvoiceSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  amount: z.number().finite(),
  dueDate: z.string(),           // ISO date string
  status: z.enum(['open', 'paid', 'overdue', 'cancelled']),
  barcode: z.string().optional(),
});

export const PixKeySchema = z.object({
  invoiceId: z.string(),
  pixKey: z.string(),            // copia-e-cola (EMV)
  expiresAt: z.string().optional(),
});

export const OverdueCustomerSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  phone: z.string().min(7),
  daysOverdue: z.number().finite(),
  amountDue: z.number().finite(),
});

export const DueSoonCustomerSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  phone: z.string().min(7),
  dueDate: z.string(),
  amount: z.number().finite(),
});

export const SuspendReactivateResponseSchema = z.object({
  customerId: z.string(),
  status: z.enum(['suspended', 'active']),
  updatedAt: z.string(),
});

// --- Tickets ---

export const TicketSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  type: z.string(),
  description: z.string(),
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  createdAt: z.string(),
  resolvedAt: z.string().optional(),
});

export const OpenTicketResponseSchema = z.object({
  ticketId: z.string(),
  status: z.enum(['open', 'in_progress']),
  createdAt: z.string(),
});

export const ScheduleVisitResponseSchema = z.object({
  visitId: z.string(),
  customerId: z.string(),
  scheduledDate: z.string(),
  period: z.enum(['morning', 'afternoon']),
  status: z.enum(['scheduled', 'confirmed']),
});

// --- Network ---

export const ConnectionStatusSchema = z.object({
  customerId: z.string(),
  online: z.boolean(),
  currentDownloadMbps: z.number().optional(),
  currentUploadMbps: z.number().optional(),
  lastSeen: z.string().optional(),
});

export const NetworkNodeSchema = z.object({
  nodeId: z.string(),
  neighborhood: z.string(),
  online: z.boolean(),
  clientCount: z.number().finite(),
  lastChecked: z.string(),
});

// --- Inferred TypeScript types ---

export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerPlan = z.infer<typeof CustomerPlanSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type PixKey = z.infer<typeof PixKeySchema>;
export type OverdueCustomer = z.infer<typeof OverdueCustomerSchema>;
export type DueSoonCustomer = z.infer<typeof DueSoonCustomerSchema>;
export type SuspendReactivateResponse = z.infer<typeof SuspendReactivateResponseSchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type OpenTicketResponse = z.infer<typeof OpenTicketResponseSchema>;
export type ScheduleVisitResponse = z.infer<typeof ScheduleVisitResponseSchema>;
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;
export type NetworkNode = z.infer<typeof NetworkNodeSchema>;
