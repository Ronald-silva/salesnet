import { supabase } from '../../config/supabase';
import { env } from '../../config/env';

interface KnowledgeSeed {
  category: 'tecnico' | 'cobranca' | 'comercial' | 'prospect';
  problem_keywords: string[];
  solution: string;
  equipment?: string;
}

const SEEDS: KnowledgeSeed[] = [
  // ── TÉCNICO: ONU / Fibra ────────────────────────────────────────────────
  {
    category: 'tecnico',
    problem_keywords: ['internet', 'caiu', 'sem', 'conexao'],
    solution: 'Reiniciar ONU: desligar da tomada 30s, religar. Aguardar 2-3 min. 90% dos casos resolve.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['pon', 'piscando', 'sem', 'sinal'],
    solution: 'PON piscando = sem sinal da fibra. Verificar cabo fino (fibra) solto no ONT. Se LED LOS vermelho → técnico obrigatório.',
    equipment: 'HG8145V5',
  },
  {
    category: 'tecnico',
    problem_keywords: ['los', 'vermelho', 'luz'],
    solution: 'LOS vermelho = cabo de fibra com problema (dobrado, rompido ou conector sujo). Não há reset que resolva — abrir chamado técnico imediatamente.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['internet', 'lenta', 'devagar', 'travando'],
    solution: 'Solicitar teste de velocidade (fast.com). Se ok via cabo mas lento no Wi-Fi → interferência ou posicionamento. Se lento via cabo → chamado prioritário.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['wifi', 'sumiu', 'desapareceu', 'rede'],
    solution: 'Verificar luz Wi-Fi no roteador. Se apagada: botão Wi-Fi/WPS 3s. Se acesa mas não aparece: reiniciar Wi-Fi do celular. Se persistir: reset roteador 10s.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['senha', 'wifi', 'esqueci', 'alterada'],
    solution: 'Senha padrão na etiqueta do roteador (Password/Chave/PSK). Se foi alterada e esquecida: reset total (botão 10s) restaura a senha de fábrica.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['wifi', 'lento', 'longe', 'comodo'],
    solution: 'Wi-Fi 2.4GHz chega mais longe mas é mais lento. Em cômodo distante, sinal fraco é normal. Soluções: repetidor Wi-Fi, trocar para 5GHz próximo ao roteador, ou cabo.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['wifi', 'lento', 'perto', 'roteador'],
    solution: 'Próximo ao roteador e ainda lento: interferência de canal (muitos vizinhos no mesmo canal 2.4GHz). Trocar para canal 1, 6 ou 11 nas configurações do roteador.',
    equipment: 'TP-Link',
  },
  {
    category: 'tecnico',
    problem_keywords: ['internet', 'laranja', 'ppoe', 'autenticacao'],
    solution: 'INTERNET laranja/vermelho = falha de autenticação PPPoE. Reset da ONU resolve 90% (sessão travada). Se persistir após 2 min: abrir chamado — credenciais podem estar erradas no servidor.',
    equipment: 'ZTE',
  },
  {
    category: 'tecnico',
    problem_keywords: ['internet', 'vermelha', 'sem', 'autenticar'],
    solution: 'INTERNET vermelha após reset = PPPoE não autentica. Aguardar 3 min. Se não resolver, abrir chamado técnico com descrição "falha de autenticação PPPoE persistente".',
  },
  {
    category: 'tecnico',
    problem_keywords: ['queda', 'frequente', 'cai', 'toda', 'hora'],
    solution: 'Quedas frequentes (>1x/dia): não fazer mais resets. Abrir chamado com descrição de frequência e horário. Pode ser instabilidade de sinal PON ou cabo com defeito.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['apagao', 'bairro', 'vizinhos', 'sem'],
    solution: 'Se detectar_apagao_bairro retornar true: informar que equipe já está ciente e trabalhando. Abrir chamado para registrar o cliente no incidente. Prazo: 4h úteis.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['reiniciou', 'reset', 'nao', 'voltou'],
    solution: 'Já reiniciou e não voltou: abrir chamado técnico imediatamente — não insistir em mais resets. Descrever: modelo do equipamento, luzes após reset, se LOS está aceso.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['lento', 'jogos', 'ping', 'lag'],
    solution: 'Ping alto em jogos: conectar via cabo (não Wi-Fi). Wi-Fi introduz jitter. Se cabo e ainda com lag alto: abrir chamado com tipo "lentidão/latência" — pode ser congestionamento de rota.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['lento', 'video', 'chamada', 'zoom', 'meet'],
    solution: 'Videochamadas travando: precisam de upload estável (plano 400M tem 200Mbps de upload — suficiente). Testar velocidade de upload no fast.com. Se < 50Mbps → chamado.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['cabo', 'lan', 'computador', 'nao', 'reconhece'],
    solution: 'Cabo LAN não reconhecido: verificar se cabo está firme nos dois lados. LAN apagada na ONU = cabo ou porta com defeito. Testar outra porta ou outro cabo.',
    equipment: 'Huawei',
  },
  {
    category: 'tecnico',
    problem_keywords: ['reiniciar', 'vsol', 'como'],
    solution: 'VSOL: pressionar botão reset até todas as luzes piscarem (~10s), soltar. Aguardar 3 min para estabilizar.',
    equipment: 'VSOL',
  },
  {
    category: 'tecnico',
    problem_keywords: ['tp-link', 'internet', 'apagada', 'cabo'],
    solution: 'TP-Link com luz INTERNET apagada: cabo WAN solto (entrada azul/amarela). Verificar se cabo está firmemente encaixado. Se ok e ainda apagada: testar outro cabo.',
    equipment: 'TP-Link',
  },
  // ── TÉCNICO: Velocidade ─────────────────────────────────────────────────
  {
    category: 'tecnico',
    problem_keywords: ['velocidade', 'teste', 'fast', 'mbps'],
    solution: 'Resultado fast.com: >= 80% do plano = normal. 40-80% via Wi-Fi = interferência (testar cabo). < 40% via cabo = problema de rede → abrir chamado prioritário.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['velocidade', '400', 'mega', 'baixa'],
    solution: '400 Mega: resultado esperado >= 320 Mbps. Entre 160-320 via Wi-Fi = provável interferência. < 160 via cabo = anomalia na rede → chamado.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['velocidade', '500', 'mega', 'baixa'],
    solution: '500 Mega: resultado esperado >= 400 Mbps. Entre 200-400 via Wi-Fi = possível interferência. < 200 via cabo = anomalia → chamado prioritário.',
  },
  {
    category: 'tecnico',
    problem_keywords: ['velocidade', '700', 'mega', 'baixa'],
    solution: '700 Mega: resultado esperado >= 560 Mbps. Wi-Fi de 2.4GHz físicamente limita ~150 Mbps — recomendado cabo ou 5GHz para aproveitar o plano.',
  },
  // ── COBRANÇA ────────────────────────────────────────────────────────────
  {
    category: 'cobranca',
    problem_keywords: ['pix', 'nao', 'funcionou', 'erro'],
    solution: 'PIX não funcionou: código tem validade (~30 min). Gerar novo código. Se persistir: verificar se o banco do cliente aceita PIX de CNPJ.',
  },
  {
    category: 'cobranca',
    problem_keywords: ['paguei', 'ainda', 'bloqueado', 'cortado'],
    solution: 'Pagamento confirmado mas serviço bloqueado: verificar confirmar_pagamento. Compensação bancária pode levar até 1 dia útil. Registrar negociação e orientar aguardar até próximo dia útil.',
  },
  {
    category: 'cobranca',
    problem_keywords: ['segunda', 'via', 'boleto', 'fatura'],
    solution: 'Segunda via: preferir PIX (gerado na hora). Boleto: solicitar se cliente insistir — informar que tem validade e pode ser pago em qualquer banco/lotérica.',
  },
  {
    category: 'cobranca',
    problem_keywords: ['nao', 'posso', 'pagar', 'agora', 'prazo'],
    solution: 'Cliente sem condições de pagar: registrar_negociacao com as condições (data estimada, parcela). Não prometer suspensão automática nem desconto não autorizado.',
  },
  {
    category: 'cobranca',
    problem_keywords: ['desconto', 'reduzir', 'valor', 'mensalidade'],
    solution: 'Desconto para pagamento antecipado: 10%. Para outros descontos: aplicar_cortesia com motivo claro. Não prometer desconto que não existe no sistema.',
  },
  {
    category: 'cobranca',
    problem_keywords: ['suspensao', 'internet', 'cortada', 'bloqueada'],
    solution: 'Internet suspensa: buscar fatura em aberto com get_fatura_atual, gerar PIX. Após pagamento confirmado: informar que reativação é automática em até 2h úteis.',
  },
  {
    category: 'cobranca',
    problem_keywords: ['cobrado', 'errado', 'valor', 'diferente'],
    solution: 'Cobrança divergente: comparar fatura atual com plano contratado. Se diferença real: aplicar_cortesia com motivo "cobrança incorreta" + registrar negociação.',
  },
  // ── COMERCIAL ───────────────────────────────────────────────────────────
  {
    category: 'comercial',
    problem_keywords: ['upgrade', 'aumentar', 'plano', 'velocidade'],
    solution: 'Upgrade: confirmar plano atual, apresentar opções superiores com get_planos_disponiveis, usar solicitar_upgrade. Informar que equipe confirma ativação em até 24h.',
  },
  {
    category: 'comercial',
    problem_keywords: ['trabalho', 'home', 'office', 'reuniao', 'online'],
    solution: 'Home office: recomendar mínimo 500 Mega. Upload 250 Mbps garante videochamadas HD simultâneas. Mencionar estabilidade da fibra óptica vs cabo coaxial.',
  },
  {
    category: 'comercial',
    problem_keywords: ['streaming', 'netflix', 'youtube', '4k'],
    solution: 'Streaming 4K: Netflix recomenda 25 Mbps por tela. 400 Mega suporta 10+ telas 4K simultâneas. Se cliente tem filhos + smart TVs, 500 Mega é o ponto ideal.',
  },
  {
    category: 'comercial',
    problem_keywords: ['cancelar', 'cancelamento', 'sair', 'desistir'],
    solution: 'Cancelamento: acolher, identificar causa real (preço/técnico/mudança/renda). Oferecer plano menor (400 Mega R$79,99) como alternativa antes de marcar_churn_risk + transferir_humano.',
  },
  {
    category: 'comercial',
    problem_keywords: ['concorrente', 'outro', 'provedor', 'mais', 'barato'],
    solution: 'Concorrência: não falar mal. Destacar: fibra dedicada vs coaxial compartilhado, suporte 24h, SLA local. Se preço é decisivo: verificar se 400 Mega (R$79,99) compete.',
  },
  // ── PROSPECT ────────────────────────────────────────────────────────────
  {
    category: 'prospect',
    problem_keywords: ['contratar', 'instalar', 'novo', 'cliente'],
    solution: 'Novo cliente: coletar nome + bairro (uma vez). Verificar cobertura. Se coberto: apresentar planos, coletar plano escolhido + endereço + período (manhã/tarde). Registrar com registrar_interesse.',
  },
  {
    category: 'prospect',
    problem_keywords: ['bairro', 'cobertura', 'minha', 'area'],
    solution: 'Cobertura: usar verificar_cobertura com nome do bairro. Se coberto: converter para venda. Se não coberto: registrar_interesse para expansão — demonstra demanda para priorizar.',
  },
  {
    category: 'prospect',
    problem_keywords: ['instalacao', 'prazo', 'quando', 'demora'],
    solution: 'Prazo de instalação: até 3 dias úteis após assinar contrato. Taxa única de R$50. Roteador incluso. Confirmar disponibilidade manhã ou tarde com consultar_disponibilidade_visita.',
  },
  {
    category: 'prospect',
    problem_keywords: ['fidelidade', 'multa', 'contrato', 'meses'],
    solution: 'Fidelidade: 12 meses. Multa proporcional se cancelar antes. Após 12 meses: sem multa. Não prometer fidelidade diferente — é política da empresa.',
  },
  {
    category: 'prospect',
    problem_keywords: ['empresa', 'comercial', 'cnpj', 'escritorio'],
    solution: 'Planos residenciais atendem pequenos escritórios. Para demanda corporativa alta (>700 Mbps ou múltiplos links): registrar interesse com notas "uso empresarial" para equipe comercial avaliar.',
  },
];

export async function seedKnowledgeBase(tenantId = env.DEFAULT_TENANT_ID): Promise<void> {
  console.log(`[seed] knowledge_base: inserindo ${SEEDS.length} entradas para tenant=${tenantId}…`);

  let inserted = 0;
  let skipped = 0;

  for (const seed of SEEDS) {
    const { data: existing } = await supabase
      .from('knowledge_base')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('category', seed.category)
      .overlaps('problem_keywords', seed.problem_keywords)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from('knowledge_base').insert({
      tenant_id:        tenantId,
      category:         seed.category,
      problem_keywords: seed.problem_keywords,
      solution:         seed.solution,
      equipment:        seed.equipment ?? null,
      success_count:    1,
    });

    if (error) {
      console.error(`[seed] erro ao inserir "${seed.problem_keywords.join(', ')}":`, error.message);
    } else {
      inserted++;
    }
  }

  console.log(`[seed] knowledge_base: ${inserted} inseridas, ${skipped} já existiam.`);
}
