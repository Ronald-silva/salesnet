import { supabase } from '../config/supabase';

// Mapeia o session_mode do processor para a categoria da base de conhecimento.
// 'default' não tem categoria correspondente — não faz lookup.
const MODE_TO_CATEGORY: Record<string, string> = {
  support:    'tecnico',
  billing:    'cobranca',
  commercial: 'comercial',
  prospect:   'prospect',
};

// Stopwords PT comuns + ruído de atendimento, removidas antes do overlap.
const STOPWORDS = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
  'e', 'ou', 'que', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'pra', 'com',
  'sem', 'meu', 'minha', 'meus', 'minhas', 'seu', 'sua', 'eu', 'me', 'te', 'se',
  'ele', 'ela', 'voce', 'vc', 'ta', 'esta', 'estou', 'to', 'nao', 'sim', 'mais',
  'muito', 'ja', 'so', 'tem', 'ter', 'foi', 'ser', 'estar', 'aqui', 'ai', 'la',
  'isso', 'esse', 'essa', 'este', 'esta', 'ao', 'as', 'mas', 'como', 'quando',
  'porque', 'qual', 'quero', 'queria', 'preciso', 'pode', 'poderia', 'ajuda',
  'oi', 'ola', 'bom', 'boa', 'dia', 'tarde', 'noite', 'obrigado', 'obrigada',
  'favor', 'gente', 'pessoal', 'entao', 'agora', 'hoje', 'tudo', 'bem',
]);

function extractKeywords(message: string): string[] {
  const tokens = message
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return [...new Set(tokens)];
}

/**
 * Busca soluções que já funcionaram para problemas similares (mesmo tenant,
 * mesma categoria, overlap de palavras-chave) e devolve um bloco para o prompt.
 * Best-effort: retorna '' quando não há categoria, keywords ou correspondência.
 */
export async function lookupKnowledge(
  tenantId: string,
  message: string,
  sessionMode: string,
): Promise<string> {
  const category = MODE_TO_CATEGORY[sessionMode];
  if (!category) return '';

  const keywords = extractKeywords(message);
  if (keywords.length === 0) return '';

  try {
    const { data, error } = await supabase
      .from('knowledge_base')
      .select('solution, success_count')
      .eq('tenant_id', tenantId)
      .eq('category', category)
      .overlaps('problem_keywords', keywords)
      .order('success_count', { ascending: false })
      .order('last_used_at', { ascending: false })
      .limit(2);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return '';

    const lines = rows.map((r) => {
      const count = (r.success_count as number | null) ?? 1;
      return `- ${String(r.solution)} (funcionou ${count} ${count === 1 ? 'vez' : 'vezes'})`;
    });

    return `\n\n## Soluções que já funcionaram para problema similar\n${lines.join('\n')}`;
  } catch (err) {
    console.warn('[knowledge-lookup] lookupKnowledge failed:', err);
    return '';
  }
}
