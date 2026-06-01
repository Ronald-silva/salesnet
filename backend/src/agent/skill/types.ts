export interface ISPPlan {
  name: string;
  downloadMbps: number;
  uploadMbps: number;
  priceMonthly: number;
  popular?: boolean;
  description?: string;
  minExpectedMbps?: number;
}

export interface ISPBusinessInfo {
  providerName: string;
  agentName: string;
  agentGender: 'f' | 'm';
  city: string;
  whatsappSupportHours: string;
  humanSupportHours?: string;
  installationFeeReais: number;
  installationDaysMax: number;
  loyaltyMonths: number;
  tvAddonMonthly?: number;
  earlyPaymentDiscountPct?: number;
  paymentMethods: string[];
  hiringPageUrl?: string;
}

export interface ISPSkillConfig {
  tenantId: string;
  business: ISPBusinessInfo;
  plans: ISPPlan[];
  coveredNeighborhoods: string[];
  erpCapabilities: {
    canSuspend: boolean;
    canReactivate: boolean;
    canUpgrade: boolean;
    canListTickets: boolean;
    hasBulkCustomerQuery: boolean;
  };
  toneOverride?: string;
  extraFaqs?: Array<{ trigger: string; answer: string }>;
}

export interface ConversationContext {
  phone: string;
  sessionMode: string;
  customerData: Record<string, unknown>;
  invoiceStatus?: string;
  insightsContext: string;
  coverageContext: string;
  fortalezaTime: string;
}
