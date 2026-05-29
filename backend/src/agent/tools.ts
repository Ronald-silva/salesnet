import type Anthropic from '@anthropic-ai/sdk';
import * as sgp from '../integrations/sgp';
import { setHumanMode } from './memory';
import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { BUSINESS_INFO, COVERED_NEIGHBORHOODS as COVERED_LIST, PLANS } from './company-data';

// Derived lookup map for the verificar_cobertura tool (name → coverage %)
const COVERED_NEIGHBORHOODS: Record<string, number> = Object.fromEntries(
  COVERED_LIST.map((name) => [name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), 90]),
);

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'buscar_cliente',
    description: 'Busca dados do cliente pelo telefone OU pelo CPF. Chame esta tool primeiro para ter contexto. Se o cliente informar um CPF (11 dígitos), passe no campo cpf. Se informar telefone, passe no campo phone.',
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
    description: 'Gera chave PIX copia-e-cola para pagamento da fatura em aberto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id:  { type: 'string', description: 'ID da fatura no SGP' },
        customer_id: { type: 'string', description: 'ID do contrato no SGP (melhora a geração do PIX)' },
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
    name: 'agendar_visita',
    description: 'Agenda visita técnica no endereço do cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do contrato no SGP' },
        date:        { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        period:      { type: 'string', enum: ['morning', 'afternoon'], description: 'morning = manhã (8h-12h), afternoon = tarde (13h-18h)' },
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
    description: 'Pausa o bot e transfere o atendimento para um agente humano.',
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
];

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
      try {
        if (input.cpf) {
          return await sgp.getCustomerByCpf(input.cpf as string);
        }
        return await sgp.getCustomerByPhone(input.phone as string);
      } catch {
        return { error: 'Cliente não encontrado' };
      }
    }

    case 'get_fatura_atual':
      return sgp.getCurrentInvoice(input.customer_id as string);

    case 'listar_faturas':
      return sgp.getCustomerInvoices(input.customer_id as string);

    case 'gerar_pix':
      return sgp.generatePixKey(input.invoice_id as string, input.customer_id as string | undefined);

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

    case 'agendar_visita': {
      const customerId = input.customer_id as string;
      const date = input.date as string;
      const period = input.period as 'morning' | 'afternoon';

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

      try {
        await supabase.from('scheduled_visits').insert({
          customer_id: customerId,
          phone: customerData?.phone ?? phone,
          visit_date: date,
          period,
          status: 'scheduled',
          type: visitType,
          address,
          notes: (input.notes as string | undefined) ?? null,
        });
      } catch {
        // best-effort
      }

      const periodLabel = period === 'morning' ? 'manhã (8h-12h)' : 'tarde (14h-18h)';
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

    case 'solicitar_upgrade':
      return {
        status: 'queued',
        new_plan: input.new_plan,
        message: `Solicitação de upgrade para ${String(input.new_plan)} registrada. Um atendente confirmará em até 24h.`,
      };

    case 'aplicar_cortesia':
      return {
        status: 'queued',
        reason: input.reason,
        message: 'Solicitação de cortesia registrada para análise. Você receberá confirmação em breve.',
      };

    case 'transferir_humano': {
      await setHumanMode(phone, true, tenantId);
      return {
        status: 'transferred',
        message: 'Atendimento transferido para um agente humano. Aguarde, por favor.',
      };
    }

    case 'verificar_cobertura': {
      const raw = (input.neighborhood as string).trim();

      // List all covered neighborhoods
      if (raw === '*' || /todos|lista|quais/i.test(raw)) {
        return {
          covered_neighborhoods: Object.entries(COVERED_NEIGHBORHOODS).map(([name, pct]) => ({
            name: name
              .split(' ')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' '),
            coverage_percent: pct,
          })),
        };
      }

      const normalize = (s: string) =>
        s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

      const key = normalize(raw);
      const exact = Object.entries(COVERED_NEIGHBORHOODS).find(
        ([k]) => normalize(k) === key,
      );
      if (exact) {
        return { covered: true, neighborhood: input.neighborhood, coverage_percent: exact[1] };
      }
      const partial = Object.entries(COVERED_NEIGHBORHOODS).find(([k]) => {
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

    case 'atualizar_notas_cliente': {
      const notes = (input.notes as string).slice(0, 500);
      const { error } = await supabase
        .from('conversation_threads')
        .update({ notes })
        .eq('phone', phone)
        .eq('tenant_id', tenantId);
      if (error) throw new Error('Erro ao salvar nota: ' + error.message);
      return { success: true, saved_length: notes.length };
    }

    default:
      return { error: `Tool desconhecida: ${name}` };
  }
}
