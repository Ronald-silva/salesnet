# CLAUDE.md — Contexto técnico para IA

Este arquivo é lido automaticamente por assistentes de IA (Claude Code, Cursor, etc.) ao entrar no repositório. Contém decisões de arquitetura, comportamentos não óbvios e regras implícitas do negócio que não estão no README.

---

## O que é este projeto

**SalesNet Telecom** é um provedor de internet fibra óptica em Fortaleza/CE. Esta plataforma é o sistema operacional da empresa: atendimento via WhatsApp (agente IA Sofia), cobrança automática, portal do cliente e painel administrativo.

O repositório é um **monorepo**:
- Raiz `./` → frontend React (Vite) — deploy no **Vercel** (`salesnet-green.vercel.app`)
- `backend/` → API Node.js + agente IA + automações — deploy no **Railway** (`salesnet-production.up.railway.app`)

---

## Regras de desenvolvimento

- **TypeScript estrito** — nunca use `any`, prefira type assertions explícitas com `unknown` intermediário
- **Sem comentários de código** salvo para casos não óbvios (workarounds, invariantes escondidas)
- **Sem abstrações prematuras** — só extraia helpers quando o trecho repetir 3+ vezes
- **Commits em português** não — use inglês no estilo Conventional Commits (`feat:`, `fix:`, `docs:`)
- Antes de qualquer mudança no backend, rode `npx tsc --noEmit -p backend/tsconfig.json`

---

## SGP TSMX — Comportamentos críticos da API

> Se você não ler esta seção, vai quebrar a integração.

### Autenticação e formato

O SGP **não usa REST/JSON**. Toda chamada é:
```
POST <endpoint>
Content-Type: application/x-www-form-urlencoded

app=Ronald&token=<uuid>&<params>
```

O helper `systemParams()` em `backend/src/integrations/sgp/client.ts` já preenche `app` e `token` automaticamente. **Nunca chame o `sgpClient` diretamente sem usar `systemParams()`.**

```typescript
// CORRETO
const body = systemParams({ contrato: contratoId, status: '1' });
const { data } = await sgpClient.post('/api/central/titulos/', body.toString());

// ERRADO — vai retornar 401
const { data } = await sgpClient.post('/api/central/titulos/', { contrato: contratoId });
```

### Endpoints reais (confirmados)

| Operação | Endpoint | Parâmetros chave |
|----------|----------|-----------------|
| Buscar cliente por telefone | `POST /api/ura/consultacliente/` | `telefone` (sem +55, sem 0) |
| Buscar cliente por contrato | `POST /api/ura/consultacliente/` | `contrato` |
| Listar faturas | `POST /api/central/titulos/` | `contrato`, `status` (1=aberto), `limit` |
| Gerar PIX | `POST /api/central/pagamento/pix/{invoiceId}` | `contrato` no body |
| Abrir chamado | `POST /api/central/chamado/` | `contrato` |

### Stubs intencionais (limitação da API)

Estas funções **retornam valores fixos por design** — a API SGP não suporta essas operações:

```typescript
getOverdueCustomers()     // retorna [] — não há endpoint bulk
getCustomersDueInDays()   // retorna [] — não há endpoint bulk
getCustomerTickets()      // retorna [] — não disponível com token auth
suspendCustomer()         // retorna stub — endpoint não exposto
reactivateCustomer()      // retorna stub — endpoint não exposto
scheduleVisit()           // retorna stub — agendamento via Sofia/Supabase, não SGP
```

Não tente "corrigir" essas funções chamando outros endpoints do SGP — eles não existem.

### Normalização de telefone

O SGP recebe telefone **sem** código de país e **sem** 9 inicial em alguns casos:
- `getCustomerByPhone('+5585991993833')` → passa `'85991993833'` para a API (strip do `55`)
- Isso está implementado em `customers.ts` — não duplique a lógica

---

## Evolution Go — Comportamentos críticos do webhook

### Estrutura real do payload de mensagem (confirmada em produção)

```json
{
  "event": "Message",
  "instanceName": "salesnet",
  "instanceToken": "salesnet-token-2026",
  "data": {
    "Info": {
      "Chat": "558591993833@s.whatsapp.net",
      "Sender": "558591993833@s.whatsapp.net",
      "PushName": "Ronald",
      "IsFromMe": false,
      "IsGroup": false,
      "ID": "3EB07FD03B377CC5345111",
      "Timestamp": "2026-05-26T22:40:36-03:00",
      "Type": "text"
    },
    "Message": {
      "conversation": "oi"
    }
  }
}
```

**Atenção:** os campos de metadados ficam em `data.Info`, não direto em `data`. O campo `IsFromMe` (não `FromMe`) indica se foi o bot que enviou.

O parser em `evolution-go.ts` já lida com isso e também tem fallback para o formato antigo (campos direto em `data`), para compatibilidade com diferentes versões do Evolution Go.

### Autenticação da instância

O Evolution Go usa **dois níveis de autenticação**:
- **Admin (global)**: header `apikey: <EVOLUTION_API_KEY>` — para criar/deletar instâncias
- **Instância**: header `apikey: <EVOLUTION_INSTANCE_TOKEN>` — para enviar mensagens e conectar

O `instanceHttp(name)` em `evolution-go.ts` resolve automaticamente qual token usar com base no cache interno.

### Re-registro de webhook no startup

O Evolution Go **perde a configuração de webhook** quando reinicia. O `bootstrap.ts` chama `connectInstance()` a cada startup do backend para garantir que o webhook está registrado. Não remova essa chamada.

---

## Agente Sofia — Arquitetura do processamento

### Fluxo por mensagem

```
1. processMessage(phone, body) — processor.ts
2. Chama buscar_cliente(phone) para ter contexto
3. Chama get_fatura_atual se o cliente existir (best-effort)
4. classifySession() → modo: billing | support | commercial | prospect | default
5. Monta system prompt com contexto do cliente + modo ativo
6. Escolhe LLM via resolveTieredRouting() baseado na complexidade da mensagem
7. Loop de tool-calling (até 10 rodadas)
8. Envia resposta + salva no histórico + loga no Supabase
```

### Modo prospect

Quando `buscar_cliente` retorna `{ error: 'Cliente não encontrado' }`, o `session-classifier` retorna `'prospect'`. Sofia então segue o fluxo de vendas: pergunta nome e bairro → `verificar_cobertura` → apresenta planos → `registrar_interesse` → confirma que a equipe entrará em contato em 24h.

### Roteamento de LLM

```typescript
// complexity-router.ts
'simple'       → DeepSeek (saudações, FAQ de planos/cobertura, segunda via)
'intermediate' → DeepSeek (suporte técnico, fatura com PIX)
'complex'      → Anthropic Claude (Procon, ação judicial, ameaças)
```

O `LLM_ROUTING_MODE=tiered` ativa este roteamento. Com `LLM_ROUTING_MODE=single` usa sempre `LLM_PROVIDER`.

### Tool verificar_cobertura

- Passe `neighborhood="*"` para **listar todos os bairros cobertos** (quando o cliente perguntar quais bairros a SalesNet atende)
- Sofia **nunca deve listar bairros de memória** — sempre use esta tool para evitar alucinação
- Os bairros reais são: Jardim Guanabara, Jardim Iracema, Quintino Cunha, Vila Velha, Nova Assunção

### Modo humano

Quando `transferir_humano` é chamada, `setHumanMode(phone, true)` é gravado no Supabase. A próxima mensagem desse telefone cai na guard `isHumanMode(phone)` em `processor.ts` e retorna imediatamente sem processar. Para reativar o bot, o admin precisa resetar o flag no Supabase.

---

## Supabase — Tabelas e usos

| Tabela | Quem escreve | Quem lê |
|--------|-------------|---------|
| `conversation_threads` | `memory.ts` (msgs), `tools.ts` (churn_risk, human_mode) | `memory.ts`, `processor.ts` |
| `interaction_logs` | `processor.ts` (ao final de cada processamento) | painel admin |
| `whatsapp_instances` | `instance-manager.ts` | `webhook-router.ts`, `bootstrap.ts` |
| `leads` | `tools.ts` (`registrar_interesse`) | painel admin |
| `scheduled_visits` | `tools.ts` (`agendar_visita`) | automations (lembrete 24h antes) |
| `outage_reports` | `tools.ts` (`abrir_chamado` técnico) | `tools.ts` (`detectar_apagao_bairro`) |
| `billing_notifications` | automations de cobrança, `registrar_negociacao` | automations (dedup), `getHabitualLatePayerIds` |

Para criar todas as tabelas pela primeira vez: `backend/src/agent/schema.sql`

---

## Automações — Cron jobs

Todos os cron jobs ficam em `backend/src/automations/`. São iniciados via `startAutomations()` em `index.ts` (nunca em modo `test`).

### Billing (billing-automation.ts)

- **D-5 / D-2 proativo**: só para `getHabitualLatePayerIds()` — clientes que atrasaram ≥2 vezes nos últimos 6 meses
- **D+3**: para todos os clientes com fatura vencida há 3 dias
- **D+5**: aviso de suspensão

`getHabitualLatePayerIds()` consulta `billing_notifications` no Supabase — não o SGP (que não tem endpoint bulk).

### Visit reminders (visit-reminder-automation.ts)

- Lembrete 24h antes da visita: lê `scheduled_visits` com `status='scheduled'` e `visit_date` = amanhã
- Follow-up 24h após: lê `scheduled_visits` com `visit_date` = ontem, envia pergunta se resolveu

### Campanhas

| Arquivo | Quando envia |
|---------|-------------|
| `upsell.ts` | Clientes com plano ≤ 30 Mbps sem tickets abertos |
| `churn-risk.ts` | Clientes com `churn_risk=true` no thread |
| `referral.ts` | Clientes ativos há > 60 dias |
| `expansion.ts` | Prospects que perguntaram sobre bairros sem cobertura |

Todas verificam `alreadySentCampaign()` antes de enviar para evitar duplicatas.

---

## Variáveis de ambiente críticas

```env
# SGP — atenção ao formato
SGP_BASE_URL=https://salesnet.sgp.tsmx.com.br   # URL base real (não docs)
SGP_APP_NAME=Ronald                              # nome exato do app no painel SGP
SGP_API_TOKEN=<uuid>                             # token gerado no painel SGP

# Evolution Go — dois tokens diferentes
EVOLUTION_API_KEY=<chave_global_admin>           # para criar/listar instâncias
EVOLUTION_INSTANCE_TOKEN=salesnet-token-2026     # para enviar mensagens

# Backend URL — necessário para o webhook auto-registration no startup
BACKEND_URL=https://salesnet-production.up.railway.app
```

---

## O que não fazer

- **Não use `JSON.stringify` para o body das chamadas SGP** — use `URLSearchParams` + `systemParams()`
- **Não mude a estrutura de `DomainEvent.payload`** para `message_received` — o `onIncomingMessage` espera `{ phone, body, profileName }`
- **Não remova a chamada `connectInstance()` no bootstrap** — o Evolution Go perde o webhook no restart
- **Não adicione bairros em `COVERED_NEIGHBORHOODS`** sem confirmar com o usuário — causar alucinação é pior que não ter o bairro
- **Não implemente cancelamento automático de contratos** — sempre transferir para humano
- **Não processe mensagens com `phone` ou `body` undefined** — o guard no `index.ts` já bloqueia, não remova

---

## Arquivos mais importantes para entender o sistema

Leia nesta ordem para ter contexto completo:

1. `backend/src/agent/processor.ts` — orquestração principal
2. `backend/src/agent/tools.ts` — todas as ações da Sofia
3. `backend/src/agent/prompt.ts` — personalidade e regras da Sofia
4. `backend/src/integrations/sgp/client.ts` — como se fala com o SGP
5. `backend/src/integrations/whatsapp/providers/evolution-go.ts` — como parsear webhooks
6. `backend/src/automations/billing-automation.ts` — exemplo de automação
