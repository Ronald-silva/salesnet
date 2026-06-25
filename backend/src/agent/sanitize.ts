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
  // DAN e personas
  /\[DAN\]/gi,
  /do anything now/gi,
  /developer mode/gi,
  /jailbreak/gi,
  // Tokens de modelo (injeção de prompt de sistema)
  /<\|im_start\|>/gi,
  /<\|system\|>/gi,
  /<\/s>/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  // Variantes PT não cobertas
  /suas novas instru[çc][oõ]es s[aã]o/gi,
  /a partir de agora voc[eê] [eé]/gi,
  /mude seu comportamento/gi,
  /ignore todas as instru[çc][oõ]es/gi,
  /esquece?\s+(o que|tudo)\s+(te |lhe )?ensinaram/gi,
  // Obfuscação com espaços/separadores
  /i[\s_\-]*g[\s_\-]*n[\s_\-]*o[\s_\-]*r[\s_\-]*e/gi,
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

/** Remove markdown com asteriscos — WhatsApp Web não renderiza negrito assim. */
export function formatOutgoingWhatsApp(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .trim();
}
