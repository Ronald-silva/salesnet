# CLAUDE.md — Guia técnico para assistentes de IA

Este arquivo é lido automaticamente por Claude Code, Cursor e outros assistentes. Contém as decisões de arquitetura, comportamentos não-óbvios, armadilhas conhecidas e o mapa real do sistema — o que não está visível só lendo o código.

**Objetivo deste documento:** dar contexto suficiente para uma IA especialista em agentes conversacionais identificar o que falta para tornar a Sofia a melhor agente de atendimento ISP via WhatsApp do mercado.

---

## O que é este projeto

**SalesNet Telecom** — provedor de internet fibra óptica em Fortaleza/CE. Esta plataforma é o sistema operacional da empresa: atendimento via WhatsApp (agente IA Sofia), cobrança automática, portal do cliente e painel administrativo.

Monorepo:
- Raiz `./` → frontend React (Vite) — deploy no **Vercel** (`salesnet-green.vercel.app`)
- `backend/` → API Node.js + agente IA + automações — deploy no **Railway** (`salesnet-production.up.railway.app`)

---

## Regras de desenvolvimento

- **TypeScript estrito** — nunca use `any`. Use `unknown` como intermediário em type assertions
- **Sem comentários óbvios** — comente apenas WHY não-óbvio (workaround, invariante escondida)
- **Sem abstrações prematuras** — 3+ repetições antes de extrair helper
- **Commits em inglês** — Conventional Commits (`feat:`, `fix:`, `docs:`)
- **Antes de qualquer mudança no backend:** `npx tsc --noEmit -p backend/tsconfig.json`

---

## Arquitetura do agente Sofia

### Ordem exata de execução em `processMessage(phone, message)`

```
1.  isHumanMode(phone)              → abandona silenciosamente se humano ativo
2.  startMs = Date.now()            → timer para processing_ms
3.  sanitizeUserInput(message)      → trunca 2000 chars, remove 15 padrões injection PT+EN
4.  getPendingNps(phone)            → verifica se NPS está pendente para este número
    4a. NPS não enviado → cancela NPS, continua
    4b. NPS enviado + resposta numérica → salva, agradece, encerra
    4c. NPS enviado + resposta não-numérica → descarta NPS, continua
5.  quickReply(clean, phone)        → FAQ sem LLM
    5a. plans_list + cliente existente → retorna null (passa para LLM)
    5b. qualquer outro match → retorna string, salva histórico, envia, encerra
6.  saveMessage(phone, 'user', clean)
7.  getThread(phone)                → histórico de conversa do Supabase
8.  [parallel] buscar_cliente(phone) + getCustomerInsights(phone, tenantId)
9.  get_fatura_atual(customerId)    → pré-executado se cliente existe (best-effort, não joga)
10. verificar_cobertura('*')        → pré-executado se mensagem tem keyword de bairro
11. classifySession(message, customerData, invoiceStatus)
12. classifyMessageComplexity(message)
13. monta systemWithContext:
      getFortalezaContext()          ← hora local (UTC-3)
      + SYSTEM_PROMPT
      + "Contexto do cliente atual: telefone, modo, dados JSON (sem senha/login)"
      + getXxxModeContext()          ← bloco de contexto por modo
      + coverageContext              ← se relevante
      + buildInsightsContext()       ← avisos baseados no histórico
14. resolveTieredRouting(complexity, sessionMode)
15. runLLMFlow(provider, history, systemWithContext, phone, initialToolLog, options)
    └── loop tool-calling até cap do tier
16. shouldSendNps(phone, tenantId)  ← consultado ANTES do insert (reflete sessão anterior)
    scheduleNps(...)                ← setTimeout de 30min em memória (não persiste no banco)
17. supabase.interaction_logs.insert({ phone, session_mode, tool_calls, response, processing_ms })
```

**Ponto crítico:** `shouldSendNps` é chamado ANTES do insert, portanto a query para "última sessão" ainda verifica a sessão anterior. Isso é intencional — evita enviar NPS na mesma sessão que acionou o check.

### Dados sensíveis removidos do prompt

`safeCustomerData` no processor.ts remove `contratoCentralSenha` e `contratoCentralLogin` antes de fazer `JSON.stringify` para o system prompt. Nunca remova esse filtro.

---

## SGP TSMX — Comportamentos críticos

### Formato das chamadas

O SGP **não usa REST/JSON**. Toda chamada é:
```
POST <endpoint>
Content-Type: application/x-www-form-urlencoded

app=Ronald&token=<uuid>&<params>
```

O helper `systemParams()` em `backend/src/integrations/sgp/client.ts` preenche `app` e `token` automaticamente.

```typescript
// CORRETO
const body = systemParams({ contrato: contratoId, status: '1' });
const { data } = await sgpClient.post('/api/central/titulos/', body.toString());

// ERRADO — retorna 401
const { data } = await sgpClient.post('/api/central/titulos/', { contrato: contratoId });
```

### Endpoints reais (confirmados em produção)

| Operação | Endpoint | Parâmetros chave |
|----------|----------|-----------------|
| Buscar cliente por telefone | `POST /api/ura/consultacliente/` | `telefone` (sem +55) |
| Buscar cliente por contrato | `POST /api/ura/consultacliente/` | `contrato` |
| Listar faturas | `POST /api/central/titulos/` | `contrato`, `status` (1=aberto), `limit` |
| Gerar PIX | `POST /api/central/pagamento/pix/{invoiceId}` | `contrato` no body |
| Abrir chamado | `POST /api/central/chamado/` | `contrato` |
| Listar chamados Sofia | Supabase `sofia_tickets` | `contrato`, `tenant_id`, `status` |

### Normalização de telefone

`getCustomerByPhone('+5585991993833')` → passa `'85991993833'` para a API (strip do `55`). Lógica em `customers.ts`. Não duplique.

### Stubs intencionais — esses endpoints não existem no SGP

```typescript
getOverdueCustomers()     // retorna [] — sem endpoint bulk
getCustomersDueInDays()   // retorna [] — sem endpoint bulk
getCustomerTickets()      // retorna [] — sem token auth
suspendCustomer()         // stub — endpoint não exposto
reactivateCustomer()      // stub — endpoint não exposto
scheduleVisit()           // SGP retorna stub; persiste em scheduled_visits no Supabase
listar_chamados (tool)    // retorna [] — manter por compatibilidade; usar listar_chamados_sofia
```

Não tente "corrigir" essas funções chamando outros endpoints — eles não existem.

---

## Evolution Go — Comportamentos críticos

### Estrutura real do payload de webhook (confirmada em produção)

```json
{
  "event": "Message",
  "instanceName": "salesnet",
  "instanceToken": "<EVOLUTION_INSTANCE_TOKEN>",
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

Metadados em `data.Info`, não direto em `data`. Campo `IsFromMe` (não `FromMe`). O parser tem fallback para formato legado.

### Dois níveis de autenticação

- **Admin (global):** header `apikey: <EVOLUTION_API_KEY>` — criar/deletar instâncias
- **Instância:** header `apikey: <EVOLUTION_INSTANCE_TOKEN>` — enviar mensagens

`instanceHttp(name)` em `evolution-go.ts` resolve qual token usar automaticamente.

### Re-registro de webhook no startup

O Evolution Go **perde a config de webhook quando reinicia**. `bootstrap.ts` chama `connectInstance()` a cada startup do backend. **Nunca remova essa chamada.**

---

## Módulo NPS (`nps-flow.ts`)

### Lógica de envio

`shouldSendNps(phone, tenantId): Promise<boolean>` retorna `true` somente se:
1. Não há NPS pendente em memória para este phone
2. Existe ao menos uma sessão anterior no `interaction_logs`
3. A sessão anterior **não** é `prospect`
4. A sessão anterior foi há 30min–2h (indicador de sessão encerrada recentemente)
5. Nenhum NPS enviado para este phone nos últimos 2h (guard de deduplicação)

### Estado em memória (não persistido no banco)

```typescript
const pendingNps = new Map<string, { sessionId, scheduledAt, sent }>()
```

O setTimeout de 30min não sobrevive a restart do backend. Se o processo reiniciar antes dos 30min, o NPS não é enviado — isso é aceitável.

### Captura da resposta

`parseNpsResponse(message)` aceita apenas `'1'`–`'5'` (1 dígito). Qualquer outra coisa retorna `null` e a mensagem segue para processamento normal.

### Tabela `nps_responses`

```sql
CREATE TABLE nps_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  score INTEGER CHECK (score BETWEEN 1 AND 5),
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Módulo de memória do cliente (`customer-memory.ts`)

Enriquece o system prompt com alertas baseados em dados históricos do Supabase. Executado em paralelo com `buscar_cliente` antes do LLM.

| Sinal | Condição | Aviso inserido no prompt |
|-------|----------|--------------------------|
| `recurring_support` | ≥ 2 sessões `support` nos últimos 30 dias | "Problemas recorrentes. Priorizar resolução, não vender." |
| `churn_risk_active` | `conversation_threads.churn_risk = true` | "Cliente em risco de churn. Tom cuidadoso." |
| `days_since_first_contact > 365` | thread criado há > 1 ano | "Cliente há mais de 1 ano. Tratamento preferencial." |

Quando nenhum sinal é positivo, `buildInsightsContext()` retorna `''` (sem ruído no prompt).

---

## Camada quick-reply — comportamento preciso

`quickReply(message, phone): Promise<string | null>`

Para `plans_list`, chama `buscar_cliente(phone)` internamente:
- Se cliente existe → retorna `null` (LLM responde com contexto do contrato atual)
- Se não existe → retorna string formatada com lista de planos

Para `coverage_list`, `coverage_check`, `faq_*` → responde diretamente **sem verificar se é cliente**. Limitação conhecida: cliente ativo que pergunta sobre cobertura recebe resposta de prospect.

A função é `async` porque `plans_list` precisa de `buscar_cliente`.

---

## Session classifier — heurísticas regex

`classifySession(message, customer, invoiceStatus): SessionMode`

Ordem de precedência:
1. `'error' in customer` → `'prospect'`
2. `suspended` OU `invoiceStatus === 'overdue'` OU `BILLING_RE` → `'billing'`
3. `isLowPlan (≤50Mbps)` AND `SPEED_COMPLAINT_RE` → `'commercial'`
4. `SUPPORT_RE` → `'support'`
5. `PROSPECT_RE` → `'prospect'`
6. fallback → `'default'`

**Armadilha:** "minha internet caiu, quero cancelar" → classifica como `'support'` (SUPPORT_RE bate antes). Cancelamento é tratado dentro do tool-calling pelo prompt.

---

## Roteamento de LLM — heurísticas regex

`classifyMessageComplexity(message): ComplexityTier`

1. `COMPLEX_RE` (procon, anatel, judicial...) → `'complex'` → **Anthropic**
2. (`GREETING_RE` OU `FAQ_HINT_RE`) AND `length ≤ 100` → `'simple'` → **DeepSeek** (tokens/rounds reduzidos)
3. else → `'intermediate'` → **DeepSeek** (limites padrão)

`LLM_ROUTING_MODE=single` ignora tier, usa sempre `LLM_PROVIDER`.

---

## System prompt — regras críticas (não alterar sem análise)

1. Para planos/preços: usar SEMPRE `get_planos_disponiveis` — nunca `verificar_cobertura`
2. Para bairros: usar `verificar_cobertura('*')` — nunca de memória
3. PROIBIDO asteriscos `*palavra*` — WhatsApp Web não renderiza negrito assim
4. Máximo 3-4 parágrafos por resposta
5. Nunca cancelamento automático — sempre `transferir_humano`

---

## Supabase — Tabelas e usos

| Tabela | Quem escreve | Quem lê |
|--------|-------------|---------|
| `conversation_threads` | `memory.ts`, `tools.ts` | `processor.ts`, `admin.ts` |
| `interaction_logs` | `processor.ts` (inclui `processing_ms`) | `reports.ts`, `customer-memory.ts`, `nps-flow.ts` |
| `nps_responses` | `nps-flow.ts` | `reports.ts` |
| `whatsapp_instances` | `instance-manager.ts` | `webhook-router.ts`, `bootstrap.ts` |
| `leads` | `tools.ts` (registrar_interesse) | painel admin |
| `scheduled_visits` | `tools.ts` (agendar_visita) | automations |
| `outage_reports` | `tools.ts` (abrir_chamado técnico) | `tools.ts` (detectar_apagao_bairro) |
| `sofia_tickets` | `tools.ts` (abrir_chamado) | `tools.ts` (listar_chamados_sofia) |
| `billing_notifications` | automações, `registrar_negociacao` | `getHabitualLatePayerIds`, automações |
| `scheduled_messages` | `nps-flow.ts` | `scheduled-messages.ts` (cron 10 min) |

Migrations em `backend/src/db/migrations/` (executar em ordem):
- `schema.sql` — tabelas base
- `002_enable_rls.sql`
- `003_add_session_mode_to_interaction_logs.sql`
- `011_nps.sql` — tabela `nps_responses`
- `012_add_processing_ms.sql` — coluna `processing_ms INTEGER` em `interaction_logs`
- `013_scheduled_messages.sql` — tabela `scheduled_messages` (mensagens adiadas pós-NPS)
- `014_client_notes.sql` — coluna `notes TEXT` em `conversation_threads`
- `015_sofia_tickets.sql` — tabela `sofia_tickets` (chamados abertos via Sofia)
- `009_performance_indexes.sql` — índices para o Supabase SQL Editor (sem CONCURRENTLY; arquivo inteiro de uma vez)
- `009_performance_indexes_concurrent.sql` — mesmos índices com CONCURRENTLY (só via psql, uma statement por vez)

---

## Política de retenção de dados

Purge automático via `data-cleanup.ts` (cron 06:00 UTC = 03:00 Fortaleza):

| Tabela | Retenção | Purge automático |
|--------|----------|------------------|
| `processed_message_ids` | 24 horas | Sim |
| `interaction_logs` | 90 dias | Sim |
| `nps_responses` | 90 dias | Sim |
| `billing_notifications` | 180 dias (`sent_at`) | Sim |
| `leads` | 365 dias | Não (obrigação fiscal; retenção documentada) |
| `sofia_tickets` | 365 dias | Não |
| `scheduled_visits` | 365 dias | Não |

---

## Automações — onde vivem e quando rodam

Todas em `backend/src/automations/`. Iniciadas via `startAutomations()` em `index.ts` (nunca em `NODE_ENV=test`).

### Billing (`billing-automation.ts`)

- **D-5 / D-2 proativo:** só para `getHabitualLatePayerIds()` — clientes que atrasaram ≥ 2 vezes nos últimos 6 meses
- **D+3:** todos com fatura vencida há 3 dias
- **D+5:** aviso de suspensão

`getHabitualLatePayerIds()` consulta `billing_notifications` no Supabase — não o SGP.

### Retenção LGPD (`data-cleanup.ts`)

- **03:00 Fortaleza (06:00 UTC):** apaga `processed_message_ids` > 24h, `interaction_logs` e `nps_responses` > 90 dias, `billing_notifications` > 180 dias (por `sent_at`)
- **Não apaga:** `leads`, `scheduled_visits`, `sofia_tickets` (manter ≥ 1 ano por obrigação fiscal)

### Campanhas

| Arquivo | Condição |
|---------|----------|
| `upsell.ts` | Plano ≤ 30 Mbps sem tickets abertos |
| `churn-risk.ts` | `churn_risk=true` no thread |
| `referral.ts` | Cliente ativo > 60 dias |
| `expansion.ts` | Prospects que consultaram bairros sem cobertura |

Todas verificam `alreadySentCampaign()` antes de enviar.

---

## Variáveis de ambiente críticas

```env
SGP_BASE_URL=https://salesnet.sgp.tsmx.com.br
SGP_APP_NAME=Ronald                          # nome exato no painel SGP
SGP_API_TOKEN=<uuid>

EVOLUTION_API_KEY=<chave_global_admin>
EVOLUTION_INSTANCE_TOKEN=<token_instancia>
GEMINI_API_KEY=AIza...   # Google AI Studio — usado em vision.ts para OCR de imagens

BACKEND_URL=https://salesnet-production.up.railway.app
```

---

## ISP Agent Skill

O prompt da Sofia não é mais uma string estática. É gerado em runtime a partir de configuração por tenant.

- **Localização:** `backend/src/agent/skill/`
  - `types.ts` — interfaces (`ISPSkillConfig`, `ISPPlan`, `ISPBusinessInfo`, …)
  - `config-loader.ts` — registry de tenants (`getSkillConfig`)
  - `prompt-builder.ts` — `buildSystemPrompt(config)` e `buildModeContext(mode, config)`
  - `index.ts` — exports públicos
- **Integração:** `processor.ts` chama `getSkillConfig(env.DEFAULT_TENANT_ID)` + `buildSystemPrompt` / `buildModeContext`
- **Compat:** `prompt.ts` reexporta `SYSTEM_PROMPT` e `getXxxModeContext()` delegando à skill (código legado)
- **Dados canônicos hoje:** `company-data.ts` → `config-loader.ts` (registry `salesnet`, aliases `default`, `salesnet-default`, `test-tenant`)
- **Override por tenant (Supabase):** coluna `tenants.settings.skill` (JSON partial `ISPSkillConfig`), merge via `getSkillConfig(tenantId)` com cache 60s — ver migration `019_tenant_skill_settings.sql`
- **tenantId no agente:** webhook → `event.tenantId` → `processMessage(phone, body, { tenantId, messageId })` — usa instância WhatsApp correta e skill do tenant
- **Isolamento de dados:** `conversation_threads` e `interaction_logs` escopados por `(tenant_id, phone)` — migration `020_tenant_scoped_conversations.sql` (unique composto; admin/reports filtram `DEFAULT_TENANT_ID`)
- **Novo ISP (código):** `registerSkillConfig(tenantId, config)` ou entrada no `configRegistry`
- **Novo ISP (só dados):** `UPDATE tenants SET settings = jsonb_set(settings, '{skill}', '...')` + planos/bairros no JSON

---

## Arquivos mais importantes — leia nesta ordem

1. `backend/src/agent/processor.ts` — orquestração principal
2. `backend/src/agent/tools.ts` — 20 ferramentas + stubs documentados
3. `backend/src/agent/skill/` — prompt dinâmico e config por tenant (substitui prompt estático)
4. `backend/src/agent/nps-flow.ts` — fluxo NPS completo
5. `backend/src/agent/customer-memory.ts` — insights cross-session
6. `backend/src/agent/quick-reply.ts` — FAQ sem LLM
7. `backend/src/integrations/sgp/client.ts` — comunicação com SGP
8. `backend/src/integrations/whatsapp/providers/evolution-go.ts` — parser de webhooks
9. `backend/src/agent/vision.ts` — análise de imagens via Gemini Flash
10. `backend/src/agent/prompt.ts` — camada de compat (delega à skill)

---

## Atualizações recentes já implementadas (estado atual do branch)

### 1) Classificador híbrido (regex + LLM leve)

- `classifySession` em `session-classifier.ts` deixou de forçar `prospect` quando cliente não é encontrado; agora:
  - só marca `prospect` em intenção forte de contratação (`PROSPECT_STRONG_RE`)
  - evita falso positivo para cliente existente com `EXISTING_CUSTOMER_CONTEXT_RE` (ex.: "meu plano")
- `processor.ts` adicionou uma etapa de desambiguação por LLM (`disambiguateSessionMode`) para casos ambíguos:
  - candidatos: `prospect`, `commercial` e `default` com palavras sensíveis
  - não roda para `billing`/`support` óbvios (controle de custo/latência)
  - parse estrito de JSON com `mode/confidence/reason`
  - fallback seguro para regex quando confiança baixa ou erro da LLM
- `sessionModeDecision` entra no `initialToolLog` como `session_classifier` para auditoria.

### 2) Memória semântica com notas de atendimento

- Migration `014_client_notes.sql` criada: `conversation_threads.notes TEXT`.
- Tool `atualizar_notas_cliente` implementada em `tools.ts` (limite de 500 chars).
- `customer-memory.ts` passou a ler `notes` e inserir no prompt como:
  - `Nota do atendimento anterior: ...`

### 3) Chamados Sofia persistidos no Supabase

- Migration `015_sofia_tickets.sql` criada (tabela `sofia_tickets` + índices).
- `abrir_chamado` agora persiste em `sofia_tickets` (best-effort, sem bloquear fluxo).
- Nova tool `listar_chamados_sofia` retorna chamados por `contrato + tenant_id + status`.
- `listar_chamados` (SGP) segue stub por compatibilidade; comentário atualizado em `integrations/sgp/tickets.ts`.
- `prompt.ts` reforça regra: antes de abrir chamado técnico, consultar `listar_chamados_sofia`.

### 4) Atualização comercial de planos

- `company-data.ts` atualizado para:
  - 400 Mega (R$ 79,99)
  - 500 Mega (R$ 89,99, plano popular)
  - 700 Mega (R$ 109,99)
- `BUSINESS_INFO.installationFee` alterada para `50`.
- Frontend público (`src/pages/Home.tsx` e `src/pages/Plans.tsx`) atualizado para refletir os novos planos e taxa de instalação.

---

## Gaps prioritários — briefing para melhoria da Sofia

### 1. Classificador de sessão baseado em LLM

**Status atual:** modelo híbrido já em produção no código: regex determinístico + desambiguação por LLM leve em casos ambíguos.

**Melhorias já aplicadas:**
- "Queria entender meu plano" não cai mais em `prospect` automaticamente.
- Quando `buscar_cliente` falha, mensagens genéricas voltam para `default` (não `prospect` por padrão).
- Desambiguação por LLM registra `confidence/reason` e tem fallback seguro.

**Próximo passo:** incluir sinais de sessão anterior no classificador (últimos modos) para reduzir troca de contexto em conversas curtas de follow-up.

### 2. Histórico real de chamados

**Status atual:** `listar_chamados` (SGP) continua retornando `[]` por limitação de endpoint, mas agora existe `listar_chamados_sofia` funcional via Supabase.

**Como funciona hoje:** `abrir_chamado` persiste cada abertura em `sofia_tickets` e `listar_chamados_sofia` consulta por `contrato + tenant_id + status` para evitar duplicidade e informar protocolo/status ao cliente.

**Próximo passo:** ampliar heurística de duplicidade (ex.: comparar similaridade de descrição/tipo e janela de tempo) antes de abrir novo chamado.

### 3. Suporte a áudio e imagem

**Hoje:** Evolution Go entrega `audioMessage`, `imageMessage`, `documentMessage` no webhook, mas o processor só processa `conversation` (texto puro).

**Impacto:** >40% dos usuários WhatsApp enviam áudio. Comprovante de PIX em imagem é caso crítico (cliente manda foto → Sofia não vê → acredita que não pagou).

**Direção:**
- Áudio → Whisper API (transcrição) → texto → processamento normal
- Imagem de pagamento → Anthropic vision para extrair valor/data/beneficiário
- Documento PDF → parse para confirmar se é boleto da SalesNet

### 4. Script de diagnóstico de velocidade

**Hoje:** Sofia orienta reiniciar roteador e abre chamado se não resolver.

**Impacto:** visita técnica custa ~R$80. Muitos casos resolvidos remotamente com diagnóstico melhor.

**Direção:** tool `solicitar_teste_velocidade` que envia link fast.com + instrução. Tool `interpretar_resultado_velocidade` que compara com plano contratado e decide: problema do cliente (interferência, posição do roteador) vs problema da rede (abrir chamado).

### 5. NPS com ação em score baixo

**Hoje:** score 1-2 salvo no banco + `console.warn`. Nada mais.

**Direção:** score ≤ 2 → `marcar_churn_risk` automático + enfileirar mensagem de recuperação no dia seguinte. Score 3 → soft follow-up. Score 4-5 → trigger de campanha de indicação.

### 6. Memória semântica cross-session

**Status atual:** parcialmente implementado.
- Já existe `notes` em `conversation_threads` e tool `atualizar_notas_cliente`.
- `customer-memory.ts` já injeta nota prévia no contexto do prompt.

**Próximo passo:** definir heurística de atualização/expiração das notas para evitar acúmulo de contexto obsoleto.

### 7. Cobertura dinâmica via SGP

**Hoje:** `COVERED_NEIGHBORHOODS` hardcoded em `company-data.ts`. Novo bairro = deploy.

**Direção:** endpoint SGP para bairros cobertos (verificar disponibilidade da API), cache de 1h, fallback para array local.

### 8. Quick-reply com contexto para clientes existentes

**Hoje:** `coverage_list` e `coverage_check` respondem sem saber se é cliente ativo.

**Direção:** para clientes existentes, passar `coverage_check` para o LLM — pode ser pergunta sobre mudança de endereço, extensão de rede, etc.

---

## O que NÃO fazer

- **Não use `JSON.stringify` para body das chamadas SGP** — use `URLSearchParams` + `systemParams()`
- **Não mude `DomainEvent.payload`** para `message_received` — `onIncomingMessage` espera `{ phone, body, profileName }`
- **Não remova `connectInstance()` no bootstrap** — Evolution Go perde webhook no restart
- **Não adicione bairros em `COVERED_NEIGHBORHOODS`** sem confirmar com o usuário
- **Não implemente cancelamento automático** — sempre `transferir_humano`
- **Não remova `sanitizeUserInput()`** no início de `processMessage` — única defesa contra prompt injection via WhatsApp
- **Não processe mensagens com `phone` ou `body` undefined** — guard no `index.ts` já bloqueia, não remova
- **Não use asteriscos para negrito no texto de resposta** — WhatsApp Web não renderiza `*palavra*` corretamente
