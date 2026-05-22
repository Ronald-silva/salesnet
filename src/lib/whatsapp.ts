const DEFAULT_WHATSAPP_NUMBER = "5585996032957";

export function buildWhatsAppLink(message?: string, phone = DEFAULT_WHATSAPP_NUMBER): string {
  const base = `https://wa.me/${phone}`;
  const text = message?.trim();

  if (!text) {
    return base;
  }

  return `${base}?text=${encodeURIComponent(text)}`;
}

export function buildNetworkIssueMessage(neighborhood: string): string {
  return `Olá! Estou com problema de conexão no bairro ${neighborhood} e gostaria de abrir um chamado.`;
}

export function buildCoverageMessage(locationOrCep: string): string {
  return `Olá! Gostaria de verificar cobertura para o CEP/endereço: ${locationOrCep}`;
}

export interface HotspotLeadInput {
  name: string;
  businessType: string;
  address: string;
  neighborhood: string;
  phone: string;
  notes?: string;
}

export function buildHotspotLeadMessage(input: HotspotLeadInput): string {
  return [
    "Olá! Quero solicitar parceria de hotspot.",
    "",
    `Nome: ${input.name}`,
    `Tipo de negócio: ${input.businessType}`,
    `Endereço: ${input.address}`,
    `Bairro: ${input.neighborhood}`,
    `Telefone: ${input.phone}`,
    `Informações adicionais: ${input.notes?.trim() || "Não informado"}`,
  ].join("\n");
}

export interface ContactFormInput {
  name: string;
  email: string;
  phone: string;
  interest: string;
  message: string;
}

export function buildContactMessage(input: ContactFormInput): string {
  return [
    "Olá! Entrei em contato pelo site.",
    "",
    `Nome: ${input.name}`,
    `Email: ${input.email}`,
    `Telefone: ${input.phone}`,
    `Assunto: ${input.interest}`,
    `Mensagem: ${input.message}`,
  ].join("\n");
}

export interface JobApplicationInput {
  name: string;
  email: string;
  phone: string;
  role: string;
  about: string;
  hasNetworkExperience: boolean;
  hasFlexibleHours: boolean;
  hasCNH: boolean;
}

export function buildJobApplicationMessage(input: JobApplicationInput): string {
  const triage = [
    `Experiência em rede/fibra: ${input.hasNetworkExperience ? "Sim" : "Não"}`,
    `Disponibilidade flexível: ${input.hasFlexibleHours ? "Sim" : "Não"}`,
    `Possui CNH B: ${input.hasCNH ? "Sim" : "Não"}`,
  ].join(" | ");

  return [
    "Olá! Quero me candidatar na SalesNet.",
    "",
    `Nome: ${input.name}`,
    `Email: ${input.email}`,
    `Telefone: ${input.phone}`,
    `Vaga de interesse: ${input.role}`,
    `Triagem: ${triage}`,
    `Motivação: ${input.about}`,
  ].join("\n");
}

