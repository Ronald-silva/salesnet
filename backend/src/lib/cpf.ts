/** Strip formatting; returns digits only. */
export function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Validates CPF length AND check digits (modulo 11). Rejects all-same-digit sequences. */
export function isValidCpf(cpf: string): boolean {
  const d = normalizeCpf(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // rejects "00000000000", "11111111111", etc.
  const calc = (len: number): number => {
    const sum = d.slice(0, len).split('').reduce((acc, n, i) => acc + Number(n) * (len + 1 - i), 0);
    const rem = (sum * 10) % 11;
    return rem === 10 ? 0 : rem;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Length-only check kept for backwards compatibility in non-critical paths. */
export function isValidCpfLength(cpf: string): boolean {
  return normalizeCpf(cpf).length === 11;
}

/**
 * Extracts CPF from user text when clearly indicated (formatted or labeled).
 * Avoids bare 11-digit sequences — they overlap with Brazilian mobile numbers.
 *
 * Handles:
 *   - Formatted:  "049.763.013-38", "049 763 013-38", "meu cpf é 049.763.013-38"
 *   - Labeled:    "cpf: 04976301338", "cpf 04976301338", "cpf - 04976301338"
 *   - Natural PT: "meu cpf é 04976301338", "cpf e 04976301338", "cpf=04976301338"
 */
export function extractCpfFromText(text: string): string | null {
  // 1. Formatted CPF anywhere in text (dots/spaces/dashes as separators)
  const formatted = text.match(/\b(\d{3})[.\s](\d{3})[.\s](\d{3})[-\s]?(\d{2})\b/);
  if (formatted) {
    const digits = formatted.slice(1).join('');
    if (digits.length === 11) return digits;
  }

  // 2. "cpf" keyword followed by up to 20 non-digit characters then the number.
  //    Covers "cpf:", "cpf -", "cpf é", "cpf e", "cpf=", "cpf numero", etc.
  const labeled = text.match(/\bcpf\b[^0-9]{0,20}?(\d{3}[.\-\s]?\d{3}[.\-\s]?\d{3}[.\-\s]?\d{2}|\d{11})/i);
  if (labeled?.[1]) {
    const digits = normalizeCpf(labeled[1]);
    if (digits.length === 11) return digits;
  }

  return null;
}

/**
 * Extracts a bare 11-digit CPF when context indicates Sofia asked for it.
 * Only activates on short messages (≤ 50 chars) to avoid capturing phone numbers
 * embedded in longer sentences. Caller must verify Sofia's prior request.
 */
export function extractBareCpfWhenAsked(text: string): string | null {
  if (text.trim().length > 50) return null;
  const digits = text.replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}
