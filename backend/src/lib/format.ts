const LOWERCASE_CONNECTIVES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Normaliza nome vindo do SGP (frequentemente em CAIXA ALTA) para Title Case,
 * mantendo conectivos comuns em português minúsculos — exceto quando são a
 * primeira palavra do nome. Uso restrito a exibição pro cliente (templates de
 * mensagem); não usar em busca/matching por nome, onde o valor original importa.
 */
export function titleCaseName(nome: string): string {
  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) => {
      if (index > 0 && LOWERCASE_CONNECTIVES.has(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}
