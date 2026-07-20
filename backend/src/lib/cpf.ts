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
 * All maximal digit runs in the text that are exactly 11 characters long — the
 * shape both a CPF and a BR mobile number (without country code) share. A run
 * embedded in something longer (a barcode, a protocol number) is deliberately
 * NOT sliced into an 11-digit candidate; only a standalone run of exactly 11
 * digits counts.
 */
function bareElevenDigitRuns(text: string): string[] {
  const runs = text.match(/\d+/g) ?? [];
  return runs.filter((run) => run.length === 11);
}

/**
 * Extracts a bare 11-digit CPF from anywhere in the text, validated by checksum.
 * No "cpf" keyword/formatting and no message-length limit required — the
 * checksum (isValidCpf) is what distinguishes a real CPF from an equally-long
 * BR mobile number (a random 11-digit run has roughly a 1-in-121 chance of
 * coincidentally passing both check digits), so gating on text length is
 * unnecessary once every candidate is checksum-validated.
 * If the message contains more than one 11-digit run (e.g. a phone number and
 * a CPF in the same sentence), returns the first one — in reading order —
 * that passes the checksum.
 */
export function extractBareCpfWhenAsked(text: string): string | null {
  for (const run of bareElevenDigitRuns(text)) {
    if (isValidCpf(run)) return run;
  }
  return null;
}

/**
 * True when the text contains an 11-digit run that has CPF *shape* but fails
 * the checksum on every candidate present — the ambiguous case ("looks like a
 * CPF, isn't one") worth flagging to the LLM so it doesn't silently fall back
 * to a stale identity. Distinct from "no CPF-shaped number at all", which is
 * the ordinary continuation-of-conversation case and should stay quiet.
 */
export function hasInvalidBareCpfCandidate(text: string): boolean {
  const runs = bareElevenDigitRuns(text);
  return runs.length > 0 && runs.every((run) => !isValidCpf(run));
}
