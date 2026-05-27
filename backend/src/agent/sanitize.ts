const MAX_MESSAGE_LENGTH = 2000;

// Patterns that signal prompt-injection attempts.
// No global flag — safe to call .replace() directly on each pass.
const INJECTION_PATTERNS: RegExp[] = [
  /#{3,}/gi,
  /---\s*SYSTEM\b/gi,
  /<\/?(?:system|instructions?|prompt)>/gi,
  /\bignore\s+(?:all\s+)?(?:the\s+)?(?:previous\s+)?instructions?\b/gi,
  /\bignore\s+(?:all|everything)\s+(?:above|before)\b/gi,
  /\bignore\s+as\s+instruções\b/gi,
  /\besqueça?\s+(?:tudo|as\s+instruções)\b/gi,
  /\bvocê\s+é\s+agora\b/gi,
  /\byou\s+are\s+now\b/gi,
  /\bact\s+as\s+(?:a\s+|an\s+)?\b/gi,
  /\bpretend\s+(?:you\s+are|to\s+be)\b/gi,
  /\bfinja\s+(?:que\s+você|ser)\b/gi,
  /\bnovas?\s+instruções?\s*:/gi,
  /\bnew\s+instructions?\s*:/gi,
  /\bsystem\s*:\s+/gi,
];

export function sanitizeUserInput(input: string): string {
  let result = input;
  let suspicious = false;

  if (result.length > MAX_MESSAGE_LENGTH) {
    suspicious = true;
    result = `${result.slice(0, MAX_MESSAGE_LENGTH)} [mensagem truncada]`;
  }

  for (const pattern of INJECTION_PATTERNS) {
    const cleaned = result.replace(pattern, ' ');
    if (cleaned !== result) {
      suspicious = true;
      result = cleaned;
    }
  }

  if (suspicious) {
    console.warn(`[security] suspicious input detected (original_length=${input.length})`);
  }

  return result.trim();
}
