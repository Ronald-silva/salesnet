/**
 * Canonical Brazilian phone normalization (E.164 with + prefix).
 *
 * Merged from legacy helpers:
 * - stripPhone: only stripped non-digits; now the first step after JID handling.
 * - auth normalizePhone: +55 for 10–11 digit local numbers; + prefix when already has country 55.
 * - jidToPhone: stripped @s.whatsapp.net (or any @suffix) before parsing; kept.
 * - toSgpPhone: stripped leading 55 for SGP API — callers use .replace(/^\+55/, '') on this output.
 */
export function normalizePhone(raw: string): string {
  const withoutJid = raw.replace(/@[^@]+$/, '');
  const digits = withoutJid.replace(/\D/g, '');
  if (!digits) return '+';

  if (digits.startsWith('55')) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}
