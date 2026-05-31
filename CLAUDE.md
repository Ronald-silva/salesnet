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
1.   isHumanMode(phone, tenantId)     → abandona silenciosamente se humano ativo
2.5  dedup por messageId              → insert em processed_message_ids; código 23505 = mensagem duplicada, encerra
2.   startMs = Date.now()             → timer para processing_ms
3.   sanitizeUserInput(message)       → trunca 2000 chars, remove 15 padrões injection PT+EN
3.5  handleBringForwardReply(phone)   → captura SIM/NÃO de oferta de antecipação de visita pendente (janela 20min); encerra se consumida
4.   getPendingNps(phone)             → verifica se NPS está pendente para este número
     4a. NPS não enviado → cancela NPS, continua
     4b. NPS enviado + resposta numérica → salva, agradece, encerra
     4c. NPS enviado + resposta não-numérica → descarta NPS, continua
5.   quickReply(clean, phone)         → FAQ sem LLM
     5a. plans_list + cliente existente → retorna null (passa para LLM)
     5b. qualquer outro match → retorna string, salva histórico, envia, encerra
6.   saveMessage(phone, 'user', clean)
7.   getThread(phone, tenantId)      → histórico de conversa do Supabase
8.   [parallel] lookupCustomer(phone/CPF) + getCustomerInsights(phone, tenantId) + getSkillConfig(tenantId)
9.   get_fatura_atual(customerId)     → pré-executado se cliente existe (best-effort, não joga)
10.  verificar_cobertura('*')         → pré-executado se mensagem tem keyword de bairro (e não pede planos)
11.  classifySession(message, customerData, invoiceStatus)
11.5 disambiguateSessionMode(...)     → LLM leve em casos ambíguos; fallback para regex; registra session_classifier no tool log
12.  monta systemWithContext:
      getFortalezaContext()           ← hora local (UTC-3)
      + buildSystemPrompt(skillConfig)
      + "Contexto do cliente atual: telefone, modo, dados JSON (sem senha/login)"
      + buildModeContext(sessionMode, skillConfig)
      + buildIdentificationContext()  ← aviso se identificado via CPF ou não encontrado
      + buildMediaMessageContext()    ← PRIORIDADE se mensagem atual é áudio/imagem
      + coverageContext               ← se relevante
      + buildInsightsContext()        ← avisos baseados no histórico
      + buildQualityExamples()        ← few-shot NPS (promise iniciada após passo 11)
      + lookupKnowledge()             ← base de conhecimento (promise iniciada após passo 11)
13.  (dentro de LLM_ROUTING_MODE=tiered) resolveTieredRouting(clean)
      └── chama classifyMessageComplexity(message) internamente; escolhe provider e caps de tokens/rounds
14.  runLLMFlow(provider, history, systemWithContext, phone, initialToolLog, options)
      └── loop tool-calling até cap do tier
15.  shouldSendNps(phone, tenantId)   ← consultado ANTES do insert (reflete sessão anterior)
      scheduleNps(...)                ← setTimeout de 30min em memória (não persiste no banco)
16.  supabase.interaction_logs.insert({ phone, session_mode, tool_calls, response, processing_ms })
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
| Buscar cliente por CPF | `POST /api/ura/consultacliente/` | `cpf` (11 dígitos, sem formatação) |
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

### Validação de webhook (HMAC) — armadilha em produção

Confirmado em produção (2026-05): a Evolution Go **não envia** `x-webhook-signature` nos POSTs de webhook. A documentação oficial só cita `WEBHOOK_URL` / `webhookUrl` no connect — não HMAC outbound.

`validateWebhook` em `evolution-go.ts`:

- **Com** `x-webhook-signature` → valida HMAC (tenta `EVOLUTION_WEBHOOK_SECRET`, `EVOLUTION_INSTANCE_TOKEN`, `EVOLUTION_API_KEY`, token do Supabase). HMAC inválido → `return false` (rejeita).
- **Sem** assinatura (padrão Evolution):
  - se vier header `apikey` **e** ele **não** casar com nenhum secret configurado → `return false` (rejeita) — correção aplicada e confirmada no código (`evolution-go.ts`, ~linha 478).
  - se vier `apikey` e casar, ou se o token da instância no body casar → aceita.
  - se **não** vier `apikey` nenhum (caso padrão do Evolution Go) → aceita (não há como validar).
- `EVOLUTION_WEBHOOK_SKIP_HMAC=true` → desliga tudo (só emergência).

`EVOLUTION_WEBHOOK_SECRET` no serviço Railway **evolution-go** não é variável oficial da Evolution — só o backend **salesnet** usa para verificar, se um dia a Evolution assinar.

**Sintoma de regressão:** logs `Missing x-webhook-signature — rejected` e zero `event=Message` processado. Boot deve mostrar `validation enabled (HMAC if x-webhook-signature sent; else apikey or open for Evolution Go)`.

`connectInstance` envia `webhookSecret` no body (undocumented); fingerprint no log: `fp=df0bb2ea` para `salesnet-token-2026`. Diagnóstico no boot: `[webhook-hmac]` em `webhook-hmac-diagnostics.ts`.

### JIDs — telefone, LID e canais (não confundir com falha de atendimento)

WhatsApp pode enviar JIDs que **não são chat 1:1**. Tudo em `backend/src/lib/phone.ts` + filtro em `evolution-go.ts` e `webhook-router.ts`.

| Sufixo | O que é | Comportamento |
|--------|---------|---------------|
| `@s.whatsapp.net` | Celular BR | Telefone E.164 normal |
| `@lid` | Contato sem número exposto (privacidade Meta) | Thread `lid:<id>`; envio via `@lid`; telefone real em `SenderAlt`/`senderPn`/`remoteJidAlt` quando disponível |
| `@newsletter` | Canal WhatsApp | **Ignorado** — log `[webhook] ignored non-chat JID` |
| `@broadcast`, `@g.us`, `@status` | Lista, grupo, status | **Ignorado** |

- `resolveWebhookContact()` / `collectWebhookJidCandidates()` — ordem: `Sender`, `SenderAlt`, `Participant`, `key.senderPn`, `key.remoteJid`.
- `isIgnorableWhatsAppJid()` roda **antes** de mídia/LLM; `webhook-router` tem segunda camada se `fromPhone` faltar.
- Eventos `type: 'unknown'` (canal/grupo) retornam 200 e **não** enfileiram no event bus.
- **Sintoma de regressão:** `message_received without valid phone` em JIDs `@newsletter` → deploy antigo (pré-`ec65e08`/`c9a6ff4`).

### Mídia recebida (áudio/imagem) — download e descriptografia

Mídia recebida **não vem em claro** (a menos que `WEBHOOK_FILES=true` no Evolution Go). O `data.Message` traz a sub-mensagem (`audioMessage`, `imageMessage`, `videoMessage`, `documentMessage`) com os campos do protocolo whatsmeow.

**Armadilha de caixa:** os campos são `URL` (maiúsculo!), `mediaKey`, `mimetype`, `directPath`, `fileEncSHA256`. Código antigo lia `url` minúsculo → `undefined` → áudio nunca funcionou. Leia tolerando caixa (`pickField`).

`backend/src/integrations/whatsapp/media-download.ts` baixa o `.enc` da CDN e **descriptografa localmente** (HKDF-SHA256 + AES-256-CBC, descartando o MAC de 10 bytes; info strings `"WhatsApp Audio/Image/Video/Document Keys"`). Funciona pra todos os tipos, sem depender de endpoint.

- `unwrapWhatsAppMessage(msg)` desembrulha `viewOnceMessage`, `viewOnceMessageV2`, `ephemeralMessage`, etc., antes de `detectMediaType`.
- `detectMediaType(msg)` identifica o tipo pela presença da sub-mensagem (mais confiável que `Info.Type`).
- `resolveMessageBody` (método de `EvolutionGoProvider`) baixa, descriptografa e chama `transcribeAudio` (Groq Whisper) ou `analyzeImage` (Gemini). Vídeo/documento → texto orientando o cliente.
- **Fallback só para imagem:** `POST /message/downloadimage` (body = `Message` proto desembrulhada, auth de instância) — único endpoint de download do Evolution Go. Não há rota para áudio (por isso a descriptografia local é obrigatória).
- Sempre confirme a rota real no Swagger da instância: `GET /swagger/doc.json` (header `apikey`).

**Áudio (`transcribe.ts`):** modelo `whisper-large-v3`, upload via `toFile` do groq-sdk, mime normalizado (`audio/ogg; codecs=opus` → `audio/ogg`). Log: `[transcribe] ok`. Corpo injetado: `(voz do cliente): "..."`.

**Imagem (`vision.ts`):** modelo primário **`gemini-2.5-flash`** ( `gemini-2.0-flash` retorna 404 para chaves novas). Fallbacks: `gemini-2.0-flash-lite`, `gemini-1.5-flash`. Descreve qualquer imagem em PT + detecta comprovante. Log: `[vision] ok`. Corpo: `[imagem: descrição...]`.

**Contexto no prompt (`media-context.ts`):** áudio e imagem da mensagem **atual** ganham bloco `PRIORIDADE` — evita Sofia responder à mídia anterior do histórico.

**Boot:** `bootstrap.ts` avisa se faltar `GEMINI_API_KEY` ou `GROQ_API_KEY`. `index.ts` loga `commit=<sha7>` via `RAILWAY_GIT_COMMIT_SHA` — use para confirmar deploy.

**Logs saudáveis em produção:**
```
[media] image resolved (...): [imagem: ...]
[vision] ok (gemini-2.5-flash, ...): ...
[transcribe] ok (...): ...
[media] audio resolved (...): (voz do cliente): "..."
```

---

## Identificação do cliente — telefone e CPF (`customer-lookup.ts`)

Ordem automática em **toda mensagem** (`processor.ts` passo 8):

```
1. getCustomerByPhone(whatsappPhone)     → SGP consultacliente?telefone=
2. Se falhar → getCustomerByCpf(cpf)     → SGP consultacliente?cpf=
3. Se falhar → tryLookupByStoredCpfPhone → outro phone na thread com mesmo CPF
```

**Fontes de CPF:** `extractCpfFromText(message)` (formatado `049.763.013-38` ou `cpf: 04976301338`) + `conversation_threads.cpf` (migration `023`).

**Limitações intencionais:**
- Se telefone **já encontra** cliente, CPF na mesma mensagem **não** re-identifica.
- 11 dígitos soltos **não** são extraídos automaticamente (overlap com telefone BR) — Sofia deve usar `buscar_cliente(cpf=...)` ou `salvar_cpf_cliente`.
- Contato `@lid` sem telefone no payload depende de CPF informado ou salvo na thread.

**Tools:** `buscar_cliente` (campo `cpf`), `salvar_cpf_cliente` (persiste + tenta SGP). Auditoria em `interaction_logs.tool_calls` → `buscar_cliente._lookup.method` (`phone` | `cpf` | `cpf_stored_phone`).

**Arquivos:** `customer-lookup.ts`, `lib/cpf.ts`, `integrations/sgp/customers.ts` (`getCustomerByCpf`).

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

## Módulo de agendamento de visitas

### Capacidade — 1 vaga por turno (`visit-scheduling.ts`)

Regra de negócio: **1 visita por turno** (1 manhã + 1 tarde por dia útil; atende seg–sáb, pula domingo). Evita empilhar atendimentos e dá folga à equipe.

- `isSlotAvailable(date, period)` — turno livre se há `< 1` visita com status `scheduled` naquele `(data, turno)`. `cancelled`/`done` liberam a vaga.
- `nextAvailableSlots(fromDate, n)` — próximos turnos livres (pula domingo), pra Sofia oferecer alternativas concretas.
- Tool `consultar_disponibilidade_visita` — Sofia consulta ANTES de prometer horário.
- `agendar_visita` recusa turno cheio (`reason: periodo_indisponivel`) e devolve `alternativas` — nunca empilha. Também corrige o `phone` gravado (usa o WhatsApp do contato; `getCustomerById` não traz telefone).

### Antecipação manual (`bring-forward-flow.ts`)

Quando a equipe abre folga, o operador clica em "Oferecer antecipação" no painel (`POST /api/admin/schedules/:id/oferecer-antecipacao`):

- `offerBringForward(visitId)` marca `bring_forward_status='offered'` + `offered_at` e envia a oferta ao cliente.
- `handleBringForwardReply(phone, msg)` (topo do `processMessage`, antes do NPS): **SIM** dentro de 20min → antecipa a visita pra hoje (`accepted`) e confirma; **NÃO** → `declined` mantém horário; ambíguo → ignora e segue fluxo normal.
- Estado em colunas de `scheduled_visits` (migration `022`), sobrevive a restart — diferente do NPS (memória).

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

## Módulo de detecção de padrões operacionais (`pattern-detector.ts`)

Cron a cada 30 min (`*/30 * * * *`, registrado em `startAutomations()`). Identifica
anomalias em escala antes que virem reclamação massiva e grava em `operational_alerts`.

### Detectores

| Tipo (`alert_type`) | Janela | Gatilho | Fonte de dados |
|---------------------|--------|---------|----------------|
| `outage_cluster` | 2h | ≥ 3 quedas no mesmo bairro | `outage_reports` (`neighborhood`/`reported_at`) |
| `billing_spike` | 2h | sessões `billing` > 2x média por janela de 2h dos 7 dias anteriores (com mínimo absoluto ≥ 3) | `interaction_logs.session_mode` |
| `churn_wave` | 24h | > 5 chamadas de `marcar_churn_risk` | `interaction_logs.tool_calls` (scan em memória — **não** usar `.contains()` PostgREST em jsonb) |
| `slow_speed_cluster` | 4h | ≥ 3 reclamações de lentidão do mesmo bairro | `interaction_logs` (support) + `conversation_threads.messages` + bairro via SGP |
| `nps_drop` | 24h vs 7d | média de NPS cai > 1 ponto (mín. 3 respostas em 24h) | `nps_responses.score` |

### Comportamentos críticos

- **Dedup:** antes de criar, `existsRecentOpenAlert(tenant, type, area?)` checa alerta `open`
  do mesmo tipo (e bairro, quando aplicável) nas últimas 4h. Em erro de query, assume que
  existe (não duplica).
- **`outage_reports` é single-tenant** — sem `tenant_id`; o detector 1 não filtra por tenant.
- **Notificação:** todo alerta novo dispara `whatsappService.sendText(tenant, ADMIN_ALERT_PHONE, msg)`
  (best-effort). Sem `ADMIN_ALERT_PHONE`, loga warning e segue — o alerta ainda aparece no painel.
- **`slow_speed_cluster` faz lookups no SGP** só para os telefones que casaram a keyword de
  lentidão (controle de custo).
- Todos os detectores rodam em `Promise.allSettled` — falha de um não derruba os demais.
- **`churn_wave`:** query antiga com `.contains('tool_calls', [{name}])` falhava silenciosamente (`churn query failed:`). Corrigido em `1090dec` — busca `tool_calls` das últimas 24h e filtra `.some(t => t.name === 'marcar_churn_risk')`.
- **Migration `026`:** se `CREATE TABLE operational_alerts` falhar com `already exists`, a tabela já está ok — rode só índices/RLS idempotentes.

### Painel

- `GET /api/admin/alerts?status=open|acknowledged|resolved|all` → `{ data, openCount }`.
- `PATCH /api/admin/alerts/:id` → `{ status }` (`acknowledged`/`resolved`/`open`); `resolved` grava `resolved_at`.
- `src/pages/admin/Alerts.tsx` (rota `/admin/alertas`): cards por alerta, auto-refresh 5 min,
  botões Reconhecer/Resolver, empty state "Nenhuma anomalia detectada".
- `AdminLayout` mostra badge vermelho com `openCount` no item "Alertas".

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
| `interaction_logs` | `processor.ts` (inclui `processing_ms`) | `reports.ts`, `customer-memory.ts`, `nps-flow.ts`, `pattern-detector.ts` |
| `nps_responses` | `nps-flow.ts` | `reports.ts` |
| `whatsapp_instances` | `instance-manager.ts` | `webhook-router.ts`, `bootstrap.ts` |
| `leads` | `tools.ts` (registrar_interesse) | painel admin |
| `scheduled_visits` | `tools.ts` (agendar_visita), `schedules.ts`, `bring-forward-flow.ts` | `visit-scheduling.ts`, `schedules.ts` (painel), automations |
| `outage_reports` | `tools.ts` (abrir_chamado técnico) | `tools.ts` (detectar_apagao_bairro) |
| `sofia_tickets` | `tools.ts` (abrir_chamado) | `tools.ts` (listar_chamados_sofia) |
| `billing_notifications` | automações, `registrar_negociacao` | `getHabitualLatePayerIds`, automações |
| `scheduled_messages` | `nps-flow.ts` | `scheduled-messages.ts` (cron 10 min) |
| `operational_alerts` | `pattern-detector.ts` | `routes/alerts.ts` (painel), `AdminLayout` (badge) |

**Schema base (tabelas):** não há um único `schema.sql` em `migrations/`. As tabelas
base ficam distribuídas em arquivos `schema.sql` por domínio — rode todos uma vez no
Supabase SQL Editor antes das migrations:
- `backend/src/agent/schema.sql` — `conversation_threads`, `interaction_logs`, etc.
- `backend/src/routes/schema.sql` — `otp_codes`, `client_sessions`, `tenants`, etc.
- `backend/src/automations/schema.sql` — `billing_notifications`, etc.
- `backend/src/automations/campaigns/schema.sql` — `campaign_sends`, `referral_links`, `churn_risks`

Migrations em `backend/src/db/migrations/` (executar em ordem):
- `002_enable_rls.sql` — RLS service_role-only em todas as tabelas (inclui `scheduled_visits`)
- `003_add_session_mode_to_interaction_logs.sql`
- `011_nps.sql` — tabela `nps_responses`
- `012_add_processing_ms.sql` — coluna `processing_ms INTEGER` em `interaction_logs`
- `013_scheduled_messages.sql` — tabela `scheduled_messages` (mensagens adiadas pós-NPS)
- `014_client_notes.sql` — coluna `notes TEXT` em `conversation_threads`
- `015_sofia_tickets.sql` — tabela `sofia_tickets` (chamados abertos via Sofia)
- `016_rls_new_tables.sql` — RLS em `nps_responses`, `scheduled_messages`, `sofia_tickets`
- `017_message_dedup.sql` — tabela `processed_message_ids` (dedupe de webhooks)
- `018_llm_usage_columns.sql` — colunas de custo/uso de LLM em `interaction_logs`
- `019_tenant_skill_settings.sql` — coluna `tenants.settings` (override de skill por tenant)
- `020_tenant_scoped_conversations.sql` — `conversation_threads`/`interaction_logs` escopados por `(tenant_id, phone)`
- `021_schedules_improvements.sql` — `scheduled_visits`: colunas `type`, `address`, `notes`, `updated_at`, `cancelled_at`, `done_at` + índices
- `022_visit_bring_forward.sql` — `scheduled_visits`: colunas `bring_forward_status`, `bring_forward_offered_at` (antecipação)
- `023_cpf_index.sql` — `conversation_threads.cpf` + índice parcial (fallback quando telefone mudou; identificação primária via SGP `consultacliente` com `cpf`)
- `024_quality_feedback.sql` — tabela `conversation_quality` (feedback loop NPS↔conversa)
- `025_knowledge_base.sql` — tabela `knowledge_base` (soluções reutilizáveis, GIN em `problem_keywords`)
- `026_pattern_detection.sql` — tabela `operational_alerts` (detecção de padrões operacionais; RLS service_role-only). **Em produção** (9 colunas confirmadas).
- `027_rls_service_role_policies.sql` — políticas `service_role_only` + GRANT em tabelas das migrations 016/024/025/026
- `009_performance_indexes.sql` — índices para o Supabase SQL Editor (sem CONCURRENTLY; arquivo inteiro de uma vez). **Foi este o executado em produção** (via SQL Editor).
- `009_performance_indexes_concurrent.sql` — mesmos índices com CONCURRENTLY (alternativa só via psql, uma statement por vez; **não** usar no SQL Editor — erro 25001)

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

### Detecção de padrões (`pattern-detector.ts`)

- **A cada 30 min:** roda os 5 detectores (`outage_cluster`, `billing_spike`, `churn_wave`,
  `slow_speed_cluster`, `nps_drop`) e grava `operational_alerts`; notifica `ADMIN_ALERT_PHONE`.
- Ver seção "Módulo de detecção de padrões operacionais" para gatilhos e dedup.

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

SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...             # role service_role — NÃO usar chave anon (permission denied)

EVOLUTION_API_KEY=<chave_global_admin>
EVOLUTION_INSTANCE_TOKEN=<token_instancia>
GEMINI_API_KEY=AIza...   # Google AI Studio — vision.ts (gemini-2.5-flash). Sem ela: [imagem enviada]
GROQ_API_KEY=gsk_...     # console.groq.com — transcribe.ts (whisper-large-v3). Sem ela: áudio não transcrito

BACKEND_URL=https://salesnet-production.up.railway.app

ADMIN_ALERT_PHONE=5585996032957 # WhatsApp (dígitos) que recebe alertas operacionais (pattern-detector). Sem ela, alertas vão pro painel mas não pro WhatsApp
```

`config/supabase.ts` valida no boot que `SUPABASE_SERVICE_ROLE_KEY` decodifica como `service_role`; loga erro se for chave anon.

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
2. `backend/src/agent/customer-lookup.ts` — identificação telefone → CPF
3. `backend/src/agent/tools.ts` — ferramentas (inclui `consultar_disponibilidade_visita`, `salvar_cpf_cliente`) + stubs documentados
4. `backend/src/agent/skill/` — prompt dinâmico e config por tenant (substitui prompt estático)
5. `backend/src/agent/nps-flow.ts` — fluxo NPS completo
6. `backend/src/agent/customer-memory.ts` — insights cross-session
7. `backend/src/agent/quick-reply.ts` — FAQ sem LLM
8. `backend/src/lib/phone.ts` — JID/LID/newsletter, normalização BR
9. `backend/src/integrations/sgp/client.ts` — comunicação com SGP
10. `backend/src/integrations/whatsapp/providers/evolution-go.ts` — parser de webhooks + resolução de mídia
11. `backend/src/integrations/whatsapp/media-download.ts` — download + descriptografia + unwrap
12. `backend/src/agent/vision.ts`, `transcribe.ts`, `media-context.ts` — imagem, áudio, prioridade no prompt
13. `backend/src/automations/pattern-detector.ts` — alertas operacionais (cron 30 min)
14. `backend/src/agent/visit-scheduling.ts` + `bring-forward-flow.ts` — capacidade e antecipação de visitas
15. `backend/src/agent/prompt.ts` — camada de compat (delega à skill)

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

### 5) Suporte a áudio e imagem ✅ produção (2026-05)

- Download + descriptografia local (HKDF + AES-256-CBC); `unwrapWhatsAppMessage` para view-once/ephemeral.
- Áudio: Groq `whisper-large-v3`, formato `(voz do cliente): "..."`, prioridade no prompt.
- Imagem: Gemini **`gemini-2.5-flash`** com fallbacks; descreve qualquer foto em PT (não só comprovante).
- Requer `GROQ_API_KEY` e `GEMINI_API_KEY` no Railway (serviço `salesnet`, não Evolution/Vercel).
- Logs confirmados: `[vision] ok`, `[transcribe] ok`, `[media] image/audio resolved`.

### 6) Agendamento com capacidade e antecipação (implementado)

- `visit-scheduling.ts`: 1 vaga por turno; tool `consultar_disponibilidade_visita`; `agendar_visita` recusa turno cheio e oferece alternativas.
- `bring-forward-flow.ts` + migration `022`: oferta manual de antecipação pelo painel, captura SIM/NÃO em 20min no topo do `processMessage`.
- Painel `src/pages/admin/Schedules.tsx`: ação "Oferecer antecipação" + badges de status.

### 7) Atendimento AI-first (prompt reforçado)

- Prompt da skill reduz escaladas: Sofia resolve sozinha; só `transferir_humano` em pedido explícito do cliente, cancelamento ou ameaça jurídica.
- `safeExecuteTool` em `processor.ts`: erro de ferramenta não derruba o fluxo do LLM.
- `getCustomerByPhone` tenta variação do 9º dígito (BR) ao buscar cliente.

### 8) Detecção de padrões operacionais (implementado)

- `pattern-detector.ts` (cron 30 min) detecta `outage_cluster`, `billing_spike`, `churn_wave`,
  `slow_speed_cluster` e `nps_drop`; grava em `operational_alerts` (migration `026`).
- Dedup por tipo (+bairro) em 4h; notificação WhatsApp ao `ADMIN_ALERT_PHONE`.
- Painel `src/pages/admin/Alerts.tsx` (`/admin/alertas`) + rotas `GET/PATCH /api/admin/alerts`
  + badge de contagem de abertos no `AdminLayout`.
- Fix `churn_wave` (`1090dec`): contagem em memória — PostgREST `.contains()` em `tool_calls` falhava.

### 9) Identificação por CPF (implementado)

- `lookupCustomer`: telefone → CPF (mensagem/thread) → phone armazenado por CPF.
- Tools `buscar_cliente(cpf)` e `salvar_cpf_cliente`; migration `023` (`conversation_threads.cpf`).
- SGP `consultacliente` aceita parâmetro `cpf` (11 dígitos).

### 10) JIDs LID e filtro de canais (implementado)

- Suporte `@lid` + resolução de telefone via `SenderAlt`/`senderPn`.
- Ignora `@newsletter`, `@broadcast`, `@g.us`, `@status` antes do processamento.
- Boot log `commit=<sha>` para verificar deploy no Railway.

### 11) Supabase service_role (implementado)

- Validação de JWT no boot (`config/supabase.ts`).
- Migration `027` — políticas RLS faltantes em tabelas novas.

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

### 3. Suporte a áudio e imagem ✅ implementado em produção

**Status atual:** confirmado em logs Railway — `gemini-2.5-flash` + `whisper-large-v3`.

**Próximo passo:** suporte a documento PDF (parse de boleto) — hoje vídeo/documento só geram texto orientando o cliente a reenviar como foto/texto.

### 3b. Identificação por CPF ✅ implementado (validar cenário real)

**Status atual:** cascata telefone → CPF no código; migration `023` em produção.

**Próximo passo:** teste com WhatsApp não cadastrado + CPF válido no SGP; melhorar extração quando Sofia pediu CPF e cliente responde só 11 dígitos.

### 4. Script de diagnóstico de velocidade

**Hoje:** Sofia orienta reiniciar roteador e abre chamado se não resolver.

**Impacto:** visita técnica custa ~R$80. Muitos casos resolvidos remotamente com diagnóstico melhor.

**Direção:** tool `solicitar_teste_velocidade` que envia link fast.com + instrução. Tool `interpretar_resultado_velocidade` que compara com plano contratado e decide: problema do cliente (interferência, posição do roteador) vs problema da rede (abrir chamado).

### 5. NPS com ação em score baixo ✅ implementado

**Status atual:** `applyNpsScoreActions` em `nps-flow.ts` (chamado por `saveNpsResponse`, best-effort):
- **Score ≤ 2:** `markChurnRiskByPhone(phone, tenantId)` + enfileira mensagem de recuperação (`RECOVERY_MESSAGE`) em `scheduled_messages` com `send_after = +24h`.
- **Score 3:** soft — nenhuma ação automática (sem ruído).
- **Score 4-5:** enfileira convite de indicação (`REFERRAL_NPS_MESSAGE`) com `send_after = +48h`, exceto se já houve campanha `referral` para o cliente (`hasReferralCampaign`).

O `console.warn` em `processor.ts` permanece apenas como observabilidade (log de score baixo); a ação real vem de `applyNpsScoreActions`. As mensagens adiadas são enviadas pelo cron `scheduled-messages.ts`.

**Próximo passo:** ajustar tom/cadência das mensagens de recuperação com base na taxa de resposta observada.

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
- **Não exija `x-webhook-signature` quando o header não veio** — Evolution Go não assina outbound; ver seção “Validação de webhook (HMAC)”
- **Não adicione bairros em `COVERED_NEIGHBORHOODS`** sem confirmar com o usuário
- **Não implemente cancelamento automático** — sempre `transferir_humano`
- **Não remova `sanitizeUserInput()`** no início de `processMessage` — única defesa contra prompt injection via WhatsApp
- **Não processe mensagens com `phone` ou `body` undefined** — guard no `index.ts` já bloqueia, não remova
- **Não use asteriscos para negrito no texto de resposta** — WhatsApp Web não renderiza `*palavra*` corretamente
- **Não leia campos de mídia em minúsculo** — whatsmeow usa `URL`/`mediaKey` (maiúsculo); use `pickField` em `media-download.ts`
- **Não empilhe visitas no mesmo turno** — `agendar_visita` deve checar `isSlotAvailable` (1 por turno); ofereça alternativas
- **Não transfira para humano por padrão** — Sofia é AI-first; só `transferir_humano` em pedido explícito, cancelamento ou ameaça jurídica
- **Não use `.contains()` PostgREST em `interaction_logs.tool_calls`** — falha silenciosa no detector de churn; filtrar em memória ou usar SQL/RPC
- **Não trate logs `@newsletter` como falha de atendimento** — são canais WhatsApp; devem ser ignorados silenciosamente
- **Não use chave anon do Supabase como `SUPABASE_SERVICE_ROLE_KEY`** — causa `permission denied for table whatsapp_instances`
- **Não use `gemini-2.0-flash` para visão** — 404 em chaves novas; usar `gemini-2.5-flash`
