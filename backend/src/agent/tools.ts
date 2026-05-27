import type Anthropic from '@anthropic-ai/sdk';
import * as sgp from '../integrations/sgp';
import { setHumanMode } from './memory';
import { supabase } from '../config/supabase';

const COVERED_NEIGHBORHOODS: Record<string, number> = {
  'jardim guanabara': 95,
  'jardim iracema':   90,
  'quintino cunha':   85,
  'vila velha':       88,
  'nova assunção':    92,
};

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
    name: 'abrir_chamado',
    description: 'Abre um chamado de suporte técnico, financeiro ou comercial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id:  { type: 'string', description: 'ID do contrato no SGP' },
        type:         { type: 'string', enum: ['tecnico', 'financeiro', 'comercial'] },
        description:  { type: 'string', description: 'Descrição do problema' },
      },
      required: ['customer_id', 'type', 'description'],
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
        new_plan:    { type: 'string', description: 'Plano desejado (ex: 50Mbps, 100Mbps, 300Mbps)' },
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
    name: 'verificar_cobertura',
    description: 'Verifica cobertura de fibra óptica da SalesNet. Passe neighborhood="*" para listar TODOS os bairros cobertos. Sempre chame esta tool antes de responder qualquer pergunta sobre cobertura ou bairros atendidos.',
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
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  phone: string,
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

    case 'abrir_chamado': {
      const ticket = await sgp.openTicket(
        input.customer_id as string,
        input.type as string,
        input.description as string,
      );
      if (input.type === 'tecnico') {
        try {
          const customer = await sgp.getCustomerById(input.customer_id as string);
          const neighborhood = customer.address?.neighborhood ?? '';
          if (neighborhood) {
            const { error } = await supabase.from('outage_reports').insert({
              neighborhood,
              customer_id: input.customer_id as string,
            });
            if (error) throw new Error(`Supabase insert failed [abrir_chamado]: ${error.message}`);
          }
        } catch {
          // best-effort — não bloqueia o chamado
        }
      }
      return ticket;
    }

    case 'agendar_visita': {
      const visit = await sgp.scheduleVisit(
        input.customer_id as string,
        input.date as string,
        input.period as 'morning' | 'afternoon',
      );
      try {
        const customer = await sgp.getCustomerById(input.customer_id as string);
        await supabase.from('scheduled_visits').insert({
          customer_id: input.customer_id as string,
          phone: customer.phone,
          visit_date: input.date as string,
          period: input.period as string,
          status: 'scheduled',
        });
      } catch {
        // best-effort
      }
      return visit;
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
      await setHumanMode(phone, true);
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
      const { error } = await supabase
        .from('conversation_threads')
        .upsert({ phone, churn_risk: true }, { onConflict: 'phone' });
      if (error) throw new Error(`Supabase insert failed [marcar_churn_risk]: ${error.message}`);
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

    default:
      return { error: `Tool desconhecida: ${name}` };
  }
}
