/**
 * Fonte única de verdade para dados estáticos da SalesNet Telecom.
 * Este arquivo é a referência canônica — qualquer mudança de plano,
 * bairro ou política deve ser feita aqui primeiro.
 */

export interface Plan {
  name: string;
  downloadMbps: number;
  uploadMbps: number;
  priceMonthly: number;
  popular?: boolean;
}

export const PLANS: Plan[] = [
  { name: '400 Mega', downloadMbps: 400, uploadMbps: 200, priceMonthly: 79.99 },
  { name: '500 Mega', downloadMbps: 500, uploadMbps: 250, priceMonthly: 89.99, popular: true },
  { name: '700 Mega', downloadMbps: 700, uploadMbps: 350, priceMonthly: 109.99 },
];

export const COVERED_NEIGHBORHOODS: string[] = [
  'Jardim Guanabara',
  'Jardim Iracema',
  'Quintino Cunha',
  'Vila Velha',
  'Nova Assunção',
];

export const BUSINESS_INFO = {
  city:                   'Fortaleza/CE',
  installationFee:        50,
  loyaltyMonths:          12,
  installationDaysMax:    3,
  paymentMethods:         ['PIX', 'boleto'] as string[],
  earlyPaymentDiscount:   10,
  supportHours:           '24h via WhatsApp',
  popularPlan:            '500 Mega',
};
