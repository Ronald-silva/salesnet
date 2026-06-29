import type Anthropic from '@anthropic-ai/sdk';
import * as sgp from '../integrations/sgp';
import { setHumanMode, getThreadCpf, persistThreadCpf } from './memory';
import { lookupCustomer } from './customer-lookup';
import { normalizeCpf, isValidCpfLength } from '../lib/cpf';
import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { BUSINESS_INFO, PLANS } from './company-data';
import { getCoveredNeighborhoods } from './coverage-cache';
import {
  isSlotAvailable,
  nextAvailableSlots,
  periodLabelPt,
  fortalezaToday,
  type VisitPeriod,
} from './visit-scheduling';


export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'buscar_cliente',
    description: 'Busca dados do cliente. Ordem: telefone do WhatsApp primeiro; se não encontrar, CPF informado ou salvo. Passe cpf quando o cliente informar o CPF, ou phone se informar outro telefone do contrato.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone: { type: 'string', description: 'Número de telefone E.164 (ex: +5585999990000) — use quando o cliente informar o telefone' },
        cpf:   { type: 'string', description: 'CPF do cliente com ou sem formatação (ex: 049.763.013-38 ou 04976301338) — use quando o cliente informar o CPF' },
      },
    },
  },
  {
    name: 'get_fatura_atual',
    description: 'Retorna a fatura atual (em aberto ou mais recente) do cliente com valor, vencimento e status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'listar_faturas',
    description: 'Lista as últimas faturas do cliente (pagas e em aberto). Use quando o cliente pedir histórico de pagamentos ou segunda via de meses anteriores.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'gerar_pix',
    description: 'Gera código PIX copia-e-cola para pagamento da fatura em aberto. Use force_new=true quando o cliente relatar que o código anterior não funcionou (expirado, inválido, "chave inexistente") para forçar geração de um código novo no SGP.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id:  { type: 'string', description: 'ID da fatura no SGP' },
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
        force_new:   { type: 'boolean', description: 'true para forçar geração de código novo no SGP, ignorando código armazenado. Use quando cliente relatar que o código anterior não funcionou.' },
      },
      required: ['invoice_id'],
    },
  },
  {
    name: 'confirmar_pagamento',
    description: 'Verifica se o pagamento de uma fatura foi confirmado no sistema. Use quando o cliente disser que já pagou.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
        invoice_id:  { type: 'string', description: 'ID da fatura (opcional, para verificar uma fatura específica)' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'listar_chamados',
    description: 'Lista os últimos chamados de suporte do cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'listar_chamados_sofia',
    description: 'Lista os chamados abertos pelo cliente via Sofia. Use quando o cliente perguntar sobre status de chamado, se tem chamado aberto, ou antes de abrir novo chamado para evitar duplicata.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contrato: { type: 'string', description: 'Número do contrato do cliente' },
        status: { type: 'string', enum: ['aberto', 'em_andamento', 'resolvido', 'todos'], default: 'aberto' },
      },
      required: ['contrato'],
    },
  },
  {
    name: 'abrir_chamado',
    description: 'Abre um chamado de suporte técnico, financeiro ou comercial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contrato:     { type: 'string', description: 'ID do contrato no SGP' },
        tipo:         { type: 'string', enum: ['tecnico', 'financeiro', 'comercial'] },
        descricao:    { type: 'string', description: 'Descrição do problema' },
      },
      required: ['contrato', 'tipo', 'descricao'],
    },
  },
  {
    name: 'consultar_disponibilidade_visita',
    description: 'Consulta a disponibilidade de agenda para visitas técnicas ANTES de confirmar um agendamento. Cada turno tem só 1 vaga (1 de manhã, 1 de tarde por dia útil). Use sempre antes de prometer um horário ao cliente, e ofereça os próximos turnos livres retornados.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Data desejada no formato YYYY-MM-DD (opcional; se omitido, busca a partir de hoje)' },
      },
    },
  },
  {
    name: 'agendar_visita',
    description: 'Agenda visita técnica no endereço do cliente. Cada turno tem só 1 vaga (1 manhã + 1 tarde por dia útil). Se o turno pedido estiver ocupado, a tool recusa e devolve os próximos turnos livres — ofereça-os ao cliente. Sempre confirme data e período antes de chamar.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
        date:        { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        period:      { type: 'string', enum: ['morning', 'afternoon'], description: 'morning = manhã (8h-12h), afternoon = tarde (14h-18h)' },
        type:        { type: 'string', enum: ['instalacao', 'manutencao'], description: 'Tipo de visita (opcional). instalacao para novo cliente, manutencao para cliente existente. Se omitido, é inferido pelo cadastro.' },
        notes:       { type: 'string', description: 'Observações úteis pra equipe de campo (opcional)' },
      },
      required: ['customer_id', 'date', 'period'],
    },
  },
  {
    name: 'status_conexao',
    description: 'Verifica se a conexão do cliente está online e a qualidade do sinal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'solicitar_teste_velocidade',
    description: 'Envia ao cliente o link para teste de velocidade e instrução de como fazer. Use quando o cliente reclamar de internet lenta e antes de abrir chamado. Após enviar, aguarde o cliente informar o resultado e use interpretar_resultado_velocidade.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP (para buscar plano contratado)' },
        plan_mbps:   { type: 'number', description: 'Velocidade do plano contratado em Mbps (ex: 400, 500, 700)' },
      },
    },
  },
  {
    name: 'interpretar_resultado_velocidade',
    description: 'Interpreta o resultado do teste de velocidade informado pelo cliente e decide a ação: problema local (posicionamento/Wi-Fi) ou problema de rede (abrir chamado prioritário). Use após o cliente informar o resultado do fast.com.',
    input_schema: {
      type: 'object' as const,
      properties: {
        download_mbps: { type: 'number', description: 'Velocidade de download medida pelo cliente em Mbps' },
        upload_mbps:   { type: 'number', description: 'Velocidade de upload medida pelo cliente em Mbps (opcional)' },
        plan_mbps:     { type: 'number', description: 'Velocidade do plano contratado em Mbps' },
        via_wifi:      { type: 'boolean', description: 'O teste foi feito via Wi-Fi (true) ou cabo (false). Padrão: true.' },
      },
      required: ['download_mbps', 'plan_mbps'],
    },
  },
  {
    name: 'solicitar_upgrade',
    description: 'Registra solicitação de upgrade de plano para análise e ativação.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
        new_plan:    { type: 'string', description: 'Plano desejado (ex: 400 Mega, 500 Mega, 700 Mega)' },
      },
      required: ['customer_id', 'new_plan'],
    },
  },
  {
    name: 'aplicar_cortesia',
    description: 'Solicita aplicação de desconto ou cortesia na fatura do cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
        reason:      { type: 'string', description: 'Motivo da cortesia' },
      },
      required: ['customer_id', 'reason'],
    },
  },
  {
    name: 'transferir_humano',
    description: 'ÚLTIMO RECURSO. Pausa o bot e transfere para um agente humano. Use SOMENTE em 3 casos: (1) o cliente pedir explicitamente para falar com uma pessoa/atendente; (2) cancelamento/rescisão de contrato; (3) ameaça legal (Procon, Anatel ou via judicial). Para qualquer outra coisa, resolva você mesma ou registre a ação com abrir_chamado, agendar_visita, registrar_interesse ou solicitar_upgrade — isso é resolver, não transferir.',
    input_schema: {
      type: 'object' as const,
      properties: {
        reason: { type: 'string', description: 'Motivo da transferência' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'get_planos_disponiveis',
    description: 'Retorna os planos de internet da SalesNet com velocidades e preços. Use SEMPRE que o cliente perguntar sobre planos, preços ou velocidades. NUNCA use verificar_cobertura para responder sobre planos.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'verificar_cobertura',
    description: 'Verifica cobertura de fibra óptica da SalesNet. Passe neighborhood="*" para listar TODOS os bairros cobertos. Sempre chame esta tool antes de responder qualquer pergunta sobre cobertura ou bairros atendidos. NÃO use esta tool para responder sobre planos ou preços.',
    input_schema: {
      type: 'object' as const,
      properties: {
        neighborhood: { type: 'string', description: 'Nome do bairro a verificar, ou "*" para listar todos os bairros com cobertura' },
      },
      required: ['neighborhood'],
    },
  },
  {
    name: 'registrar_interesse',
    description: 'Registra interesse de um novo cliente (prospect) que quer contratar o serviço. Use quando o prospect confirmar interesse em algum plano.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone:        { type: 'string', description: 'Número de telefone do prospect' },
        name:         { type: 'string', description: 'Nome do prospect' },
        neighborhood: { type: 'string', description: 'Bairro onde mora' },
        desired_plan: { type: 'string', description: 'Plano de interesse (ex: 100Mbps, Turbo, Ultra)' },
        notes:        { type: 'string', description: 'Observações adicionais do prospect' },
      },
      required: ['phone', 'name', 'neighborhood'],
    },
  },
  {
    name: 'marcar_churn_risk',
    description: 'Registra o cliente como risco de cancelamento para acompanhamento pelo time. Use quando o cliente mencionar cancelamento.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
        reason:      { type: 'string', description: 'Motivo do risco de cancelamento' },
      },
      required: ['customer_id', 'reason'],
    },
  },
  {
    name: 'detectar_apagao_bairro',
    description: 'Verifica se há múltiplos clientes reportando problema técnico no mesmo bairro nas últimas 2 horas. Use quando o sinal do cliente estiver ruim no sistema.',
    input_schema: {
      type: 'object' as const,
      properties: {
        bairro: { type: 'string', description: 'Nome do bairro do cliente' },
      },
      required: ['bairro'],
    },
  },
  {
    name: 'registrar_negociacao',
    description: 'Registra um acordo de parcelamento ou negociação de fatura no sistema.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
        condicoes:   { type: 'string', description: 'Descrição das condições acordadas (ex: entrada 50% hoje, restante em 15 dias)' },
      },
      required: ['customer_id', 'condicoes'],
    },
  },
  {
    name: 'salvar_cpf_cliente',
    description: 'Registra o CPF informado pelo cliente, associando-o ao telefone atual. Use sempre que o cliente disser o CPF durante a conversa. Isso permite localizar o contrato dele em contatos futuros, mesmo que o SGP não encontre pelo telefone.',
    input_schema: {
      type: 'object' as const,
      properties: {
        cpf: { type: 'string', description: 'CPF do cliente, com ou sem formatação (ex: 049.763.013-38 ou 04976301338)' },
      },
      required: ['cpf'],
    },
  },
  {
    name: 'atualizar_notas_cliente',
    description: 'Salva uma nota sobre o cliente para consulta em atendimentos futuros. Use ao encerrar sessões com informações relevantes: pedido de upgrade pendente, intenção de cancelamento, problema técnico recorrente, informação pessoal útil (vai se mudar, turno de trabalho, dificuldade específica). Máximo 500 caracteres.',
    input_schema: {
      type: 'object' as const,
      properties: {
        notes: { type: 'string', description: 'Nota concisa sobre o cliente. Máx 500 chars.' },
      },
      required: ['notes'],
    },
  },
  {
    name: 'registrar_solucao_eficaz',
    description: 'Registra uma solução que funcionou para reutilização futura. Use APENAS quando o cliente confirmar que o problema foi resolvido.',
    input_schema: {
      type: 'object' as const,
      properties: {
        category:         { type: 'string', enum: ['tecnico', 'cobranca', 'comercial', 'prospect'], description: 'Categoria do problema resolvido' },
        problem_keywords: { type: 'array', items: { type: 'string' }, description: '3 a 5 palavras-chave do problema (ex: ["internet", "lenta", "wifi"])' },
        solution:         { type: 'string', description: 'O que resolveu o problema. Máx 300 caracteres.' },
        equipment:        { type: 'string', description: 'Modelo do equipamento, quando for problema técnico (ex: HG8145V5)' },
      },
      required: ['category', 'problem_keywords', 'solution'],
    },
  },
];

function normalizeKeyword(raw: unknown): string {
  return String(raw)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeKeywords(raw: unknown[]): string[] {
  const out: string[] = [];
  for (const item of raw) {
    const k = normalizeKeyword(item);
    if (k && !out.includes(k)) out.push(k);
  }
  return out.slice(0, 5);
}

export async function markChurnRiskByPhone(phone: string, tenantId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_threads')
    .upsert(
      { phone, tenant_id: tenantId, churn_risk: true },
      { onConflict: 'tenant_id,phone' },
    );
  if (error) throw new Error(`Supabase upsert failed [marcar_churn_risk]: ${error.message}`);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  phone: string,
  tenantId: string = env.DEFAULT_TENANT_ID,
): Promise<unknown> {

  switch (name) {
    case 'buscar_cliente': {
      const alternatePhone = input.phone as string | undefined;
      if (alternatePhone && alternatePhone !== phone) {
        try {
          const customer = await sgp.getCustomerByPhone(alternatePhone);
          if (customer.document) {
            await persistThreadCpf(phone, tenantId, customer.document);
          }
          return customer;
        } catch {
          return { error: 'Cliente não encontrado' };
        }
      }

      const cpfInput = input.cpf ? normalizeCpf(String(input.cpf)) : null;
      const cpfFromThread = await getThreadCpf(phone, tenantId);
      const result = await lookupCustomer({
        whatsappPhone: phone,
        tenantId,
        cpfFromMessage: cpfInput && cpfInput.length === 11 ? cpfInput : null,
        cpfFromThread,
      });
      return result.customer;
    }

    case 'get_fatura_atual':
      return sgp.getCurrentInvoice(input.customer_id as string);

    case 'listar_faturas':
      return sgp.getCustomerInvoices(input.customer_id as string);

    case 'gerar_pix':
      return sgp.generatePixKey(
        input.invoice_id as string,
        input.customer_id as string | undefined,
        input.force_new === true,
      );

    case 'confirmar_pagamento': {
      try {
        const invoices = await sgp.getCustomerInvoices(input.customer_id as string);
        // If specific invoice_id given, find it; otherwise check if any open invoice exists
        if (input.invoice_id) {
          const target = invoices.find((inv) => inv.id === String(input.invoice_id));
          if (target) return { paid: target.status === 'paid', status: target.status };
        }
        // No specific invoice: check if the most recent non-cancelled is paid
        const latest = invoices.find((inv) => inv.status !== 'cancelled');
        if (!latest) return { paid: true, message: 'Nenhuma fatura em aberto encontrada.' };
        return { paid: latest.status === 'paid', status: latest.status };
      } catch {
        return { error: 'Não foi possível verificar o pagamento agora.' };
      }
    }

    case 'listar_chamados':
      return sgp.getCustomerTickets(input.customer_id as string);

    case 'listar_chamados_sofia': {
      const requestedStatus = (input.status as string | undefined) ?? 'aberto';
      const statusFilter = requestedStatus === 'todos'
        ? ['aberto', 'em_andamento', 'resolvido']
        : [requestedStatus];

      const { data, error } = await supabase
        .from('sofia_tickets')
        .select('id, tipo, descricao, status, created_at, sgp_chamado_id')
        .eq('contrato', input.contrato as string)
        .eq('tenant_id', tenantId)
        .in('status', statusFilter)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw new Error('Erro ao buscar chamados: ' + error.message);

      return {
        total: data.length,
        chamados: data.map((t) => ({
          id: t.sgp_chamado_id ?? t.id,
          tipo: t.tipo,
          descricao: t.descricao,
          status: t.status,
          aberto_em: t.created_at,
        })),
      };
    }

    case 'abrir_chamado': {
      const contrato = String(input.contrato ?? input.customer_id);
      const tipo = String(input.tipo ?? input.type ?? 'tecnico');
      const descricao = String(input.descricao ?? input.description ?? '');

      // Dedup: if a ticket with same contrato+tipo is already open within 4h, return it
      try {
        const dedupSince = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        const { data: dup } = await supabase
          .from('sofia_tickets')
          .select('id, tipo, status, created_at, sgp_chamado_id')
          .eq('contrato', contrato)
          .eq('tenant_id', tenantId)
          .eq('tipo', tipo)
          .in('status', ['aberto', 'em_andamento'])
          .gte('created_at', dedupSince)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dup) {
          const protocol = dup.sgp_chamado_id ?? dup.id;
          const openedAt = new Date(dup.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza',
          });
          return {
            success: true,
            duplicate: true,
            protocol,
            message: `Chamado semelhante já aberto às ${openedAt} (protocolo ${protocol}). Nenhum novo chamado criado.`,
          };
        }
      } catch {
        // best-effort — prossegue com abertura normal em caso de erro
      }

      const ticket = await sgp.openTicket(
        contrato,
        tipo,
        descricao,
      );
      let sofiaTicketId: string | null = null;
      try {
        const { data, error } = await supabase
          .from('sofia_tickets')
          .insert({
            tenant_id: tenantId,
            phone,
            contrato,
            sgp_chamado_id: (ticket as { id?: string } | null)?.id ?? null,
            tipo,
            descricao,
            status: 'aberto',
          })
          .select('id')
          .single();
        sofiaTicketId = data?.id ?? null;
        if (error) {
          console.error(`[tools] Supabase insert failed [abrir_chamado → sofia_tickets]: ${error.message}`);
        }
      } catch (err) {
        console.error('[tools] Unexpected error [abrir_chamado → sofia_tickets]:', err);
      }

      if (tipo === 'tecnico') {
        try {
          const customer = await sgp.getCustomerById(contrato);
          const neighborhood = customer.address?.neighborhood ?? '';
          if (neighborhood) {
            const { error } = await supabase.from('outage_reports').insert({
              neighborhood,
              customer_id: contrato,
            });
            if (error) throw new Error(`Supabase insert failed [abrir_chamado]: ${error.message}`);
          }
        } catch {
          // best-effort — não bloqueia o chamado
        }
      }
      const sgpResult = ticket as {
        id?: string;
        ticket_id?: string;
        os_id?: string | number;
        ocorrencia_id?: string | number;
        protocolo?: string;
      } | null;
      const protocolNumber =
        sgpResult?.protocolo ??
        sgpResult?.id ??
        sgpResult?.ticket_id ??
        (sgpResult?.os_id != null ? String(sgpResult.os_id) : undefined) ??
        (sgpResult?.ocorrencia_id != null ? String(sgpResult.ocorrencia_id) : undefined) ??
        sofiaTicketId ??
        `local-${Date.now()}`;

      return {
        success: true,
        protocol: protocolNumber,
        message: `Chamado aberto. Protocolo: ${protocolNumber}`,
        ticket: sgpResult,
      };
    }

    case 'consultar_disponibilidade_visita': {
      const fromDate = (input.date as string | undefined)?.trim() || fortalezaToday();
      const slots = await nextAvailableSlots(fromDate, 3);
      const requested =
        (input.date as string | undefined)?.trim()
          ? {
              morning: await isSlotAvailable(fromDate, 'morning'),
              afternoon: await isSlotAvailable(fromDate, 'afternoon'),
            }
          : null;
      return {
        capacity_per_period: 1,
        requested_date: input.date ?? null,
        requested_date_availability: requested,
        next_available: slots.map((s) => ({ date: s.date, period: s.period, label: s.label })),
        message:
          slots.length > 0
            ? `Próximos turnos livres: ${slots.map((s) => s.label).join('; ')}.`
            : 'Sem turnos livres nas próximas semanas.',
      };
    }

    case 'agendar_visita': {
      const customerId = input.customer_id as string;
      const date = input.date as string;
      const period = input.period as VisitPeriod;

      await sgp.scheduleVisit(customerId, date, period);

      // executeTool não recebe o session mode; inferimos o tipo pela existência
      // do cadastro: cliente existente = manutenção, sem cadastro = instalação
      // (fluxo prospect). `input.type` permite override explícito.
      let customerData: Awaited<ReturnType<typeof sgp.getCustomerById>> | null = null;
      try {
        customerData = await sgp.getCustomerById(customerId);
      } catch {
        customerData = null;
      }

      const requestedType = String(input.type ?? '');
      const visitType: 'instalacao' | 'manutencao' =
        requestedType === 'instalacao' || requestedType === 'manutencao'
          ? requestedType
          : customerData
          ? 'manutencao'
          : 'instalacao';

      const address = customerData?.address
        ? `${customerData.address.street ?? ''}, ${customerData.address.number ?? ''}`
        : null;

      // `phone` (WhatsApp do contato) é o canal confiável de retorno — getCustomerById
      // não traz telefone. Só usa customerData.phone se vier preenchido.
      const contactPhone =
        customerData?.phone && customerData.phone.length > 0 ? customerData.phone : phone;

      // Capacidade: 1 vaga por turno. check + insert atômico via RPC para evitar
      // TOCTOU double-booking entre requisições concorrentes.
      interface BookingResult { success: boolean; reason?: string; visit_id?: string }
      const { data: result, error: rpcError } = await supabase
        .rpc('book_visit_slot', {
          p_date: date,
          p_period: period,
          p_tenant_id: tenantId,
          p_contrato: customerId,
          p_phone: contactPhone,
          p_type: visitType,
          p_address: address ?? null,
          p_notes: (input.notes as string | undefined) ?? null,
        });

      if (rpcError) throw rpcError;

      const booking = result as BookingResult;

      if (!booking.success) {
        const alternativas = await nextAvailableSlots(date, 3);
        return {
          success: false,
          reason: booking.reason,
          requested: { visit_date: date, period: periodLabelPt(period) },
          alternativas: alternativas.map((s) => ({ date: s.date, period: s.period, label: s.label })),
          message:
            alternativas.length > 0
              ? `O período da ${periodLabelPt(period)} em ${date} já está ocupado (1 visita por turno). Próximos livres: ${alternativas.map((s) => s.label).join('; ')}. Ofereça uma dessas opções ao cliente.`
              : `O período da ${periodLabelPt(period)} em ${date} já está ocupado e não há turnos livres nas próximas semanas. Avise o cliente que a equipe retornará com uma data.`,
        };
      }

      const periodLabel = periodLabelPt(period);
      return {
        success: true,
        visit_date: date,
        period: periodLabel,
        type: visitType,
        message: `Visita agendada para ${date} no período da ${periodLabel}. Nossa equipe entrará em contato antes de chegar.`,
      };
    }

    case 'status_conexao':
      return sgp.getConnectionStatus(input.customer_id as string);

    case 'solicitar_teste_velocidade': {
      let planMbps = (input.plan_mbps as number | undefined) ?? 0;

      // Resolve plan speed from SGP when the LLM omits plan_mbps
      if (planMbps <= 0 && input.customer_id) {
        try {
          const customer = await sgp.getCustomerById(String(input.customer_id));
          planMbps = customer.plan?.downloadMbps ?? 0;
        } catch {
          // best-effort — continue with unknown speed
        }
      }

      const minExpected = planMbps > 0 ? Math.round(planMbps * 0.8) : 0;
      const planLabel = planMbps > 0 ? `${planMbps} Mbps` : 'fibra óptica';
      const expectedLabel = minExpected > 0 ? `${minExpected} Mbps` : '80% do contratado';

      const instruction =
        `Vou te ajudar a verificar a velocidade. Acesse fast.com pelo celular ou computador conectado à sua rede e aguarde o resultado.\n\n` +
        `Seu plano é de ${planLabel}. O resultado esperado é acima de ${expectedLabel}.\n\n` +
        `Quando o número aparecer na tela, me informe: o valor de download e se você estava conectado via Wi-Fi ou pelo cabo direto no roteador.`;

      return {
        status: 'sent',
        instruction,
        plan_mbps: planMbps,
        min_expected_mbps: minExpected,
      };
    }

    case 'interpretar_resultado_velocidade': {
      const download = input.download_mbps as number;
      const plan = input.plan_mbps as number;
      const viaWifi = (input.via_wifi as boolean | undefined) ?? true;

      if (plan <= 0) {
        return { diagnosis: 'invalid_input', message: 'Não foi possível interpretar o resultado: velocidade do plano não informada.' };
      }

      if (download <= 0) {
        return {
          diagnosis: 'test_failed',
          message: 'Parece que o teste não completou (resultado zero). Tente acessar fast.com novamente — aguarde a barra verde chegar ao fim e me informe o número que aparecer.',
        };
      }

      const ratio = download / plan;

      if (ratio >= 0.8) {
        return {
          diagnosis: 'ok',
          message: `Velocidade normal! ${download} Mbps de ${plan} Mbps contratados (${Math.round(ratio * 100)}%). Se sentir lentidão em algum site específico, pode ser problema naquele servidor.`,
        };
      }

      // Below threshold via Wi-Fi: guide to cable test before opening ticket
      if (viaWifi) {
        // Severe Wi-Fi drop (< 40%): likely more than just interference, but try cable first
        const severity = ratio < 0.4 ? 'severo' : 'moderado';
        return {
          diagnosis: 'wifi_interference',
          severity,
          action: 'request_cable_test',
          message: `A velocidade via Wi-Fi (${download} Mbps) está abaixo do esperado para o plano de ${plan} Mbps (${Math.round(ratio * 100)}%). Antes de abrir chamado, vamos descartar interferência de Wi-Fi: conecte um cabo de rede direto no roteador${severity === 'severo' ? ' — a queda é grande, pode ser problema de rede ou do roteador' : ''} e repita o teste no fast.com. Me informe o resultado no cabo.`,
          next_step: 'Aguarde o cliente informar o resultado no cabo. Se melhorar: problema local (posicionamento/canal Wi-Fi). Se continuar baixo: chame interpretar_resultado_velocidade com via_wifi=false.',
        };
      }

      // Below threshold via cable: definitively a network issue
      return {
        diagnosis: 'network_issue',
        action: 'open_ticket',
        severity: ratio < 0.3 ? 'prioritario' : 'normal',
        message: `Velocidade muito abaixo do contratado mesmo no cabo (${download} de ${plan} Mbps — ${Math.round(ratio * 100)}%). Isso indica problema na rede. Vou abrir um chamado ${ratio < 0.3 ? 'prioritário' : ''} para a equipe técnica verificar.`,
        next_step: 'Chame abrir_chamado com tipo=tecnico e inclua a velocidade medida no cabo na descrição.',
      };
    }

    case 'solicitar_upgrade': {
      const customerId = String(input.customer_id ?? '');
      const newPlan = String(input.new_plan ?? '');
      const description = `Upgrade solicitado pelo cliente via Sofia. Plano desejado: ${newPlan}.`;

      try {
        await supabase.from('sofia_tickets').insert({
          tenant_id: tenantId,
          phone,
          contrato:  customerId,
          tipo:      'comercial',
          descricao: description,
          status:    'aberto',
        });
      } catch (err) {
        console.warn('[tools] solicitar_upgrade: failed to persist sofia_ticket:', err);
      }

      try {
        const adminPhone = env.ADMIN_ALERT_PHONE;
        if (adminPhone) {
          const { whatsappService } = await import('../services/whatsapp-service');
          await whatsappService.sendText(
            tenantId,
            adminPhone,
            `[Upgrade] Contrato ${customerId} solicitou upgrade para ${newPlan}.`,
          );
        }
      } catch {
        // best-effort
      }

      return {
        status: 'queued',
        new_plan: newPlan,
        message: `Solicitação de upgrade para ${newPlan} registrada. Nossa equipe confirmará a ativação em até 24h.`,
      };
    }

    case 'aplicar_cortesia': {
      const customerId = String(input.customer_id ?? '');
      const reason = String(input.reason ?? '');
      const description = `Cortesia solicitada via Sofia. Motivo: ${reason}`;

      try {
        await supabase.from('sofia_tickets').insert({
          tenant_id: tenantId,
          phone,
          contrato:  customerId,
          tipo:      'financeiro',
          descricao: description,
          status:    'aberto',
        });
      } catch (err) {
        console.warn('[tools] aplicar_cortesia: failed to persist sofia_ticket:', err);
      }

      try {
        const adminPhone = env.ADMIN_ALERT_PHONE;
        if (adminPhone) {
          const { whatsappService } = await import('../services/whatsapp-service');
          await whatsappService.sendText(
            tenantId,
            adminPhone,
            `[Cortesia] Contrato ${customerId} precisa de cortesia. Motivo: ${reason}`,
          );
        }
      } catch {
        // best-effort
      }

      return {
        status: 'queued',
        reason,
        message: 'Solicitação de cortesia registrada. Nossa equipe analisará e confirmará em breve.',
      };
    }

    case 'transferir_humano': {
      await setHumanMode(phone, true, tenantId);
      return {
        status: 'transferred',
        message: 'Atendimento transferido para um agente humano. Aguarde, por favor.',
      };
    }

    case 'verificar_cobertura': {
      const raw = (input.neighborhood as string).trim();
      const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

      const list = await getCoveredNeighborhoods(tenantId);
      // name → coverage % map built from the dynamic list
      const coverageMap: Record<string, number> = Object.fromEntries(
        list.map((n) => [normalize(n), 90]),
      );

      // List all covered neighborhoods
      if (raw === '*' || /todos|lista|quais/i.test(raw)) {
        return {
          covered_neighborhoods: Object.entries(coverageMap).map(([name, pct]) => ({
            name: name
              .split(' ')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' '),
            coverage_percent: pct,
          })),
        };
      }

      const key = normalize(raw);
      const exact = Object.entries(coverageMap).find(([k]) => normalize(k) === key);
      if (exact) {
        return { covered: true, neighborhood: input.neighborhood, coverage_percent: exact[1] };
      }
      const partial = Object.entries(coverageMap).find(([k]) => {
        const nk = normalize(k);
        return nk.includes(key) || key.includes(nk);
      });
      if (partial) {
        return { covered: true, neighborhood: input.neighborhood, coverage_percent: partial[1] };
      }
      return { covered: false, neighborhood: input.neighborhood };
    }

    case 'registrar_interesse': {
      const { error } = await supabase.from('leads').insert({
        phone:        input.phone as string,
        name:         input.name as string,
        neighborhood: input.neighborhood as string,
        desired_plan: (input.desired_plan as string | undefined) ?? null,
        notes:        (input.notes as string | undefined) ?? null,
        status:       'new',
      });
      if (error) throw new Error(`Supabase insert failed [registrar_interesse]: ${error.message}`);
      return {
        status: 'registered',
        message: 'Interesse registrado com sucesso. Nossa equipe entrará em contato em até 24h.',
      };
    }

    case 'marcar_churn_risk': {
      await markChurnRiskByPhone(phone, tenantId);
      return { status: 'marked', customer_id: input.customer_id, reason: input.reason };
    }

    case 'detectar_apagao_bairro': {
      const bairro = input.bairro as string;
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('outage_reports')
        .select('id')
        .eq('neighborhood', bairro)
        .gte('reported_at', cutoff);
      const count = (data ?? []).length;
      return { outage: count >= 2, count, bairro };
    }

    case 'get_planos_disponiveis':
      return {
        plans: PLANS.map((p) => ({
          nome: p.name,
          velocidadeDown: p.downloadMbps,
          velocidadeUp: p.uploadMbps,
          preco: p.priceMonthly,
          popular: p.popular ?? false,
        })),
        taxaInstalacao: BUSINESS_INFO.installationFee,
        pacoteCanaisFilmesOpcional: BUSINESS_INFO.tvAddonMonthly,
      };

    case 'registrar_negociacao': {
      const { error } = await supabase.from('billing_notifications').insert({
        customer_id: input.customer_id as string,
        phone,
        type: 'negociacao',
        status: 'registered',
        notes: input.condicoes as string,
      });
      if (error) throw new Error(`Supabase insert failed [registrar_negociacao]: ${error.message}`);
      return {
        status: 'registered',
        message: `Negociação registrada: ${String(input.condicoes)}. Um atendente confirmará em breve.`,
      };
    }

    case 'salvar_cpf_cliente': {
      const cleanCpf = normalizeCpf(String(input.cpf ?? ''));
      if (!isValidCpfLength(cleanCpf)) {
        return { success: false, error: 'CPF inválido. Deve ter 11 dígitos.' };
      }
      await persistThreadCpf(phone, tenantId, cleanCpf);
      try {
        const customer = await sgp.getCustomerByCpf(cleanCpf, phone);
        return {
          success: true,
          customer_found: true,
          customer: { id: customer.id, name: customer.name },
        };
      } catch {
        return { success: true, customer_found: false };
      }
    }

    case 'atualizar_notas_cliente': {
      const today = new Date().toLocaleDateString('sv', { timeZone: 'America/Fortaleza' }); // YYYY-MM-DD
      const notes = `[${today}] ${(input.notes as string).trim()}`.slice(0, 500);
      const { error } = await supabase
        .from('conversation_threads')
        .update({ notes })
        .eq('phone', phone)
        .eq('tenant_id', tenantId);
      if (error) throw new Error('Erro ao salvar nota: ' + error.message);
      return { success: true, saved_length: notes.length };
    }

    case 'registrar_solucao_eficaz': {
      const category = String(input.category ?? '');
      if (!['tecnico', 'cobranca', 'comercial', 'prospect'].includes(category)) {
        return { success: false, error: 'Categoria inválida.' };
      }
      const rawKeywords = Array.isArray(input.problem_keywords) ? input.problem_keywords : [];
      const keywords = normalizeKeywords(rawKeywords);
      if (keywords.length === 0) {
        return { success: false, error: 'Informe ao menos uma palavra-chave do problema.' };
      }
      const solution = String(input.solution ?? '').slice(0, 300);
      if (!solution.trim()) {
        return { success: false, error: 'Informe a solução que funcionou.' };
      }
      const equipment = input.equipment ? String(input.equipment) : null;

      // Procura entrada similar: mesmo tenant/categoria com sobreposição de
      // keywords. "Similar" = pelo menos 2 keywords em comum (ou a única, quando
      // só houver 1), para não duplicar a mesma solução a cada repetição.
      const { data: candidates } = await supabase
        .from('knowledge_base')
        .select('id, problem_keywords, success_count')
        .eq('tenant_id', tenantId)
        .eq('category', category)
        .overlaps('problem_keywords', keywords);

      const match = (candidates ?? []).find((row) => {
        const existing = new Set((row.problem_keywords as string[] | null) ?? []);
        const shared = keywords.filter((k) => existing.has(k)).length;
        return shared >= Math.min(2, keywords.length);
      });

      if (match) {
        const { error } = await supabase
          .from('knowledge_base')
          .update({
            success_count: ((match.success_count as number | null) ?? 1) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', match.id);
        if (error) throw new Error('Erro ao atualizar conhecimento: ' + error.message);
        return { success: true, action: 'updated', id: match.id };
      }

      const { data: inserted, error } = await supabase
        .from('knowledge_base')
        .insert({
          tenant_id:        tenantId,
          category,
          problem_keywords: keywords,
          solution,
          equipment,
        })
        .select('id')
        .single();
      if (error) throw new Error('Erro ao registrar conhecimento: ' + error.message);
      return { success: true, action: 'created', id: inserted.id };
    }

    default:
      return { error: `Tool desconhecida: ${name}` };
  }
}
