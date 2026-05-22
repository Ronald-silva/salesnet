/** Heuristic tiering for cost vs quality — no extra LLM call. */

export type ComplexityTier = 'simple' | 'intermediate' | 'complex';

const COMPLEX_RE =
  /procon|anatel|judicial|advogad|processo|ação\s+judicial|ação judicial|reclama[cç][aã]o\s+formal|ouvidoria|crime|golpe|fraudes?|amea[cç]a|justi[cç]a|small\s*claims|consumidor\s*defesa/i;

const GREETING_RE = /^(oi|olá|ola|hey|e\s*a[ií]|bom\s+dia|boa\s+tarde|boa\s+noite)\b[!?.…\s]*$/i;

/** Short FAQ-style messages (likely answerable with little context / fewer tools). */
const FAQ_HINT_RE =
  /\b(planos?|pre[çc]o|valor|quanto\s+custa|cobertura|bairros?|atende|hor[aá]rio|pix|fatura|2fa|segunda\s+via)\b/i;

export function classifyMessageComplexity(message: string): ComplexityTier {
  const text = message.trim();
  if (!text) {
    return 'intermediate';
  }

  if (COMPLEX_RE.test(text)) {
    return 'complex';
  }

  const short = text.length <= 100;
  if ((GREETING_RE.test(text) || FAQ_HINT_RE.test(text)) && short) {
    return 'simple';
  }

  return 'intermediate';
}
