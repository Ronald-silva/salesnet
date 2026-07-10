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
  /i[\s_-]*g[\s_-]*n[\s_-]*o[\s_-]*r[\s_-]*e/gi,
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

// U+0001 nunca aparece em texto de mensagem normal, não é whitespace (sobrevive a
// .trim()) nem "*"/"\n" (sobrevive aos regexes de negrito abaixo) — marcador seguro
// para proteger trechos entre crases (ou payloads PIX crus) até a substituição final.
const CODE_SPAN_MARKER = String.fromCharCode(1);
const CODE_SPAN_RE = new RegExp(`${CODE_SPAN_MARKER}(\\d+)${CODE_SPAN_MARKER}`, 'g');

// Rede de segurança independente do LLM lembrar de envolver o PIX em crase: todo
// payload PIX/EMV copia-e-cola começa com "000201" (Payload Format Indicator fixo,
// tag 00 len 02 valor "01") e termina na tag de CRC16 "6304" + 4 dígitos hex. Não é
// (nem precisa ser) um validador EMV completo — só específico o bastante pra nunca
// casar com texto normal em português. Não exclui espaço porque o campo de nome do
// recebedor (tag 59) legitimamente contém espaços (ex.: "NEGOCIARIE COBRANCA E ASS").
// Exportado para containsUnverifiedPix() abaixo reusar o mesmo reconhecedor.
export const PIX_EMV_RE = /000201[^\n]{20,600}?6304[0-9A-Fa-f]{4}/g;

function protectCodeSpans(text: string): { protectedText: string; codeSpans: string[] } {
  const codeSpans: string[] = [];
  const toMarker = (content: string): string => {
    codeSpans.push(content);
    return `${CODE_SPAN_MARKER}${codeSpans.length - 1}${CODE_SPAN_MARKER}`;
  };

  // 1) Trechos entre crase simples. A própria crase é descartada aqui (fica só o
  // conteúdo interno): crase simples não é markdown real no WhatsApp — aparece como
  // caractere literal — e se o cliente copiar a mensagem esse caractere extra vai
  // colado ao payload EMV e quebra o CRC16, o mesmo problema que os asteriscos
  // causavam antes deste arquivo existir.
  const afterBackticks = text.replace(/`([^`\n]*)`/g, (_, inner: string) => toMarker(inner));
  // 2) Payload PIX cru que tenha escapado sem crase (ver PIX_EMV_RE acima).
  const protectedText = afterBackticks.replace(PIX_EMV_RE, toMarker);

  return { protectedText, codeSpans };
}

/**
 * Remove markdown com asteriscos — WhatsApp Web não renderiza negrito assim.
 *
 * Protege qualquer trecho entre crases simples (`código`, caso a Sofia ainda insira
 * isso por conta própria) e, como rede de segurança adicional, qualquer payload
 * PIX cru reconhecível mesmo sem crase (PIX_EMV_RE) — em ambos os casos a crase em
 * si é descartada no texto final, nunca chega ao cliente (ver protectCodeSpans).
 *
 * Sem a proteção do conteúdo entre crases, quando a resposta tem DOIS códigos PIX
 * na mesma mensagem (ex.: "gere o PIX das 2 faturas"), o regex de negrito duplo
 * (**) casava um asterisco solto de um código com outro do segundo código — ambos
 * contêm literalmente "***" (placeholder EMV de txid vazio, comum em códigos
 * reais) — e apagava tudo entre eles, incluindo 2 dos 3 asteriscos de cada código.
 * Confirmado em produção (interaction_logs id=35e5f11f-1a73-47cf-a6e2-3f167c971788):
 * pixKey original com "...62070503***6304..." chegou como "...62070503*6304...".
 *
 * Também restringe os dois regexes de negrito a não cruzar quebra de linha —
 * negrito legítimo nunca precisa atravessar parágrafos, e essa é a segunda camada
 * de proteção caso o código apareça sem crase e sem bater o padrão de PIX_EMV_RE.
 */
export function formatOutgoingWhatsApp(text: string): string {
  const { protectedText, codeSpans } = protectCodeSpans(text);

  const stripped = protectedText
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .trim();

  return stripped.replace(CODE_SPAN_RE, (_, i: string) => codeSpans[Number(i)]!);
}

// Só tools que devolvem fatura real do SGP contam como fonte verificada de PIX —
// uma tool qualquer que ecoe texto controlado pelo cliente não pode "lavar" um
// código fabricado para dentro da allowlist.
const INVOICE_BEARING_TOOLS = new Set(['gerar_pix', 'listar_faturas', 'get_fatura_atual']);

function collectPixCodes(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPixCodes(item, into);
    return;
  }
  if (value === null || typeof value !== 'object') return;

  const obj = value as { pixKey?: unknown; pixCode?: unknown; suggested_invoice?: unknown };
  for (const key of [obj.pixKey, obj.pixCode]) {
    if (typeof key === 'string' && key.length > 0) into.add(key);
  }
  if (obj.suggested_invoice) collectPixCodes(obj.suggested_invoice, into);
}

/**
 * Última rede de segurança contra PIX fabricado/alucinado pelo LLM: todo trecho da
 * resposta que bate PIX_EMV_RE precisa corresponder EXATAMENTE a um código devolvido
 * por uma chamada real de tool de fatura nesta mesma interação (toolCallLog do turno
 * atual — nunca histórico persistido). Sem isso, um LLM que "lembra" um código PIX
 * de uma mensagem anterior da conversa (em vez de rechamar a tool) pode reproduzi-lo
 * com corrupção sutil — checksum quebrado, sem erro visível até o cliente tentar
 * pagar — ou inventar um código para uma fatura que nunca existiu. Confirmado em
 * produção: código com estrutura EMV inválida (asterisco único onde deveria haver
 * três) e PIX gerado para uma fatura fictícia ("Março/2027") fora da lista real do
 * cliente.
 *
 * Fontes aceitas: pixKey de gerar_pix, pixCode das faturas de listar_faturas /
 * get_fatura_atual e da suggested_invoice de um gerar_pix com
 * requires_disambiguation — todas vêm do mesmo cache do SGP (/api/central/titulos/),
 * só por caminhos de chamada diferentes. Incidente real (2026-07-10, interaction_logs
 * id=37661add): gerar_pix falhou (403 no endpoint direto do SGP) mas listar_faturas
 * do mesmo turno já trazia o pixCode legítimo; a versão antiga só reconhecia
 * gerar_pix e bloqueava um código real. Fail-safe: se algo parece PIX e não bate com
 * nenhuma saída real de tool deste turno, o chamador deve bloquear o envio — nunca
 * deixar passar sem certeza.
 *
 * Desde a migração para placeholders ({{PIX_xxxxxxxx}}, ver pix-token-vault.ts),
 * o toolCallLog de produção carrega tokens — a allowlist fica vazia e qualquer
 * EMV cru no texto do LLM bloqueia. A lógica de allowlist permanece como estava
 * (defesa em profundidade e compat com chamadas que passem outputs crus).
 */
export function containsUnverifiedPix(
  text: string,
  toolCallLog: ReadonlyArray<{ name: string; output: unknown }>,
): boolean {
  const matches = text.match(PIX_EMV_RE);
  if (!matches) return false;

  const verifiedPixKeys = new Set<string>();
  for (const call of toolCallLog) {
    if (!INVOICE_BEARING_TOOLS.has(call.name)) continue;
    collectPixCodes(call.output, verifiedPixKeys);
  }

  return matches.some((match) => !verifiedPixKeys.has(match));
}
