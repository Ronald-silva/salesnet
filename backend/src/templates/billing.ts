/**
 * Templates de Mensagem — Billing
 *
 * Substitui o sistema de Template SIDs do Twilio por templates locais.
 * Variáveis são interpoladas com ${nome_variavel}.
 */

// PIX é best-effort: só o codigopix já em cache em /api/central/titulos/ é usado (o
// endpoint dedicado de geração está quebrado — ver integrations/sgp/billing.ts). Quando
// chave_pix vem vazio, a linha de PIX é omitida inteiramente — a mensagem nunca trava
// nem vira um "PIX: " sem valor.
//
// Nem asterisco (negrito) nem backtick (monospace) são usados neste arquivo: WhatsApp
// exige backtick TRIPLO para monospace real — backtick único não tem significado especial
// e aparece como caractere literal, o que corromperia o copia-e-cola do código PIX (o
// checksum CRC16 no final não tolera nenhum caractere extra colado junto).
export function pixLine(chavePix: string, label: string): string {
  return chavePix ? `${label}\n${chavePix}\n\n` : '';
}

export const BILLING_TEMPLATE_DEFS = {
  billing_reminder_d3: (v: Record<string, string>) =>
    `Olá, ${v['nome']}! 👋\n\nSua fatura de R$ ${v['valor']} vence em 3 dias (${v['data_vencimento']}).\n\n` +
    pixLine(v['chave_pix'] ?? '', '💳 Pague via PIX (copia e cola):') +
    `Qualquer dúvida, é só falar! 😊`,

  billing_reminder_d0: (v: Record<string, string>) =>
    `Olá, ${v['nome']}! ⚠️\n\nSua fatura de R$ ${v['valor']} vence hoje!\n\n` +
    pixLine(v['chave_pix'] ?? '', '💳 PIX copia e cola:') +
    `Evite a interrupção do serviço pagando hoje. 🙏\n\n` +
    `Após o pagamento, a fatura é atualizada automaticamente em nosso sistema. ✅`,

  billing_overdue_d3: (v: Record<string, string>) =>
    `Olá, ${v['nome']}!\n\nIdentificamos que sua fatura de R$ ${v['valor']} está em atraso.\n\n` +
    pixLine(v['chave_pix'] ?? '', '💳 Regularize agora via PIX:') +
    `Qualquer dificuldade, entre em contato — podemos ajudar! 💬\n\n` +
    `Após o pagamento, a fatura é atualizada automaticamente em nosso sistema. ✅`,

  billing_suspended_d5: (v: Record<string, string>) =>
    `Olá, ${v['nome']}.\n\nDevido ao não pagamento da fatura de R$ ${v['valor']}, seu serviço será suspenso em breve por falta de pagamento.\n\n` +
    pixLine(v['chave_pix'] ?? '', '💳 Evite a suspensão — regularize agora via PIX:') +
    `Após o pagamento, a fatura é atualizada automaticamente em nosso sistema. ✅`,
} as const;

export type BillingTemplateName = keyof typeof BILLING_TEMPLATE_DEFS;
