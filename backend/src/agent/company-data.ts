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
  { name: 'Basic', downloadMbps: 20,  uploadMbps: 10,  priceMonthly: 50  },
  { name: 'Turbo', downloadMbps: 50,  uploadMbps: 25,  priceMonthly: 70  },
  { name: 'Ultra', downloadMbps: 100, uploadMbps: 50,  priceMonthly: 90,  popular: true },
  { name: 'Giga',  downloadMbps: 300, uploadMbps: 150, priceMonthly: 130 },
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
  installationFee:        0,
  loyaltyMonths:          12,
  installationDaysMax:    3,
  paymentMethods:         ['PIX', 'boleto'] as string[],
  earlyPaymentDiscount:   10,
  supportHours:           '24h via WhatsApp',
  popularPlan:            'Ultra 100 Mbps',
};
