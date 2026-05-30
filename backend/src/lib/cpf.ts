/** Strip formatting; returns digits only. */
export function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function isValidCpfLength(cpf: string): boolean {
  return normalizeCpf(cpf).length === 11;
}

/**
 * Extracts CPF from user text when clearly indicated (formatted or labeled).
 * Avoids bare 11-digit sequences — they overlap with Brazilian mobile numbers.
 */
export function extractCpfFromText(text: string): string | null {
  const formatted = text.match(/\b(\d{3})[.\s](\d{3})[.\s](\d{3})[-\s]?(\d{2})\b/);
  if (formatted) {
    const digits = formatted.slice(1).join('');
    if (digits.length === 11) return digits;
  }

  const labeled = text.match(/\bcpf\s*[:.]?\s*([\d.\-\s]{11,14}|\d{11})/i);
  if (labeled?.[1]) {
    const digits = normalizeCpf(labeled[1]);
    if (digits.length === 11) return digits;
  }

  return null;
}
