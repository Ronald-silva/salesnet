/**
 * Templates de Mensagem — Billing
 *
 * Substitui o sistema de Template SIDs do Twilio por templates locais.
 * Variáveis são interpoladas com ${nome_variavel}.
 */

export const BILLING_TEMPLATE_DEFS = {
  billing_reminder_d3: (v: Record<string, string>) =>
    `Olá, ${v['nome']}! 👋\n\nSua fatura de *R$ ${v['valor']}* vence em *3 dias* (${v['data_vencimento']}).\n\n💳 Pague via PIX (copia e cola):\n\`${v['chave_pix']}\`\n\nQualquer dúvida, é só falar! 😊`,

  billing_reminder_d0: (v: Record<string, string>) =>
    `Olá, ${v['nome']}! ⚠️\n\nSua fatura de *R$ ${v['valor']}* vence *hoje*!\n\n💳 PIX copia e cola:\n\`${v['chave_pix']}\`\n\nEvite a interrupção do serviço pagando hoje. 🙏`,

  billing_overdue_d3: (v: Record<string, string>) =>
    `Olá, ${v['nome']}!\n\nIdentificamos que sua fatura de *R$ ${v['valor']}* está em atraso.\n\n💳 Regularize agora via PIX:\n\`${v['chave_pix']}\`\n\nQualquer dificuldade, entre em contato — podemos ajudar! 💬`,

  billing_suspended_d5: (v: Record<string, string>) =>
    `Olá, ${v['nome']}.\n\nDevido ao não pagamento da fatura de *R$ ${v['valor']}*, seu serviço foi suspenso.\n\n💳 Para reativar, pague via PIX:\n\`${v['chave_pix']}\`\n\nApós o pagamento, a reconexão ocorre automaticamente em até 1 hora. ✅`,
} as const;

export type BillingTemplateName = keyof typeof BILLING_TEMPLATE_DEFS;
