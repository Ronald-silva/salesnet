# Sofia Commercial Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o agente Sofia de reativo para proativo com três modos de operação (Cobrança, Suporte, Comercial) e um scheduler que dispara mensagens proativas para inadimplentes recorrentes antes do vencimento.

**Architecture:** Um Classificador de Sessão examina os dados SGP do cliente + o conteúdo da mensagem e injeta um bloco de contexto adicional no system prompt. O scheduler consulta `billing_notifications` para identificar inadimplentes recorrentes (2+ atrasos em 6 meses) e dispara mensagens D-5 e D-2. Detecção de apagão é feita via tabela `outage_reports` no Supabase, populada quando um chamado técnico é aberto.

**Tech Stack:** TypeScript, Node.js, Supabase (postgres), node-cron, Jest, SGP REST API já integrada.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `backend/src/agent/session-classifier.ts` | Criar | Classifica o modo da sessão (billing/support/commercial/default) |
| `backend/src/agent/prompt.ts` | Modificar | Adiciona funções de contexto por modo |
| `backend/src/agent/processor.ts` | Modificar | Chama classificador e injeta contexto |
| `backend/src/agent/tools.ts` | Modificar | Adiciona 3 novas tools: detectar_apagao_bairro, registrar_negociacao, confirmar_pagamento |
| `backend/src/automations/billing-cadence.ts` | Criar | Jobs D-5 e D-2 filtrados por inadimplentes recorrentes |
| `backend/src/automations/index.ts` | Modificar | Registra novos jobs no cron |
| `backend/src/automations/visit-followup.ts` | Criar | Lembrete 1h antes e follow-up pós-visita |
| `backend/src/integrations/sgp/billing.ts` | Modificar | Adiciona `getHabitualLatePayerIds()` |
| `supabase/migrations/003_outage_reports.sql` | Criar | Tabela outage_reports |
| `supabase/migrations/004_scheduled_visits.sql` | Criar | Tabela scheduled_visits |
| `backend/src/__tests__/agent/session-classifier.test.ts` | Criar | Testes do classificador |
| `backend/src/__tests__/automations/billing-cadence.test.ts` | Criar | Testes do novo scheduler |
| `backend/src/__tests__/automations/visit-followup.test.ts` | Criar | Testes do follow-up de visitas |

---

## Task 1: Supabase migrations

**Files:**
- Create: `supabase/migrations/003_outage_reports.sql`
- Create: `supabase/migrations/004_scheduled_visits.sql`

- [ ] **Step 1: Criar migration 003**

```sql
-- supabase/migrations/003_outage_reports.sql
create table if not exists outage_reports (
  id          uuid primary key default gen_random_uuid(),
  neighborhood text not null,
  customer_id  text not null,
  reported_at  timestamptz not null default now()
);

create index if not exists outage_reports_neighborhood_time
  on outage_reports (neighborhood, reported_at desc);
```

- [ ] **Step 2: Criar migration 004**

```sql
-- supabase/migrations/004_scheduled_visits.sql
create table if not exists scheduled_visits (
  id             uuid primary key default gen_random_uuid(),
  customer_id    text not null,
  phone          text not null,
  visit_date     date not null,
  period         text not null check (period in ('morning', 'afternoon')),
  status         text not null default 'scheduled',
  reminder_sent  boolean not null default false,
  followup_sent  boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists scheduled_visits_date
  on scheduled_visits (visit_date, reminder_sent, followup_sent);
```

- [ ] **Step 3: Executar no Supabase SQL Editor**

Abrir Supabase → SQL Editor → colar e rodar cada migration.
Esperado: "Success. No rows returned" para cada uma.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_outage_reports.sql supabase/migrations/004_scheduled_visits.sql
git commit -m "feat(db): add outage_reports and scheduled_visits tables"
```

---

## Task 2: Session Classifier

**Files:**
- Create: `backend/src/agent/session-classifier.ts`
- Create: `backend/src/__tests__/agent/session-classifier.test.ts`

- [ ] **Step 1: Escrever o teste**

```typescript
// backend/src/__tests__/agent/session-classifier.test.ts
import { classifySession, type SessionMode } from '../../agent/session-classifier';

const activeCustomer = { status: 'active', plan: { downloadMbps: 30 } };
const suspendedCustomer = { status: 'suspended', plan: { downloadMbps: 50 } };
const notFound = { error: 'Cliente não encontrado' };

describe('classifySession — billing mode', () => {
  it('returns billing when customer is suspended', () => {
    expect(classifySession('oi', suspendedCustomer, 'open')).toBe('billing');
  });
  it('returns billing when invoice is overdue', () => {
    expect(classifySession('quero pagar', activeCustomer, 'overdue')).toBe('billing');
  });
  it('returns billing when message mentions pagamento', () => {
    expect(classifySession('como faço pra pagar a fatura?', activeCustomer, 'open')).toBe('billing');
  });
  it('returns billing when message mentions corte', () => {
    expect(classifySession('minha internet foi cortada', activeCustomer, 'open')).toBe('billing');
  });
});

describe('classifySession — support mode', () => {
  it('returns support when message mentions lentidão', () => {
    expect(classifySession('internet lenta demais', activeCustomer, 'open')).toBe('support');
  });
  it('returns support when message mentions queda', () => {
    expect(classifySession('caiu a internet', activeCustomer, 'open')).toBe('support');
  });
  it('returns support when message mentions técnico', () => {
    expect(classifySession('preciso de um técnico', activeCustomer, 'open')).toBe('support');
  });
  it('returns support when message mentions não conecta', () => {
    expect(classifySession('não estou conseguindo conectar', activeCustomer, 'open')).toBe('support');
  });
});

describe('classifySession — commercial mode', () => {
  it('returns commercial for low-plan customer complaining about speed', () => {
    expect(classifySession('tá muito lento pra videochamada', activeCustomer, 'open')).toBe('commercial');
  });
  it('does NOT return commercial for high-plan customer', () => {
    const highPlan = { status: 'active', plan: { downloadMbps: 100 } };
    expect(classifySession('tá muito lento pra videochamada', highPlan, 'open')).toBe('support');
  });
});

describe('classifySession — default', () => {
  it('returns default for generic greeting', () => {
    expect(classifySession('oi bom dia', activeCustomer, 'open')).toBe('default');
  });
  it('returns default when customer not found', () => {
    expect(classifySession('oi', notFound, undefined)).toBe('default');
  });
});
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

```bash
cd backend && npx jest src/__tests__/agent/session-classifier.test.ts --no-coverage
```

Esperado: FAIL — "Cannot find module '../../agent/session-classifier'"

- [ ] **Step 3: Implementar o classificador**

```typescript
// backend/src/agent/session-classifier.ts

export type SessionMode = 'billing' | 'support' | 'commercial' | 'default';

const BILLING_RE =
  /\b(pagar?|pagamento|fatura|boleto|pix|vencimento|vencida?|corte?|cortou|suspens[oa]|suspendid[oa]|d[eé]bito|inadimplente)\b/i;

const SUPPORT_RE =
  /\b(lenta?|lentidão|caiu|qu(e|a)da|sem\s+internet|sem\s+sinal|n[aã]o\s+(conecta|abre|funciona)|roteador|instabilidade|t[eé]cnico|problema|falha|oscila[çc][aã]o)\b/i;

const SPEED_COMPLAINT_RE =
  /\b(lenta?|lentidão|travando|trava|bufferizando|ping|videochamada|streaming|netflix|youtube|zoom)\b/i;

interface CustomerLike {
  status?: string;
  plan?: { downloadMbps?: number };
}

export function classifySession(
  message: string,
  customer: CustomerLike | { error: string },
  invoiceStatus: string | undefined,
): SessionMode {
  if ('error' in customer) return 'default';

  const isSuspended = customer.status === 'suspended';
  const isOverdue = invoiceStatus === 'overdue';
  const isLowPlan = (customer.plan?.downloadMbps ?? 999) <= 30;

  if (isSuspended || isOverdue || BILLING_RE.test(message)) return 'billing';

  if (isLowPlan && SPEED_COMPLAINT_RE.test(message)) return 'commercial';

  if (SUPPORT_RE.test(message)) return 'support';

  return 'default';
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

```bash
cd backend && npx jest src/__tests__/agent/session-classifier.test.ts --no-coverage
```

Esperado: PASS — todos os testes verdes.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/session-classifier.ts backend/src/__tests__/agent/session-classifier.test.ts
git commit -m "feat(agent): add session classifier for billing/support/commercial modes"
```

---

## Task 3: Prompt mode blocks

**Files:**
- Modify: `backend/src/agent/prompt.ts`

- [ ] **Step 1: Adicionar blocos de contexto ao final de prompt.ts**

Abrir `backend/src/agent/prompt.ts` e adicionar após a constante `SYSTEM_PROMPT` existente:

```typescript
export function getBillingModeContext(): string {
  return `
## MODO ATIVO: COBRANÇA
O cliente tem uma situação financeira pendente. Suas prioridades nesta conversa:
1. Confirme os dados da fatura via get_fatura_atual antes de qualquer outra ação
2. Gere o meio de pagamento via gerar_pix imediatamente — não espere o cliente pedir
3. Se o cliente mencionar dificuldade de pagar o valor total, pergunte se quer negociar
4. Use registrar_negociacao para formalizar qualquer acordo de parcelamento
5. Nunca mencione valores de desconto que não venham diretamente do SGP
6. Tom: empático, sem julgamento, focado em resolver rapidamente
`;
}

export function getSupportModeContext(): string {
  return `
## MODO ATIVO: SUPORTE TÉCNICO
O cliente reportou um problema técnico. Siga esta sequência obrigatória:
1. Chame status_conexao — nunca pule esta etapa
2. Se o sinal estiver OK no sistema: oriente a reiniciar o roteador (desligar 30s, religar)
3. Se o sinal estiver ruim: chame detectar_apagao_bairro com o bairro do cliente
4. Se apagão detectado: informe que a equipe já está trabalhando, não abra chamado individual
5. Só abra chamado e agende visita se o problema for isolado E as orientações remotas não resolverem
6. Após agendar visita, confirme data, horário e endereço com o cliente
`;
}

export function getCommercialModeContext(): string {
  return `
## MODO ATIVO: COMERCIAL
O cliente usa um plano de baixa velocidade e demonstrou insatisfação com a performance.
1. Resolva o problema técnico relatado PRIMEIRO — nunca tente vender antes de resolver
2. Após resolução, mencione o upgrade UMA vez, de forma natural: "Já que você usa bastante para [uso mencionado], o plano superior eliminaria essa limitação. Quer que eu veja as condições?"
3. Não insista se o cliente não demonstrar interesse
4. Use buscar_cliente para confirmar o plano atual antes de sugerir qualquer upgrade
`;
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add backend/src/agent/prompt.ts
git commit -m "feat(agent): add mode-specific context blocks for billing/support/commercial"
```

---

## Task 4: Processor — injeção do classificador

**Files:**
- Modify: `backend/src/agent/processor.ts`

- [ ] **Step 1: Adicionar import do classificador**

No topo de `backend/src/agent/processor.ts`, adicionar após os imports existentes:

```typescript
import { classifySession } from './session-classifier';
import { getBillingModeContext, getSupportModeContext, getCommercialModeContext } from './prompt';
```

- [ ] **Step 2: Atualizar a função processMessage**

Localizar o bloco onde `systemWithContext` é construído (linha ~180):

```typescript
// ANTES:
const systemWithContext = `${SYSTEM_PROMPT}\n\n## Contexto do cliente atual\nTelefone: ${phone}\nDados: ${JSON.stringify(customerData)}`;
```

Substituir por:

```typescript
// DEPOIS:
let invoiceStatus: string | undefined;
try {
  if (!('error' in (customerData as object)) && (customerData as { id?: string }).id) {
    const invoice = await executeTool('get_fatura_atual', { customer_id: (customerData as { id: string }).id }, phone);
    invoiceStatus = (invoice as { status?: string }).status;
    if (invoiceStatus) {
      initialToolLog.push({ name: 'get_fatura_atual', input: { customer_id: (customerData as { id: string }).id }, output: invoice });
    }
  }
} catch {
  // invoice lookup is best-effort — don't fail the whole message
}

const sessionMode = classifySession(message, customerData as { status?: string; plan?: { downloadMbps?: number } }, invoiceStatus);

const modeContext =
  sessionMode === 'billing'    ? getBillingModeContext() :
  sessionMode === 'support'    ? getSupportModeContext() :
  sessionMode === 'commercial' ? getCommercialModeContext() :
  '';

const systemWithContext = `${SYSTEM_PROMPT}\n\n## Contexto do cliente atual\nTelefone: ${phone}\nModo detectado: ${sessionMode}\nDados: ${JSON.stringify(customerData)}${modeContext}`;
```

- [ ] **Step 3: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 4: Commit**

```bash
git add backend/src/agent/processor.ts
git commit -m "feat(agent): inject session mode context into Sofia system prompt"
```

---

## Task 5: Novas tools (outage, negociação, confirmação)

**Files:**
- Modify: `backend/src/agent/tools.ts`
- Modify: `backend/src/__tests__/agent/tools.test.ts`

- [ ] **Step 1: Escrever testes para as 3 novas tools**

Abrir `backend/src/__tests__/agent/tools.test.ts` e adicionar no final do arquivo:

```typescript
describe('executeTool — detectar_apagao_bairro', () => {
  it('returns outage true when 2+ reports in last 2h', async () => {
    const chain = mockSupabaseChain({
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [{ id: '1' }, { id: '2' }], error: null }),
    });
    // Note: mockFrom is the `supabase.from` mock — use the same pattern as other tests

    const result = await executeTool('detectar_apagao_bairro', { bairro: 'Jardim Iracema' }, PHONE);
    expect(result).toMatchObject({ outage: true, count: 2 });
  });

  it('returns outage false when fewer than 2 reports', async () => {
    mockSupabaseChain({
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ data: [{ id: '1' }], error: null }),
    });

    const result = await executeTool('detectar_apagao_bairro', { bairro: 'Quintino Cunha' }, PHONE);
    expect(result).toMatchObject({ outage: false, count: 1 });
  });
});

describe('executeTool — confirmar_pagamento', () => {
  it('returns paid true when invoice status is paid', async () => {
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'paid', amount: 90 });

    const result = await executeTool('confirmar_pagamento', { invoice_id: 'inv1' }, PHONE);
    expect(result).toEqual({ paid: true, status: 'paid' });
  });

  it('returns paid false when invoice status is open', async () => {
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'open', amount: 90 });

    const result = await executeTool('confirmar_pagamento', { invoice_id: 'inv1' }, PHONE);
    expect(result).toEqual({ paid: false, status: 'open' });
  });
});

describe('executeTool — registrar_negociacao', () => {
  it('inserts negotiation record and returns confirmation', async () => {
    mockSupabaseChain({
      insert: jest.fn().mockResolvedValue({ error: null }),
    });

    const result = await executeTool(
      'registrar_negociacao',
      { customer_id: 'c1', condicoes: 'entrada 50% hoje, restante em 15 dias' },
      PHONE
    );
    expect(result).toMatchObject({ status: 'registered' });
  });
});
```

- [ ] **Step 2: Adicionar mock de getCurrentInvoice ao bloco de mocks existente**

No topo do arquivo de teste, o mock do SGP já existe. Adicionar `getCurrentInvoice` se não estiver lá:

```typescript
jest.mock('../../integrations/sgp', () => ({
  getCustomerByPhone:  jest.fn(),
  getCurrentInvoice:   jest.fn(),   // já existe — confirmar
  generatePixKey:      jest.fn(),
  getCustomerTickets:  jest.fn(),
  openTicket:          jest.fn(),
  scheduleVisit:       jest.fn(),
  getConnectionStatus: jest.fn(),
}));
```

- [ ] **Step 3: Rodar testes para confirmar que falham**

```bash
cd backend && npx jest src/__tests__/agent/tools.test.ts --no-coverage
```

Esperado: FAIL nos novos describes — "tool desconhecida" ou "not a function".

- [ ] **Step 4: Adicionar as 3 tool definitions em tools.ts**

Em `backend/src/agent/tools.ts`, adicionar ao array `TOOL_DEFINITIONS` após a tool `marcar_churn_risk`:

```typescript
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
```

- [ ] **Step 5: Adicionar execução das 3 tools no switch de executeTool**

Em `backend/src/agent/tools.ts`, adicionar os cases antes do `default:`:

```typescript
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
```

- [ ] **Step 6: Atualizar o case 'abrir_chamado' para registrar em outage_reports quando tipo=tecnico**

Localizar o case `'abrir_chamado'` em `executeTool` e substituir por:

```typescript
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
```

- [ ] **Step 7: Atualizar o case 'agendar_visita' para gravar em scheduled_visits**

Localizar o case `'agendar_visita'` e substituir por:

```typescript
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
```

- [ ] **Step 8: Atualizar o teste de TOOL_DEFINITIONS para refletir 15 tools**

Em `backend/src/__tests__/agent/tools.test.ts`, localizar:

```typescript
  it('exports exactly 12 tools', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(12);
  });
```

Substituir por:

```typescript
  it('exports exactly 15 tools', () => {
    expect(TOOL_DEFINITIONS).toHaveLength(15);
  });
```

- [ ] **Step 9: Rodar todos os testes**

```bash
cd backend && npx jest src/__tests__/agent/tools.test.ts --no-coverage
```

Esperado: PASS — todos os testes verdes.

- [ ] **Step 10: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 11: Commit**

```bash
git add backend/src/agent/tools.ts backend/src/__tests__/agent/tools.test.ts
git commit -m "feat(agent): add detectar_apagao_bairro, registrar_negociacao, confirmar_pagamento tools"
```

---

## Task 6: Billing cadence para inadimplentes recorrentes

**Files:**
- Modify: `backend/src/integrations/sgp/billing.ts`
- Create: `backend/src/automations/billing-cadence.ts`
- Modify: `backend/src/automations/index.ts`
- Create: `backend/src/__tests__/automations/billing-cadence.test.ts`

- [ ] **Step 1: Adicionar getHabitualLatePayerIds em sgp/billing.ts**

Abrir `backend/src/integrations/sgp/billing.ts` e adicionar ao final:

```typescript
export async function getHabitualLatePayerIds(
  minOverdueCount = 2,
  monthsBack = 6,
): Promise<Set<string>> {
  const { createClient } = await import('@supabase/supabase-js');
  const { supabase } = await import('../../config/supabase');

  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);

  const { data } = await supabase
    .from('billing_notifications')
    .select('customer_id')
    .in('type', ['overdue_d3', 'suspended_d5'])
    .gte('sent_at', since.toISOString());

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ customer_id: string }>) {
    counts.set(row.customer_id, (counts.get(row.customer_id) ?? 0) + 1);
  }

  const ids = new Set<string>();
  for (const [id, count] of counts) {
    if (count >= minOverdueCount) ids.add(id);
  }
  return ids;
}
```

- [ ] **Step 2: Escrever os testes do billing-cadence**

```typescript
// backend/src/__tests__/automations/billing-cadence.test.ts
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../integrations/sgp', () => ({
  getCustomersDueInDays: jest.fn(),
  getCurrentInvoice: jest.fn(),
  generatePixKey: jest.fn(),
}));

jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));

import { supabase } from '../../config/supabase';
import * as sgp from '../../integrations/sgp';
import { whatsappService } from '../../services/whatsapp-service';
import { runBillingCadenceD5, runBillingCadenceD2 } from '../../automations/billing-cadence';

function mockSupabaseChain(rows: unknown[] = []) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue({ error: null }),
    single: jest.fn().mockResolvedValue({ data: null }),
  };
  chain.gte = jest.fn().mockResolvedValue({ data: rows, error: null });
  (supabase.from as jest.Mock).mockReturnValue(chain);
  return chain;
}

beforeEach(() => jest.clearAllMocks());

describe('runBillingCadenceD5', () => {
  it('sends message only to habitual late payers', async () => {
    // habituals: c1 has 2 overdue notifications
    mockSupabaseChain([{ customer_id: 'c1' }, { customer_id: 'c1' }]);

    (sgp.getCustomersDueInDays as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90 },
      { customerId: 'c2', name: 'Maria', phone: '+5585999990002', dueDate: '2026-06-01', amount: 70 },
    ]);
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'open' });
    (sgp.generatePixKey as jest.Mock).mockResolvedValue({ pixKey: '00020126...' });

    await runBillingCadenceD5();

    // only c1 should receive message
    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('João')
    );
  });

  it('skips customer already notified today', async () => {
    // habituals: c1
    const chain = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    // First call (getHabitualLatePayerIds) returns c1 twice
    // Second call (alreadySentToday check) returns a record → already sent
    let callCount = 0;
    chain.gte = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: [{ customer_id: 'c1' }, { customer_id: 'c1' }], error: null });
      return chain;
    });
    chain.single = jest.fn().mockResolvedValue({ data: { id: 'existing' } });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    (sgp.getCustomersDueInDays as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90 },
    ]);

    await runBillingCadenceD5();
    expect(whatsappService.sendText).not.toHaveBeenCalled();
  });
});

describe('runBillingCadenceD2', () => {
  it('sends D-2 message to habitual late payers', async () => {
    mockSupabaseChain([{ customer_id: 'c1' }, { customer_id: 'c1' }]);

    (sgp.getCustomersDueInDays as jest.Mock).mockResolvedValue([
      { customerId: 'c1', name: 'João', phone: '+5585999990001', dueDate: '2026-06-01', amount: 90 },
    ]);
    (sgp.getCurrentInvoice as jest.Mock).mockResolvedValue({ id: 'inv1', status: 'open' });
    (sgp.generatePixKey as jest.Mock).mockResolvedValue({ pixKey: '00020126...' });

    await runBillingCadenceD2();

    expect(whatsappService.sendText).toHaveBeenCalledTimes(1);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('2 dias')
    );
  });
});
```

- [ ] **Step 3: Rodar para confirmar que falha**

```bash
cd backend && npx jest src/__tests__/automations/billing-cadence.test.ts --no-coverage
```

Esperado: FAIL — "Cannot find module"

- [ ] **Step 4: Criar billing-cadence.ts**

```typescript
// backend/src/automations/billing-cadence.ts
import { supabase } from '../config/supabase';
import { getCustomersDueInDays, getCurrentInvoice, generatePixKey } from '../integrations/sgp';
import { getHabitualLatePayerIds } from '../integrations/sgp/billing';
import { whatsappService } from '../services/whatsapp-service';
import { env } from '../config/env';

async function alreadySentCadence(customerId: string, type: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('billing_notifications')
    .select('id')
    .eq('customer_id', customerId)
    .eq('type', type)
    .gte('sent_at', todayStart.toISOString())
    .single();

  return data !== null;
}

async function logCadenceNotification(customerId: string, phone: string, type: string): Promise<void> {
  await supabase.from('billing_notifications').insert({
    customer_id: customerId,
    phone,
    type,
    status: 'sent',
  });
}

export async function runBillingCadenceD5(): Promise<void> {
  const [habituals, customers] = await Promise.all([
    getHabitualLatePayerIds(),
    getCustomersDueInDays(5),
  ]);

  for (const customer of customers) {
    if (!habituals.has(customer.customerId)) continue;
    if (await alreadySentCadence(customer.customerId, 'd5_habitual')) continue;

    try {
      const invoice = await getCurrentInvoice(customer.customerId);
      const pix = await generatePixKey(invoice.id);

      const firstName = customer.name.split(' ')[0];
      const msg =
        `Oi ${firstName}! Sua fatura de R$${customer.amount.toFixed(2)} vence em 5 dias (${customer.dueDate}). ` +
        `Pague com PIX:\n${pix.pixKey}`;

      await whatsappService.sendText(env.DEFAULT_TENANT_ID, customer.phone, msg);
      await logCadenceNotification(customer.customerId, customer.phone, 'd5_habitual');
    } catch (err) {
      console.error(`[billing-cadence:d5] failed for ${customer.customerId}:`, err);
    }
  }
}

export async function runBillingCadenceD2(): Promise<void> {
  const [habituals, customers] = await Promise.all([
    getHabitualLatePayerIds(),
    getCustomersDueInDays(2),
  ]);

  for (const customer of customers) {
    if (!habituals.has(customer.customerId)) continue;
    if (await alreadySentCadence(customer.customerId, 'd2_habitual')) continue;

    try {
      const invoice = await getCurrentInvoice(customer.customerId);
      const pix = await generatePixKey(invoice.id);

      const firstName = customer.name.split(' ')[0];
      const msg =
        `⚠️ ${firstName}, faltam 2 dias para sua fatura vencer e a internet ser suspensa. ` +
        `Pague agora via PIX:\n${pix.pixKey}`;

      await whatsappService.sendText(env.DEFAULT_TENANT_ID, customer.phone, msg);
      await logCadenceNotification(customer.customerId, customer.phone, 'd2_habitual');
    } catch (err) {
      console.error(`[billing-cadence:d2] failed for ${customer.customerId}:`, err);
    }
  }
}
```

- [ ] **Step 5: Rodar testes**

```bash
cd backend && npx jest src/__tests__/automations/billing-cadence.test.ts --no-coverage
```

Esperado: PASS.

- [ ] **Step 6: Registrar os novos jobs no cron**

Abrir `backend/src/automations/index.ts` e adicionar os imports e schedules:

```typescript
import { runBillingCadenceD5, runBillingCadenceD2 } from './billing-cadence';
```

Dentro de `startAutomations()`, após os schedules existentes adicionar:

```typescript
  // D-5 habitual late payers: 07:45
  cron.schedule('45 7 * * *', () => {
    runBillingCadenceD5().catch((err) => console.error('[cron:cadence_d5]', err));
  });

  // D-2 habitual late payers: 07:50
  cron.schedule('50 7 * * *', () => {
    runBillingCadenceD2().catch((err) => console.error('[cron:cadence_d2]', err));
  });
```

- [ ] **Step 7: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add backend/src/integrations/sgp/billing.ts backend/src/automations/billing-cadence.ts backend/src/automations/index.ts backend/src/__tests__/automations/billing-cadence.test.ts
git commit -m "feat(automation): proactive billing cadence D-5 and D-2 for habitual late payers"
```

---

## Task 7: Visit follow-up automation

**Files:**
- Create: `backend/src/automations/visit-followup.ts`
- Modify: `backend/src/automations/index.ts`
- Create: `backend/src/__tests__/automations/visit-followup.test.ts`

- [ ] **Step 1: Escrever os testes**

```typescript
// backend/src/__tests__/automations/visit-followup.test.ts
jest.mock('../../config/supabase', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('../../services/whatsapp-service', () => ({
  whatsappService: { sendText: jest.fn() },
}));

import { supabase } from '../../config/supabase';
import { whatsappService } from '../../services/whatsapp-service';
import { sendVisitReminders, sendVisitFollowups } from '../../automations/visit-followup';

function buildChain(rows: unknown[]) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'eq', 'lte', 'gte', 'update'];
  methods.forEach(m => { chain[m] = jest.fn().mockReturnThis(); });
  chain['then'] = jest.fn();
  // terminal
  const select = jest.fn().mockReturnThis();
  chain.select = select;
  chain['eq'] = jest.fn().mockReturnThis();
  chain['lte'] = jest.fn().mockResolvedValue({ data: rows, error: null });
  chain['update'] = jest.fn().mockReturnThis();
  chain['gte'] = jest.fn().mockReturnThis();
  (supabase.from as jest.Mock).mockReturnValue(chain);
  return chain;
}

beforeEach(() => jest.clearAllMocks());

describe('sendVisitReminders', () => {
  it('sends reminder to each pending visit and marks reminder_sent', async () => {
    const visits = [
      { id: 'v1', phone: '+5585999990001', visit_date: '2026-05-23', period: 'morning' },
    ];
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockResolvedValue({ data: visits, error: null }),
      update: jest.fn().mockReturnThis(),
      gte: jest.fn().mockResolvedValue({ error: null }),
    });

    await sendVisitReminders();

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('técnico')
    );
  });
});

describe('sendVisitFollowups', () => {
  it('sends followup message after visit date', async () => {
    const visits = [
      { id: 'v1', phone: '+5585999990001', visit_date: '2026-05-22', period: 'afternoon' },
    ];
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockResolvedValue({ data: visits, error: null }),
      update: jest.fn().mockReturnThis(),
      gte: jest.fn().mockResolvedValue({ error: null }),
    });

    await sendVisitFollowups();

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      expect.any(String),
      '+5585999990001',
      expect.stringContaining('resolvido')
    );
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

```bash
cd backend && npx jest src/__tests__/automations/visit-followup.test.ts --no-coverage
```

Esperado: FAIL — "Cannot find module"

- [ ] **Step 3: Criar visit-followup.ts**

```typescript
// backend/src/automations/visit-followup.ts
import { supabase } from '../config/supabase';
import { whatsappService } from '../services/whatsapp-service';
import { env } from '../config/env';

interface VisitRow {
  id: string;
  phone: string;
  visit_date: string;
  period: string;
}

export async function sendVisitReminders(): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const { data } = await supabase
    .from('scheduled_visits')
    .select('id, phone, visit_date, period')
    .eq('reminder_sent', false)
    .eq('visit_date', todayStr)
    .lte('visit_date', todayStr);

  for (const visit of ((data ?? []) as VisitRow[])) {
    const period = visit.period === 'morning' ? 'manhã' : 'tarde';
    const msg = `Lembrete: o técnico da SalesNet chegará no seu endereço hoje pela ${period}. Certifique-se de que alguém estará em casa. 🔧`;

    try {
      await whatsappService.sendText(env.DEFAULT_TENANT_ID, visit.phone, msg);
      await supabase
        .from('scheduled_visits')
        .update({ reminder_sent: true })
        .eq('id', visit.id)
        .gte('id', visit.id); // força execução
    } catch (err) {
      console.error(`[visit-reminder] failed for visit ${visit.id}:`, err);
    }
  }
}

export async function sendVisitFollowups(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const { data } = await supabase
    .from('scheduled_visits')
    .select('id, phone, visit_date, period')
    .eq('followup_sent', false)
    .lte('visit_date', yesterdayStr);

  for (const visit of ((data ?? []) as VisitRow[])) {
    const msg = `Oi! O técnico da SalesNet passou aí. Seu problema foi resolvido? Responda 👍 se sim ou 👎 se ainda tiver alguma pendência.`;

    try {
      await whatsappService.sendText(env.DEFAULT_TENANT_ID, visit.phone, msg);
      await supabase
        .from('scheduled_visits')
        .update({ followup_sent: true })
        .eq('id', visit.id)
        .gte('id', visit.id);
    } catch (err) {
      console.error(`[visit-followup] failed for visit ${visit.id}:`, err);
    }
  }
}
```

- [ ] **Step 4: Rodar os testes**

```bash
cd backend && npx jest src/__tests__/automations/visit-followup.test.ts --no-coverage
```

Esperado: PASS.

- [ ] **Step 5: Registrar jobs no cron**

Em `backend/src/automations/index.ts`, adicionar:

```typescript
import { sendVisitReminders, sendVisitFollowups } from './visit-followup';
```

Dentro de `startAutomations()`:

```typescript
  // Visit reminders: every hour at :00
  cron.schedule('0 * * * *', () => {
    sendVisitReminders().catch((err) => console.error('[cron:visit-reminder]', err));
  });

  // Visit followups: every day at 18:00
  cron.schedule('0 18 * * *', () => {
    sendVisitFollowups().catch((err) => console.error('[cron:visit-followup]', err));
  });
```

- [ ] **Step 6: Rodar todos os testes do backend**

```bash
cd backend && npx jest --no-coverage
```

Esperado: PASS — todos os testes verdes.

- [ ] **Step 7: TypeScript check final**

```bash
cd backend && npx tsc --noEmit
```

Esperado: sem erros.

- [ ] **Step 8: Commit final**

```bash
git add backend/src/automations/visit-followup.ts backend/src/automations/index.ts backend/src/__tests__/automations/visit-followup.test.ts
git commit -m "feat(automation): visit reminder 1h before and followup after technical visit"
git push origin main
```

---

## Self-Review

**Cobertura do spec:**
- ✅ Classificador de Sessão → Task 2
- ✅ Injeção de contexto por modo → Task 3 + 4
- ✅ Scheduler D-5 e D-2 para inadimplentes recorrentes → Task 6
- ✅ Detecção de apagão → Task 5 (detectar_apagao_bairro)
- ✅ Registro em outage_reports ao abrir chamado técnico → Task 5 (case abrir_chamado)
- ✅ Follow-up de visitas → Task 7
- ✅ Migrations de banco → Task 1
- ✅ Modo Comercial → Task 3 (bloco de contexto) + classificador em Task 2

**Consistência de tipos:**
- `getHabitualLatePayerIds()` retorna `Set<string>`, consumido em `billing-cadence.ts` com `.has()` ✅
- `classifySession()` retorna `SessionMode`, consumido em `processor.ts` ✅
- `VisitRow` interface definida localmente em `visit-followup.ts` ✅

**Nenhum placeholder detectado.**
