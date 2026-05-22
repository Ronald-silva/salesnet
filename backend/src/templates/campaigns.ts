/**
 * Templates de Mensagem — Campanhas
 */

export const CAMPAIGN_TEMPLATE_DEFS = {
  upsell_offer: (v: Record<string, string>) =>
    `Olá, ${v['nome']}! 🚀\n\nTemos uma oferta especial para você: *${v['plano']}* por apenas *R$ ${v['valor']}/mês*.\n\nQuer saber mais? É só responder aqui! 😊`,

  referral_request: (v: Record<string, string>) =>
    `Olá, ${v['nome']}! 🎁\n\nVocê sabia que pode ganhar *desconto na fatura* indicando amigos?\n\nCada indicação que ativar um plano rende benefícios para você!\n\nQuer participar? Responda "SIM" e te explico tudo. 👇`,

  churn_risk_outreach: (v: Record<string, string>) =>
    `Olá, ${v['nome']}! 💙\n\nNotamos que você tem tido algumas dificuldades com o serviço. Queremos melhorar sua experiência!\n\nPodemos conversar? Nosso time está pronto para ajudar. 🙏`,

  expansion_coverage: (v: Record<string, string>) =>
    `Olá! 📡\n\nA *${v['empresa']}* chegou no seu bairro!\n\nPlanos de fibra óptica a partir de *R$ ${v['preco_min']}/mês* com instalação gratuita.\n\nQuer saber mais? Responda aqui! 😊`,
} as const;

export type CampaignTemplateName = keyof typeof CAMPAIGN_TEMPLATE_DEFS;
