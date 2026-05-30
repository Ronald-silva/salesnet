/**
 * Canonical Brazilian phone normalization (E.164 with + prefix).
 *
 * Merged from legacy helpers:
 * - stripPhone: only stripped non-digits; now the first step after JID handling.
 * - auth normalizePhone: +55 for 10–11 digit local numbers; + prefix when already has country 55.
 * - jidToPhone: stripped @s.whatsapp.net (or any @suffix) before parsing; kept.
 * - toSgpPhone: stripped leading 55 for SGP API — callers use .replace(/^\+55/, '') on this output.
 */
/** BR WhatsApp: 55 + DDD (2) + número (8 ou 9) = 12 ou 13 dígitos. */
export function isValidBrazilWhatsAppDigits(digits: string): boolean {
  return /^55\d{10,11}$/.test(digits);
}

export function normalizePhone(raw: string): string {
  const withoutJid = raw.replace(/@[^@]+$/, '');
  const digits = withoutJid.replace(/\D/g, '');
  if (!digits) return '+';

  if (digits.startsWith('55')) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

/** E.164 (+55…) ou null se o JID/número não for um celular BR válido para WhatsApp. */
export function phoneFromWhatsAppJid(jid: string): string | null {
  const digits = jid.replace(/@[^@]+$/, '').replace(/\D/g, '');
  if (!isValidBrazilWhatsAppDigits(digits)) return null;
  return `+${digits}`;
}

/** Dígitos BR (55…) para envio Evolution, ou null se inválido. */
export function toWhatsAppSendDigits(phone: string): string | null {
  const digits = normalizePhone(phone).replace(/\D/g, '');
  if (!isValidBrazilWhatsAppDigits(digits)) return null;
  return digits;
}
