import { randomUUID } from 'crypto';

// Tolera o que um LLM menor pode produzir ao copiar o placeholder: espaços
// internos e hex maiúsculo. O id canônico é sempre lowercase.
const PLACEHOLDER_RE = /\{\{\s*PIX_([0-9a-fA-F]{8})\s*\}\}/g;
// Resíduo de placeholder malformado (sem as chaves duplas) que sobreviveu à
// substituição — nunca deve chegar ao cliente; sinaliza bloqueio no chamador.
const LEFTOVER_TOKEN_RE = /PIX_[0-9a-fA-F]{8}/;

// Únicos campos que carregam payload PIX copia-e-cola em saída de tool hoje:
// pixKey (gerar_pix) e pixCode (Invoice de listar_faturas/get_fatura_atual e
// suggested_invoice aninhada). Toda tool futura com código PIX entra aqui.
const PIX_FIELDS = new Set(['pixKey', 'pixCode']);

export interface PixMessagePart {
  kind: 'text' | 'pix';
  content: string;
}

export interface PixResolveResult {
  text: string;
  /**
   * text fatiado nos placeholders, em ordem: cada código PIX vira uma parte 'pix'
   * isolada (payload cru, pronto para ir sozinho numa mensagem de WhatsApp) e o
   * texto ao redor vira partes 'text'. Invariante: concat(parts) === text.
   */
  parts: PixMessagePart[];
  substituted: number;
  /** false = havia placeholder desconhecido ou malformado — o chamador DEVE bloquear o envio. */
  ok: boolean;
  unknownTokens: string[];
  malformedLeftover: boolean;
}

export interface PixTokenVault {
  /** Cópia profunda com todo pixKey/pixCode substituído por "{{PIX_xxxxxxxx}}". Não muta a entrada. */
  tokenize<T>(value: T): T;
  /** Substitui placeholders deste turno pelo código real; sinaliza qualquer resíduo. */
  resolve(text: string): PixResolveResult;
  size(): number;
}

// Um vault por turno de processMessage: os placeholders nunca atravessam
// turnos — placeholder antigo copiado do histórico não resolve e bloqueia,
// que é exatamente a regra "reenvio exige gerar_pix novo".
export function createPixTokenVault(): PixTokenVault {
  const codeByTokenId = new Map<string, string>();
  const tokenIdByCode = new Map<string, string>();

  const placeholderFor = (code: string): string => {
    let id = tokenIdByCode.get(code);
    if (!id) {
      id = randomUUID().replace(/-/g, '').slice(0, 8);
      codeByTokenId.set(id, code);
      tokenIdByCode.set(code, id);
    }
    return `{{PIX_${id}}}`;
  };

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] =
        PIX_FIELDS.has(key) && typeof v === 'string' && v.length > 0
          ? placeholderFor(v)
          : walk(v);
    }
    return out;
  };

  return {
    tokenize<T>(value: T): T {
      return walk(value) as T;
    },
    resolve(text: string): PixResolveResult {
      const unknownTokens: string[] = [];
      const parts: PixMessagePart[] = [];
      let substituted = 0;
      let sliceStart = 0;

      PLACEHOLDER_RE.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
        const code = codeByTokenId.get(match[1]!.toLowerCase());
        if (!code) {
          // Placeholder desconhecido fica no texto (parte 'text' seguinte o inclui);
          // ok=false abaixo obriga o chamador a bloquear antes de qualquer envio.
          unknownTokens.push(match[0]);
          continue;
        }
        if (match.index > sliceStart) {
          parts.push({ kind: 'text', content: text.slice(sliceStart, match.index) });
        }
        parts.push({ kind: 'pix', content: code });
        substituted += 1;
        sliceStart = match.index + match[0].length;
      }
      if (sliceStart < text.length) {
        parts.push({ kind: 'text', content: text.slice(sliceStart) });
      }

      const resolvedText = parts.map((p) => p.content).join('');
      const malformedLeftover =
        unknownTokens.length === 0 && LEFTOVER_TOKEN_RE.test(resolvedText);
      return {
        text: resolvedText,
        parts,
        substituted,
        ok: unknownTokens.length === 0 && !malformedLeftover,
        unknownTokens,
        malformedLeftover,
      };
    },
    size: () => codeByTokenId.size,
  };
}
