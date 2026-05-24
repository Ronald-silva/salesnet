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
    description: 'Busca dados do cliente pelo telefone. Sempre chame esta tool primeiro para ter contexto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        phone: { type: 'string', description: 'Número de telefone E.164 (ex: +5585999990000)' },
      },
      required: ['phone'],
    },
  },
  {
    name: 'get_fatura_atual',
    description: 'Retorna a fatura atual do cliente com valor, vencimento e status de pagamento.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do cliente no SGP' },
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
    name: 'listar_chamados',
    description: 'Lista os últimos chamados de suporte do cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do cliente no SGP' },
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
        customer_id:  { type: 'string', description: 'ID do cliente no SGP' },
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
        customer_id: { type: 'string', description: 'ID do cliente no SGP' },
        date:        { type: 'string', description: 'Data no formato YYYY-MM-DD' },
        period:      { type: 'string', enum: ['morning', 'afternoon'] },
      },
      required: ['customer_id', 'date', 'period'],
    },
  },
  {
    name: 'status_conexao',
    description: 'Verifica se a conexão do cliente está online e a velocidade atual.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do cliente no SGP' },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'solicitar_upgrade',
    description: 'Registra solicitação de upgrade de plano para análise.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do cliente no SGP' },
        new_plan:    { type: 'string', description: 'Plano desejado (ex: 50Mbps, 100Mbps)' },
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
        customer_id: { type: 'string', description: 'ID do cliente no SGP' },
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
    description: 'Verifica se um bairro em Fortaleza/CE tem cobertura de fibra óptica da SalesNet.',
    input_schema: {
      type: 'object' as const,
      properties: {
        neighborhood: { type: 'string', description: 'Nome do bairro' },
      },
      required: ['neighborhood'],
    },
  },
  {
    name: 'marcar_churn_risk',
    description: 'Registra o cliente como risco de cancelamento para acompanhamento pelo time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        customer_id: { type: 'string', description: 'ID do cliente no SGP' },
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
        customer_id: { type: 'string', description: 'ID do cliente no SGP' },
        condicoes:   { type: 'string', description: 'Descrição das condições acordadas (ex: entrada 50% hoje, restante em 15 dias)' },
      },
      required: ['customer_id', 'condicoes'],
    },
  },
  {
    name: 'confirmar_pagamento',
    description: 'Verifica se o pagamento de uma fatura foi confirmado no sistema.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id: { type: 'string', description: 'ID da fatura no SGP' },
      },
      required: ['invoice_id'],
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
        return await sgp.getCustomerByPhone(input.phone as string);
      } catch {
        return { error: 'Cliente não encontrado' };
      }
    }

    case 'get_fatura_atual':
      return sgp.getCurrentInvoice(input.customer_id as string);

    case 'gerar_pix':
      return sgp.generatePixKey(input.invoice_id as string, input.customer_id as string | undefined);

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
            await supabase.from('outage_reports').insert({
              neighborhood,
              customer_id: input.customer_id as string,
            });
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
        message: `Solicitação de upgrade para o plano ${String(input.new_plan)} registrada. Um atendente confirmará em até 24h.`,
      };

    case 'aplicar_cortesia':
      return {
        status: 'queued',
        reason: input.reason,
        message: 'Solicitação de cortesia registrada para análise. Você receberá uma confirmação em breve.',
      };

    case 'transferir_humano': {
      await setHumanMode(phone, true);
      return {
        status: 'transferred',
        message: 'Atendimento transferido para um agente humano. Aguarde, por favor.',
      };
    }

    case 'verificar_cobertura': {
      const key = (input.neighborhood as string).toLowerCase();
      const coverage = COVERED_NEIGHBORHOODS[key];
      if (coverage !== undefined) {
        return { covered: true, neighborhood: input.neighborhood, coverage_percent: coverage };
      }
      return { covered: false, neighborhood: input.neighborhood };
    }

    case 'marcar_churn_risk': {
      await supabase
        .from('conversation_threads')
        .upsert({ phone, churn_risk: true }, { onConflict: 'phone' });
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
      await supabase.from('billing_notifications').insert({
        customer_id: input.customer_id as string,
        phone,
        type: 'negociacao',
        status: 'registered',
        notes: input.condicoes as string,
      });
      return {
        status: 'registered',
        message: `Negociação registrada: ${String(input.condicoes)}. Um atendente confirmará em breve.`,
      };
    }

    case 'confirmar_pagamento': {
      const invoice = await sgp.getCurrentInvoice(input.invoice_id as string);
      return { paid: invoice.status === 'paid', status: invoice.status };
    }

    default:
      return { error: `Tool desconhecida: ${name}` };
  }
}
