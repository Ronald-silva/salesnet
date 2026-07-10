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

export interface PixResolveResult {
  text: string;
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
      let substituted = 0;
      const resolvedText = text.replace(PLACEHOLDER_RE, (match, id: string) => {
        const code = codeByTokenId.get(id.toLowerCase());
        if (!code) {
          unknownTokens.push(match);
          return match;
        }
        substituted += 1;
        return code;
      });
      const malformedLeftover =
        unknownTokens.length === 0 && LEFTOVER_TOKEN_RE.test(resolvedText);
      return {
        text: resolvedText,
        substituted,
        ok: unknownTokens.length === 0 && !malformedLeftover,
        unknownTokens,
        malformedLeftover,
      };
    },
    size: () => codeByTokenId.size,
  };
}
