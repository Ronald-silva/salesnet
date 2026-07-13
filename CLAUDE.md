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

## Política de testes ao vivo contra produção

Confirmado em produção (2026-07-07): mensagens de teste chegaram a `processMessage` com `messageId` sintético (prefixo `diag-`/`diag-test-` + timestamp, ex.: `diag-1783451405380`) usando o número de telefone real do Ronald (`+558591993833`) como destino — a resposta da Sofia foi enviada de verdade pro WhatsApp real dele, misturada com conversas genuínas. Ver seção "Falha de entrega silenciosa em `sendText`" para o incidente completo.

Regras obrigatórias para qualquer teste ao vivo (webhook simulado, chamada direta a `processMessage`, script contra produção, etc.):

1. **Nunca usar o número pessoal do Ronald nem número de cliente real como destino.** Todo teste ao vivo usa o número sandbox dedicado em `TEST_SANDBOX_PHONE` — nunca improvisar com um número de conversa real só porque "está à mão".
2. **Todo teste deve incluir um marcador diagnóstico no próprio texto da mensagem e/ou no `messageId`** (o padrão `diag-<timestamp>` já usado é aceitável) — é o que permite auditar depois, via `processed_message_ids`, se uma linha em produção foi tráfego real ou teste. Um `messageId` sintético não vindo do WhatsApp real (formato hex tipo `3EB07FD03B377CC5345111`) é imediatamente identificável como teste se seguir essa convenção.
3. Um `messageId` marcado como teste **não é suficiente sozinho** — o ponto 1 (número sandbox) é o que evita a resposta vazar pra uma conversa real; o marcador (ponto 2) é só para auditoria posterior, não uma proteção em si.
4. **`assertSandboxNumber(phone)`** (`backend/src/utils/test-sandbox.ts`, adicionado 2026-07-07) é a trava de código para o ponto 1: lança se `TEST_SANDBOX_PHONE` não estiver configurado no ambiente ou se `phone` não bater com ele (comparação via `normalizePhone`, tolera formatos com/sem `+`/DDI). Todo script novo em `backend/scripts/` que chame `processMessage` diretamente ou envie mensagem real contra produção **deve** chamar essa função antes de agir — não reimplemente a checagem ad hoc. Não é enforced automaticamente em nenhum caminho de produção (o webhook real do WhatsApp nunca passa por essa função) — é só para scripts/diagnóstico deliberados.

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
| Buscar cliente por CPF | `POST /api/ura/consultacliente/` | `cpfcnpj` (11 dígitos, sem formatação) — **não** `cpf`; o SGP ignora `cpf` silenciosamente e responde `{ msg: "CPF/CNPJ ou Contrato ID Não informados" }` sem erro HTTP (confirmado ao vivo em produção, 2026-07-05) |
| Buscar cliente por contrato | `POST /api/ura/consultacliente/` | `contrato` |
| Listar faturas | `POST /api/central/titulos/` | `contrato`, `status` (1=aberto), `limit` |
| Gerar PIX | `POST /api/central/pagamento/pix/{invoiceId}` | `contrato` no body — **⚠️ retorna 403 "credenciais de autenticação não foram fornecidas" com o `app`+`token` de sistema, testado ao vivo em produção 2026-07-08 (body, query string, `Authorization: Token`, `Authorization: Bearer`, header `apikey`, GET — todas falharam igual; `Allow: POST, OPTIONS` confirma que a rota existe, não é 404). Causa não confirmada — talvez exija sessão de login do cliente (Central do Assinante), não token de sistema. `generatePixKey()` em `integrations/sgp/billing.ts` só funciona hoje pelo caminho de cache (`codigopix` já presente na fatura via `/api/central/titulos/`, que funciona normalmente); a chamada direta a este endpoint está inacessível com as credenciais atuais.** |
| Abrir chamado | `POST /api/central/chamado/` | `contrato` |
| Listar chamados Sofia | Supabase `sofia_tickets` | `contrato`, `tenant_id`, `status` |

### Normalização de telefone

`getCustomerByPhone('+5585991993833')` → passa `'85991993833'` para a API (strip do `55`). Lógica em `customers.ts`. Não duplique.

### Formato real de `telefones`/`emails` e `SgpSchemaMismatchError`

O SGP retorna `telefones`/`emails` como **array de objetos** (`{ tipoContato, contato, inscricoes }`), não array de strings — `ContratoSchema` em `integrations/sgp/types.ts` exige esse shape. Um contrato malformado individualmente é descartado silenciosamente (`.catch([])`) mas **loga** via `logSchemaFallback` quando isso acontece — nunca remova esse log, é a única forma de perceber uma degradação silenciosa em produção.

Se **todos** os contratos retornados falharem o parse (schema desatualizado, mudança de shape do SGP), `consultacliente()` lança `SgpSchemaMismatchError` em vez de deixar a chamada parecer "cliente não encontrado". `customer-lookup.ts` loga qualquer erro que não seja o "não encontrado" esperado (`logIfUnexpected`) — isso cobre `SgpSchemaMismatchError` e qualquer outra falha real (timeout, erro de rede).

**Lição de teste:** `customer-lookup.test.ts` e outras ~10 suítes mockam o módulo `sgp` inteiro (`jest.mock('../../integrations/sgp', ...)`) — isso nunca teria pego uma regressão de schema, porque `ContratoSchema.parse()` nunca roda de verdade nesses testes. `src/__tests__/integrations/sgp/customers.test.ts` é o único teste de contrato que roda o parse real contra um payload no formato de produção (`fixtures/consultacliente-response.json`) — ao adicionar um novo campo ou endpoint no SGP, prefira estender esse teste de contrato em vez de (ou além de) mockar `sgp` por inteiro.

### Stubs intencionais — esses endpoints não existem no SGP

```typescript
getOverdueCustomers()     // retorna [] — sem endpoint bulk. CONSEQUÊNCIA (confirmada 2026-07-08): runBillingCadenceD5/D2 (billing-cadence.ts) e runBillingJobD3/D0/OverdueD3/SuspendD5 (billing-reminders.ts) iteram sobre o resultado dessas duas funções — hoje são loops vazios, nenhuma dessas 6 automações envia mensagem pra ninguém em produção, mesmo estando registradas em startAutomations(). Não assuma que essas mensagens de cobrança estão saindo sem verificar de novo.
getCustomersDueInDays()   // retorna [] — sem endpoint bulk (ver consequência acima)
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
  - se **não** vier HMAC, `apikey` nem `instanceToken` válido no body → rejeita. O payload real confirmado em produção inclui `instanceToken` no topo; sem ele, é spoofing ou configuração quebrada.
- `EVOLUTION_WEBHOOK_SKIP_HMAC=true` → desliga tudo (só emergência).

`EVOLUTION_WEBHOOK_SECRET` no serviço Railway **evolution-go** não é variável oficial da Evolution — só o backend **salesnet** usa para verificar, se um dia a Evolution assinar.

**Sintoma de regressão:** logs `missing HMAC signature, apikey header, or instanceToken` e zero `event=Message` processado. Boot deve mostrar validação habilitada por HMAC, `apikey` ou `instanceToken`.

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

Ordem automática em **toda mensagem** (`processor.ts` passo 8; precedência alterada em 2026-07-13):

```
1. CPF explícito na mensagem → getCustomerByCpf(cpf)  → SGP consultacliente?cpfcnpj=
2. Se falhar → getCustomerByPhone(whatsappPhone)      → SGP consultacliente?telefone=
3. Se falhar → CPF do thread → getCustomerByCpf(cpf)
4. Se falhar → tryLookupByStoredCpfPhone              → outro phone na thread com mesmo CPF
```

**CPF explícito vence o telefone (fix 2026-07-13, caso Fernando/HOME):** um número cadastrado como contato de outro contrato no SGP (ex.: o telefone do dono está em 9 contratos de clientes) ficava permanentemente identificado como aquele cliente e o fluxo de acesso financeiro por CPF nunca ativava. Agora o CPF da mensagem re-identifica mesmo quando o telefone já bate com um contrato; se o telefone não for vinculado ao CPF (`isPhoneRegisteredToCpf`), aplica-se o nível `cpf_only` com acesso financeiro temporário de 30min (`grantTemporaryFinancialAccess`). Na mesma mudança, `requireFinancialCustomerId` (tools financeiras: `get_fatura_atual`/`listar_faturas`/`gerar_pix`/`confirmar_pagamento`) passou a preferir o grant temporário sobre o contrato resolvido da sessão — senão o PIX sairia do contrato amarrado ao número, não do CPF recém-informado. Limitação aceita: cliente identificado que consulta CPF de terceiro e pede "minha fatura" dentro dos 30min recebe a fatura do CPF consultado (a Sofia nomeia o titular na resposta, mitigando).

**Fontes de CPF:** `extractCpfFromText(message)` (formatado `049.763.013-38` ou `cpf: 04976301338`) + `conversation_threads.cpf` (migration `023`).

**Limitações intencionais:**
- 11 dígitos soltos **não** são extraídos automaticamente (overlap com telefone BR) — Sofia deve usar `buscar_cliente(cpf=...)` ou `salvar_cpf_cliente`.
- Contato `@lid` sem telefone no payload depende de CPF informado ou salvo na thread.

**Tools:** `buscar_cliente` (campo `cpf`), `salvar_cpf_cliente` (persiste + tenta SGP). Auditoria em `interaction_logs.tool_calls` → `buscar_cliente._lookup.method` (`phone` | `cpf` | `cpf_stored_phone`).

**`buscar_cliente(phone=...)` cross-phone — verificação obrigatória (fix IDOR):** quando o `phone` passado pra tool é diferente do telefone da sessão WhatsApp atual, `tools.ts` NUNCA retorna o `Customer` direto. Antes disso existia zero verificação — qualquer número podia consultar dados (incluindo `contratoCentralLogin`/`contratoCentralSenha`) de qualquer outro telefone cadastrado só citando o número; confirmado em produção via `interaction_logs` (um não-cliente puxou saldo em aberto + credencial de outro cliente real). Comportamento atual:
- Sem `cpf` informado na mesma chamada → bloqueia sem consultar o SGP, retorna mensagem orientando a Sofia a pedir o CPF do titular da linha.
- Com `cpf` informado → valida checksum (`isValidCpf`), busca o cliente pelo `phone` alternativo e só retorna o `Customer` se o CPF fornecido bater com `customer.document`. CPF errado e "telefone não encontrado" retornam **a mesma mensagem genérica** (`Cliente não encontrado`) — nunca revelar se o telefone existe.
- Toda tentativa cross-phone (bloqueada ou verificada) sai com `cross_phone_attempt: true` no retorno, que cai naturalmente em `interaction_logs.tool_calls` — dá auditoria sem precisar de investigação forense.
- Não persiste mais `customer.document` do telefone alternativo na thread da sessão atual (bug secundário do design antigo: associava o CPF de um terceiro à thread de quem está de fato conversando, contaminando identificação futura).

**`isPhoneRegisteredToCpf` — padrão obrigatório para qualquer tool que aceite identificador de terceiro:** `agent/identity-verification.ts` exporta `isPhoneRegisteredToCpf(phone, cpf): Promise<boolean>`, única fonte de verdade para "este telefone tem vínculo real com este CPF no SGP" (via `sgp.getContratoPhonesByCpf`, que retorna todos os telefones de todos os contratos daquele CPF — não só o telefone resolvido de `getCustomerByCpf`). Toda tool nova que recebe um identificador (phone/cpf/contrato/customer_id) potencialmente de terceiro **deve** usar essa função em vez de reimplementar a checagem. Falha do SGP (timeout, schema mismatch) retorna `false` — falso negativo é o modo de falha seguro; nunca trate erro como vínculo confirmado.

Aplicado hoje em (auditoria 2026-07-05, mesmo padrão do fix de `buscar_cliente` acima):
- `salvar_cpf_cliente`: localiza o cliente pelo CPF mesmo quando o WhatsApp atual não está cadastrado, sem tratar a divergência como erro. O CPF só é persistido na thread se `isPhoneRegisteredToCpf(phone, cpf)` for `true`; caso contrário o atendimento comum continua com nível `cpf_only`, mas operações protegidas permanecem bloqueadas. Isso preserva a correção do IDOR confirmado em produção sem exigir acesso a outro telefone. Para operações protegidas, a Sofia informa a Central oficial `https://salesnet.sgp.tsmx.com.br/central` ou o atendimento `(85) 98851-2753`.
- `listar_chamados_sofia` e `abrir_chamado`: nunca usam `input.contrato`/`input.customer_id` da chamada da tool. Resolvem o contrato via `resolveSessionCustomerId(phone, tenantId)` (mesma cascata telefone→CPF do `lookupCustomer`) e ignoram silenciosamente qualquer valor divergente vindo da tool call, logando a tentativa (`cross-contrato attempt`) sem enumerar se o contrato "de terceiro" existe.
- `agendar_visita`: mesma regra para `customer_id`. Como consequência, o fallback de `contactPhone` (usa `phone` da sessão quando o contrato-alvo não tem telefone no SGP) passou a ser sempre seguro — `customer_id` nunca mais diverge do contrato da própria sessão, então não há mais cenário de "endereço de um contrato, retorno de contato para outro".

**Arquivos:** `customer-lookup.ts`, `lib/cpf.ts`, `integrations/sgp/customers.ts` (`getCustomerByCpf`, `getContratoPhonesByCpf`), `identity-verification.ts`.

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
- `026_pattern_detection_idempotent.sql` — variante idempotente de `026`: rodar **só** se `026` falhou com `already exists` (cria a tabela apenas se faltar e aplica RLS de qualquer forma).
- `027_rls_service_role_policies.sql` — políticas `service_role_only` + GRANT em tabelas das migrations 016/024/025/026
- `028_grants_service_role_core.sql` — GRANT explícito de `service_role` nas tabelas centrais (`conversation_threads`, `interaction_logs`, `scheduled_visits`, etc.) — ver seção "Grants Supabase".
- `029_verify_grants_diagnostic.sql` — apenas diagnóstico (SELECT), roda após `028` para confirmar grants/existência de tabela; não altera schema.
- `030_grant_schema_usage_service_role.sql` — `GRANT USAGE ON SCHEMA public` + `GRANT ALL` em todas as tabelas/sequences para `service_role` — ver seção "Grants Supabase".
- `009_performance_indexes.sql` — índices para o Supabase SQL Editor (sem CONCURRENTLY; arquivo inteiro de uma vez). **Foi este o executado em produção** (via SQL Editor).
- `009_performance_indexes_concurrent.sql` — mesmos índices com CONCURRENTLY (alternativa só via psql, uma statement por vez; **não** usar no SQL Editor — erro 25001)
- `032_conversation_status.sql` — `conversation_threads`: colunas `status` (active/waiting/closed), `closed_at`, `starred` + índices. Executar antes de usar filtros de status no painel admin.
- `033_copilot_metrics.sql` — `interaction_logs`: colunas `copilot_used` e `copilot_edited` para rastreio de uso do copiloto. Executar antes de usar o endpoint `/conversations/:id/suggest`.
- `034_visit_reminder_followup_columns.sql` — `scheduled_visits`: colunas `reminder_sent` e `followup_sent` (usadas pelo cron `visit-followup.ts`). **Obrigatória** — sem ela o cron falha silenciosamente em produção.
- `035_otp_attempts.sql` — coluna `attempts INTEGER` em `otp_codes` (lockout de força bruta no portal do cliente — ver seção "Portal do Cliente").
- `036_webhook_replay_protection.sql` — tabela `processed_webhook_ids` (fingerprint SHA-256 do raw body; RLS service_role-only) — dedupe de replay em webhooks externos (hoje só `payment-webhook.ts`/SGP).

---

## Política de retenção de dados

Purge automático via `data-cleanup.ts` (cron 06:00 UTC = 03:00 Fortaleza):

| Tabela | Retenção | Purge automático |
|--------|----------|------------------|
| `processed_message_ids` | 24 horas | Sim |
| `processed_webhook_ids` | 24 horas | Sim |
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

### Allowlist de envio de cobrança (`billing-allowlist.ts`)

`getOverdueCustomers()`/`getCustomersDueInDays()` (`integrations/sgp/billing.ts`) continuam stub (sem endpoint bulk no SGP — ver seção "Stubs intencionais"). `resolveDueSoonCustomers`/`resolveOverdueCustomers` em `billing-allowlist.ts` resolvem o status de cobrança diretamente por CPF (`getBillingStatusForAllowlist`, um lookup sequencial por CPF, nunca em paralelo) para os CPFs listados em `BILLING_ALLOWLIST_CPFS` (env var, string separada por vírgula, normalizada no boot) — é assim que as 6 automações (D-5/D-2/D0/D+3/D+5) enviam mensagem de verdade sem depender do endpoint bulk que não existe.

- `isCpfSendAllowed(document)` é checado imediatamente antes de todo envio real em `billing-cadence.ts`/`billing-reminders.ts`; fora da allowlist → `logSkippedOutsideAllowlist` (console.warn, telefone mascarado), nunca envia, nunca grava em `billing_notifications`.
- `BILLING_ALLOWLIST_CPFS` ausente ou vazia → allowlist inativa (mesmo efeito de antes de existir: `resolveDueSoonCustomers`/`resolveOverdueCustomers` caem no fallback stub, que retorna `[]`) — não trava o boot, só loga `[billing:allowlist]` avisando. **Precisa ser configurada na env var do serviço no Railway** (nunca commitada) antes de qualquer deploy que dependa dessas automações enviando algo de verdade — ver "Variáveis de ambiente críticas".
- **Não remova o gate `isCpfSendAllowed` nem esvazie `BILLING_ALLOWLIST_CPFS` sem pedido explícito do Ronald** — rollout pra base completa é decisão dele, pendente; ver memória do projeto `project_billing_allowlist_restriction`.

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

BILLING_ALLOWLIST_CPFS=<cpf1,cpf2,cpf3,cpf4>  # ⚠️ OBRIGATÓRIA para as automações de cobrança enviarem mensagem de verdade — ver "Allowlist de envio de cobrança" abaixo. **Precisa ser configurada direto na env var do serviço no Railway (nunca no git)** antes de considerar esse deploy funcional; sem ela (ausente ou vazia), o boot não trava, mas a allowlist fica inativa e `resolveDueSoonCustomers`/`resolveOverdueCustomers` continuam devolvendo `[]` (mesmo efeito de no-op de antes) — confirme no log de boot `[billing:allowlist]` que carregou com o número esperado de CPFs.
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
- SGP `consultacliente` aceita o parâmetro **`cpfcnpj`** (11 dígitos) — não `cpf` (ver "Formato real de `telefones`/`emails` e `SgpSchemaMismatchError`" acima).
- CPF é validado por checksum (`isValidCpf`, módulo 11) em **todo** ponto de entrada antes de qualquer chamada ao SGP — `processor.ts` (extração da mensagem) e `tools.ts` (`buscar_cliente`, `salvar_cpf_cliente`). Um CPF que só bate no comprimento (11 dígitos) mas falha o checksum nunca deve chegar ao SGP: existe um contrato real cadastrado com `cpfCnpj = "00000000000"` (dado sujo do SGP), então um CPF inválido sem essa validação pode casualmente identificar o cliente errado.

### 10) JIDs LID e filtro de canais (implementado)

- Suporte `@lid` + resolução de telefone via `SenderAlt`/`senderPn`.
- Ignora `@newsletter`, `@broadcast`, `@g.us`, `@status` antes do processamento.
- Boot log `commit=<sha>` para verificar deploy no Railway.

### 11) Supabase service_role (implementado)

- Validação de JWT no boot (`config/supabase.ts`).
- Migration `027` — políticas RLS faltantes em tabelas novas.

### 12) Busca de clientes admin — roteamento CPF/telefone corrigido (`37dfb61`)

- `GET /api/admin/customers/search` agora detecta CPF pelo **formato original** da query (`xxx.xxx.xxx-xx`) via regex no campo `q` — não pelo comprimento de dígitos.
- Para 11 dígitos sem formatação: tenta `getCustomerByPhone` primeiro (celular BR tem 11 dígitos), depois `getCustomerByCpf` como fallback se não encontrar.
- CPF começando com `55` não é mais confundido com telefone com prefixo de país.
- Resposta inclui `invoice` (fatura atual) embutida no objeto — campos sensíveis `contratoCentralLogin`/`contratoCentralSenha` removidos via `safeCustomer()`.

### 13) Supabase `global.fetch` interceptor — fix de `permission denied` (`cf3b2c7`, `02a55cc`)

**Problema:** supabase-js v2 pode sobrescrever o header `Authorization` via eventos de auth (`SIGNED_IN`/`TOKEN_REFRESHED` chamando `rest.setAuth()`), fazendo o PostgREST executar queries como `authenticated` em vez de `service_role`.

**Fix:** `makeServiceRoleFetch(key)` em `config/supabase.ts` intercepta toda requisição HTTP do supabase-js e garante `Authorization: Bearer <service_role_key>` — **mas somente em `/rest/v1/`** (PostgREST/banco).

**Armadilha crítica:** o interceptor **não deve** atuar em `/auth/v1/`. `supabase.auth.getUser(token)` envia o token do usuário no `Authorization`; sobrescrever com service_role quebra a validação e causa logout imediato após login. A verificação `url.includes('/rest/v1/')` é essencial.

**Auth admin:** usa Supabase Auth nativo — `supabase.auth.signInWithPassword` (login) e `supabase.auth.getUser(token)` (middleware). Não usa tabela `client_sessions`.

### 14) Grants Supabase — problema recorrente e solução definitiva

Os GRANTs do `service_role` podem ser revogados pela manutenção do Supabase (shared pooler, pause/restore). Sintoma: `permission denied for table X ... TO authenticated` nos logs do Railway.

**Não é problema de chave** — o JWT boot-check valida só a estrutura, não a assinatura.

**Fix (rodar no Supabase SQL Editor):**
```sql
-- migrations 028 + 030
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'conversation_threads','interaction_logs','whatsapp_instances',
    'leads','scheduled_visits','outage_reports','billing_notifications',
    'otp_codes','client_sessions','tenants','nps_responses',
    'scheduled_messages','sofia_tickets','conversation_quality',
    'knowledge_base','operational_alerts','processed_message_ids',
    'campaign_sends','referral_links','churn_risks','whatsapp_send_log',
    'whatsapp_sessions'
  ]
  LOOP
    IF to_regclass(tbl) IS NOT NULL THEN
      EXECUTE format('GRANT ALL ON TABLE %I TO service_role', tbl);
    END IF;
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
-- prevenir regressão futura:
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
```

### 15) Correções de segurança para produção (`cdeb46d`)

- `POST /api/campaigns/expansion` era acessível sem auth — removido; usar `/api/admin/campaigns` (protegido).
- Webhook SGP (`/webhook/sgp/payment-confirmed`) agora rejeita tudo se `SGP_WEBHOOK_SECRET` não estiver configurado (fail-secure).
- Stack traces removidos das respostas de API (whatsapp/status, whatsapp/qr, payment-webhook).
- `/health` oculta `supabaseUrl`, `urlProjectRef`, `jwtProjectRef`, `keyFp`, `keyLen` em `NODE_ENV=production`.
- `safeCustomer()` em `routes/admin.ts` remove `contratoCentralLogin` e `contratoCentralSenha` de todas as respostas de customer na API admin.

### 16) Correções de auditoria técnica (2026-06-25)

**Segurança:**
- **IDOR admin routes** (`1b4a278`): todas as rotas `/conversations/:id` filtram por `tenant_id` via `getThreadForAdmin()` — admin de tenant A não acessa dados de tenant B.
- **reactivateCustomer stub** (`2d12422`): stub substituído por alerta manual ao `ADMIN_ALERT_PHONE` + mensagem honesta ao cliente ("será reativada em breve", não "foi reativada").
- **sanitize DAN/tokens** (`806b0dd`): 19 novos padrões em `sanitizeUserInput` — DAN personas, tokens de modelo (`<|im_start|>`, `[INST]`), variantes PT, obfuscação com separadores.
- **PII logs LGPD** (`a5d46a6`): telefone mascarado (`****XXXX`) nos logs de quick-reply; `maskPhone()` exportado de `lib/phone.ts`.

**Performance:**
- **getCustomerInsights OOM** (`8e52fb1`): `.limit(100)` adicionado — evita timeout em clientes com histórico longo.
- **N+1 SGP admin** (`8ec937e`): cache de 5 min em memória (`sgpCache`) para lookups de cliente nas rotas admin.
- **detectSlowSpeedCluster N+1** (`8bdf41b`): `SLOW_SPEED_BATCH_LIMIT = 20`, concorrência limitada a 5 via `withConcurrencyLimit`.

**Correções de race condition/concorrência:**
- **TOCTOU double-booking** (`ace3f32` + `4e47a1f`): `agendar_visita` usa RPC atômica `book_visit_slot` (migration `031`) com `pg_advisory_xact_lock` — previne double-booking mesmo em slot vazio.
- **bring-forward slot check** (`d4e4bd8`): `isSlotAvailable` verificado antes de confirmar antecipação; slot cheio retorna mensagem educada e mantém horário original.
- **cron overlap** (`f0b3ccd`): flag `isDetecting` previne sobreposição de ciclos do pattern-detector — ciclo anterior ainda em execução → próximo é pulado com warn.
- **phone-mutex cleanup** (`df864a5`): `locks.set(phone, next)` em vez de `locks.set(phone, prev.then(() => next))` — identity check `=== next` agora funciona, Map limpa corretamente.

**Correções de lógica:**
- **pendingNps Map leak** (`9473d3a`): auto-limpeza após 2h — clientes que ignoram NPS voltam a recebê-lo em sessões futuras.
- **applyNpsScoreActions parcial** (`59f7749`): `markChurnRisk` e `scheduleMessage` isolados em try/catch independentes; log `ATTENTION` quando churn marcado mas mensagem não agendada.
- **quick-reply log** (`4bd6b13`): `session_mode: 'default'` incluído no insert de `interaction_logs` no path de quick-reply.
- **nextAvailableSlots passados** (`c0e369c`): `isFutureSlot()` filtra slots do dia atual já expirados (manhã cutoff 12h, tarde 18h Fortaleza).
- **detectNpsDrop baseline** (`084b5df`): janelas separadas — recent = últimas 24h, baseline = 6 dias anteriores (`.lt('created_at', h24ago)`) — evita contaminação estatística.
- **CPF persist prematura** (`144fe60`): `persistThreadCpf` removida do caminho pré-lookup; persiste apenas após SGP confirmar via CPF.

**Melhorias de qualidade:**
- **NPS score 3 follow-up** (`b20080a`): mensagem qualitativa agendada 72h após score neutro.
- **hasReferralCampaign fail-safe** (`e09f393`): erro no check assume `true` (já enviado) — evita referral duplicado em falha de DB.

**Migration a executar manualmente no Supabase SQL Editor:**
- `backend/src/db/migrations/031_atomic_visit_slot.sql` — função `book_visit_slot` com advisory lock.

### 17) Urgency Score para fila de atendimento (implementado)

- `backend/src/lib/urgency-score.ts` — calcula score numérico por: `isHumanMode` (+100), fatura vencida (+20-80), `churn_risk` (+60), NPS ≤ 2 (+40), chamado aberto (+30), modo da sessão (+0-25), espera em human_mode (+30/+30).
- `urgencyReasons()` retorna array de strings para exibição no badge (ex.: "Fatura 5d em atraso", "Risco de cancelamento").
- `GET /api/admin/conversations` enriquece cada conversa com `urgency_score` e `urgency_reasons`; suporta ordenação por urgência (default) ou por tempo (`?sort=time`).
- Frontend: `UrgencyBadges` component, bloco "Urgente" (score ≥ 50) separado na lista, toggle de ordenação persistido em `localStorage`.

### 18) Status lifecycle de conversa + favoritos (migration 032)

- `conversation_threads` ganhou colunas `status TEXT DEFAULT 'active'` (active/waiting/closed), `closed_at TIMESTAMPTZ`, `starred BOOLEAN DEFAULT false`.
- Admin pode encerrar conversa (`status=closed`), marcar como aguardando (`waiting`) e favoritar (`starred`).
- `GET /api/admin/conversations` filtra por status via tabs: Humano / Bot / Churn / Todos / Favoritos.
- Fechamento (`status=closed`) também desativa `human_mode`.
- **Migration 032 obrigatória** — sem ela as queries de status falham.

### 19) Copiloto de atendimento (migration 033)

- `POST /api/admin/conversations/:id/suggest` — gera sugestão de resposta para o agente humano usando LLM (DeepSeek), com rate limit de 1 sugestão por conversa a cada 10s; sugestão apagada automaticamente do Map após 15s.
- `CopilotSuggestion` component no frontend: aparece no chat quando em `human_mode`; operador pode usar a sugestão diretamente ou editá-la; registra `copilot_used`/`copilot_edited` em `interaction_logs`.
- **Migration 033 obrigatória** — colunas `copilot_used` e `copilot_edited` em `interaction_logs`.

### 20) Lembretes e follow-ups automáticos de visita (migration 034)

- `backend/src/automations/visit-followup.ts` — dois jobs:
  - `sendVisitReminders()`: cron horário (`0 * * * *`) — envia lembrete no dia da visita para clientes com `reminder_sent=false`.
  - `sendVisitFollowups()`: cron diário 18h (`0 18 * * *`) — envia follow-up no dia seguinte à visita para clientes com `followup_sent=false`, pedindo confirmação de resolução.
- Colunas `reminder_sent` e `followup_sent` em `scheduled_visits`.
- **Migration 034 obrigatória** — sem ela ambos os crons falham silenciosamente (coluna não existe).
- `routes/schedules.ts` e `bring-forward-flow.ts` já inicializam as colunas como `false` nos inserts.

### 21) Diagnóstico de velocidade (melhorado em 2026-06-29)

- Tools `solicitar_teste_velocidade` e `interpretar_resultado_velocidade` existiam como stubs básicos; melhorados:
  - Lookup automático de `plan_mbps` no SGP via `getCustomerById` quando o LLM omite o parâmetro.
  - Instrução ao cliente pergunta explicitamente Wi-Fi ou cabo.
  - `wifi_interference`: orienta reteste no cabo antes de abrir chamado; inclui campo `next_step` para guiar o LLM.
  - `network_issue` via cabo: inclui `next_step: 'Chame abrir_chamado...'`.
  - Novo caso `test_failed` quando `download_mbps <= 0`.
- Prompt da Sofia (`prompt-builder.ts`) atualizado: fluxo Wi-Fi → cabo → chamado, com passos explícitos no modo suporte.

### 22) Portal do Cliente (`/minha-conta`)

- Login por OTP: cliente informa telefone → recebe código via WhatsApp → acessa portal.
- **Lockout de força bruta (`auth.ts`, migration `035`):** `otp_codes.attempts` conta tentativas erradas. Na 5ª tentativa errada (`MAX_ATTEMPTS = 5`), o código é invalidado na hora (`expires_at` zerado) — mesmo um palpite certo depois disso é rejeitado até o cliente pedir um novo código em `/request-otp` (que reseta `attempts` para 0 no `upsert`). Código válido é apagado (`delete`) após uso, para não permitir replay do mesmo OTP.
- Rotas em `backend/src/routes/client.ts` (todas protegidas por `clientAuthMiddleware`):
  - `GET /api/client/invoice` — fatura atual + PIX gerado
  - `GET /api/client/invoices` — histórico de faturas do SGP
  - `GET /api/client/tickets` — chamados abertos (`sofia_tickets`)
  - `POST /api/client/tickets` — abre chamado (persiste no SGP best-effort + sempre em `sofia_tickets`)
  - `GET /api/client/profile` — nome, plano, status do contrato (via SGP)
  - `GET /api/client/schedule` — próxima visita agendada (status `scheduled`)
  - `GET /api/client/connection` — status da conexão (via SGP)
  - `GET /api/client/referral` — link de indicação
- Coluna `visit_date` (não `date`) em `scheduled_visits` — armadilha já corrigida em `client.ts`.

### 23) Replay protection no webhook de pagamento + fechamento de auditoria final (2026-07-05)

- **Replay protection SGP (`payment-webhook.ts`, migration `036`):** cada `POST /webhook/sgp/payment-confirmed` válido (HMAC ok) tem o SHA-256 do raw body inserido em `processed_webhook_ids`. Insert duplicado (`23505`) = payload já processado → responde `200` sem reprocessar (idempotência, não erro). Falha de insert que **não** seja duplicidade só loga e segue (dedup best-effort, nunca bloqueia o fluxo de negócio). Purge automático em 24h junto com `processed_message_ids`.
- **`visit-followup.ts` filtra por status:** lembretes (`sendVisitReminders`) só consideram `status='scheduled'`; follow-ups (`sendVisitFollowups`) só `status='done'` — evita mandar lembrete/follow-up pra visita cancelada ou ainda pendente.
- **`scheduled_visits` totalmente escopado por `tenant_id` (fix 2026-07-05/06):** todas as queries de leitura/escrita em `scheduled_visits` agora filtram por tenant — cobre os 4 arquivos que tocam a tabela:
  - `visit-followup.ts` — `select`/`update` de `reminder_sent`/`followup_sent` via `env.DEFAULT_TENANT_ID` (não tem contexto de request; é cron).
  - `visit-scheduling.ts` — `loadOccupancy` (usada por `isSlotAvailable`/`nextAvailableSlots`) via `env.DEFAULT_TENANT_ID`.
  - `bring-forward-flow.ts` — `offerBringForward`/`getPendingOffer`/`handleBringForwardReply` via o parâmetro `tenantId` já recebido dessas funções (não precisou de `env`, já tinham o tenant da chamada).
  - `routes/schedules.ts` — todas as rotas (`GET /`, `GET /today`, `PATCH /:id`, `PATCH /:id/reschedule`, `DELETE /:id`, incluindo os fallbacks de coluna ausente) via `env.DEFAULT_TENANT_ID`.
  Antes, essas queries rodavam sem filtro de tenant — inofensivo hoje com um único tenant em produção, mas um cron/painel multi-tenant leria/escreveria visitas cruzadas entre tenants. Testes de escopo em `visit-followup.test.ts`, `visit-scheduling.test.ts`, `bring-forward-flow.test.ts` e `schedules.test.ts`.
- **Métricas do copiloto agora gravadas (fix 2026-07-05):** `POST /conversations/:id/reply` passou a aceitar `copilot_used`/`copilot_edited` no body (o frontend já enviava, mas a rota ignorava). Como `interaction_logs` não tem `conversation_id`, a rota atualiza o registro mais recente por `(tenant_id, phone)` — melhor esforço, não bloqueia o envio da resposta se a atualização falhar.
- **Alerta de queda prolongada de WhatsApp (`instance-manager.ts`, fix 2026-07-05):** `healthCheckAll` (cron 5 min) agora rastreia, em memória, desde quando cada instância está desconectada. Se a queda passar de 15 min contínuos (3 ciclos), dispara **um** WhatsApp pra `ADMIN_ALERT_PHONE` (mesmo padrão de `pattern-detector.ts`) e não repete até a instância reconectar e cair de novo. Isso é mitigação, não causa raiz — o ciclo `event=Disconnected`/`event=Connected` observado nos logs do Evolution Go é do lado do WebSocket whatsmeow↔WhatsApp (fora do controle do backend); ver análise na auditoria de 2026-07-05 para detalhes e limitações (sem acesso a logs do Railway, a frequência real não pôde ser quantificada nesta rodada).

### 24) Falha de entrega silenciosa em `sendText` — `delivery_status` (fix 2026-07-07, migration `037`)

**Bug confirmado em produção:** quando `whatsappService.sendText()` lança (ex.: instância desconectada, timeout, erro do Evolution Go), a exceção pulava direto pro `catch` geral de `processMessage` — o `interaction_logs.insert()` (que só rodava DEPOIS do `sendText`) nunca executava. Resultado: a resposta da Sofia era gerada, salva em `conversation_threads` (via `saveMessage`), mas **nunca chegava ao cliente e nunca aparecia no painel admin** — falha completamente invisível. Confirmado em produção: mensagem para `+558591993833` às 2026-07-07T19:10:17Z, salva na thread mas sem linha correspondente em `interaction_logs` (gap de ~42min até a próxima interação). Auditoria no histórico completo (não só 48h) achou só esse 1 caso real — as outras ~27 "mensagens órfãs" encontradas eram de JIDs de grupo/inválidos de dados de maio/2026, anteriores ao filtro de JID da seção "JIDs — telefone, LID e canais" (não passam mais por `processMessage` hoje). **Não foi possível confirmar via log do Railway/Evolution Go se houve `event=Disconnected` exatamente às 19:10** — este ambiente não tem acesso a esses logs nem a token de API do Railway; `whatsapp_instances.status` não serve de histórico porque `healthCheckAll` sobrescreve a mesma linha a cada 5min. O fix abaixo é intencionalmente agnóstico à causa (não assume que foi um blip de conexão).

**Fix — `interaction_logs` agora é a fonte de verdade de entrega, não presença/ausência de linha:**
- Migration `037_delivery_status.sql`: `interaction_logs` ganhou `delivery_status TEXT NOT NULL DEFAULT 'sent'` e `delivery_error TEXT`.
- `sendTextWithDeliveryStatus()` em `processor.ts` envolve `whatsappService.sendText()` com retry curto (`withRetry` em `utils/retry.ts`, 2 tentativas extras com backoff 1s/3s — 3 tentativas no total) e **nunca lança**: captura sucesso/falha e retorna `{ status, error? }`. O insert em `interaction_logs` acontece **sempre**, com `delivery_status`/`delivery_error` refletindo o resultado real do envio — inclusive quando as 3 tentativas falham.
- Aplicado nos 3 pontos que enviam a resposta principal ao cliente: fluxo LLM completo, quick-reply (FAQ sem LLM) e a mensagem de erro genérica do `catch` geral do pipeline (esse último agora também grava uma linha em `interaction_logs` com o texto que deveria ter sido enviado — antes, se o reenvio de erro falhasse, não sobrava nenhum rastro).
- `response` na linha com `delivery_status='failed'` contém o texto exato que não foi entregue — permite reenvio manual.
- **Não afeta:** o aviso de NPS (`scheduleNps`) e a confirmação pós-NPS continuam usando `whatsappService.sendText()` direto (fire-and-forget best-effort, fora do escopo desse fix — não geram linha própria em `interaction_logs` hoje).
- Testes em `__tests__/agent/processor.test.ts` (`describe('processMessage — delivery status')`) cobrem: retry recupera na 2ª tentativa → `delivery_status: 'sent'`; falha nas 3 tentativas → `delivery_status: 'failed'` com `delivery_error` e `response` preservados.

**Monitoramento:** `operational_alerts`/painel ainda não têm um detector para `delivery_status='failed'` — próximo passo natural seria um 6º detector em `pattern-detector.ts` (`delivery_failure_spike`) ou uma query direta no painel admin filtrando `delivery_status != 'sent'`. Não implementado nesta rodada (fora do escopo pedido).

**Status de deploy (2026-07-07, checado na auditoria do item 25 abaixo):** `processor.ts`, `processor.test.ts`, `utils/retry.ts` e a migration `037` ainda estavam **não commitados** no momento da auditoria seguinte — o fix existe no working tree e passa nos testes, mas não estava em produção até então. Confirme `git log` antes de assumir que este fix já está no Railway.

---

### 25) Auditoria Evolution Go pós-incidente — ACK rápido confirmado, sandbox de teste implementada (2026-07-07)

Auditoria da integração contra a skill `evolution-go` (payload, JIDs, mídia, confiabilidade, reconexão, disciplina de teste), motivada pelos dois incidentes desta sessão (mensagem processada mas nunca entregue — item 24; teste sintético vazando pro WhatsApp real do Ronald — seção "Política de testes ao vivo").

**Achado principal — ACK rápido já estava correto, ao contrário da hipótese inicial:** `webhook-router.ts` já respondia `200` **antes** de `provider.parseWebhook()` (que faz download/transcrição de mídia) e antes de `eventBus.enqueue()` (que dispara `processMessage`, fire-and-forget, sem `await` no handler em `index.ts`). Não havia teste cobrindo esse comportamento — adicionado `__tests__/routes/webhook-router.test.ts` (3 casos: ACK sai antes de `parseWebhook` resolver mesmo com a promise deliberadamente travada; 401 rejeita antes de qualquer processamento; 404 de instância desconhecida não toca o provider). Nenhuma mudança de código foi necessária nessa parte.

**Gap de teste identificado (não fechado nesta rodada):** os itens 1 (parse `data.Info`/`data.Message`), 2 (filtro de JID), 3 (resolução `@lid` via `SenderAlt`/`senderPn`), 6 (reconexão no boot) e 7 (case-tolerância de mídia) estão implementados corretamente em `evolution-go.ts`/`phone.ts`/`bootstrap.ts` (confirmado por leitura de código), mas **não têm teste unitário dedicado** — `media-download.test.ts` cobre só o unwrap de `viewOnceMessage`/`ephemeralMessage`, não o parsing completo do webhook nem a resolução de JID/LID. Uma regressão nesses pontos hoje só apareceria em produção.

**Nova trava — `assertSandboxNumber`:** `backend/src/utils/test-sandbox.ts` + env var `TEST_SANDBOX_PHONE` (`config/env.ts`, opcional). Lança se `TEST_SANDBOX_PHONE` não estiver configurado ou se o telefone passado não bater com ele (`normalizePhone` dos dois lados antes de comparar). Todo script novo em `backend/scripts/` que envie mensagem real ou chame `processMessage` direto contra produção deve chamar essa função primeiro — ver ponto 4 da "Política de testes ao vivo" acima. `TEST_SANDBOX_PHONE` ainda não foi provisionado/definido no Railway — é só a trava de código; falta decidir e configurar o número real.

**`DATABASE_SAVE_MESSAGES` (persistência de mensagens no Evolution Go) — avaliado, não ativado:** não há acesso a essa configuração a partir deste ambiente (é uma env var do serviço Evolution Go no Railway, não deste repo, e não há token de API do Railway disponível aqui — mesma limitação já registrada no item 23). Recomendação: **ativar**, se o custo de armazenamento extra no Postgres do Evolution Go for aceitável — hoje, se as 5 tentativas de retry nativo do Evolution Go se esgotarem (~2,5min de instabilidade), a mensagem é perdida sem nenhuma fonte de verdade pra reconciliar (nem neste backend, nem no Evolution Go). É decisão de custo/infra, não de código — não ativar sem confirmação do usuário.

**Fila durável (RabbitMQ/NATS) — recomendação: ainda não.** Com o volume atual (~270 interações no histórico completo, um único tenant em produção), o ACK rápido já em vigor + retry nativo do Evolution Go (5x/~30s) + dedup por `messageId` já cobrem o cenário realista de falha; migrar para uma fila durável agora seria otimização prematura — reconsiderar se o volume crescer a ponto de motivar processamento em lote/paralelo real ou se a janela de ~2,5min de retry deixar de ser aceitável para o negócio.

---

### 26) PIX via placeholder/token substitution (2026-07-10)

O LLM nunca vê nem escreve payload PIX real. `pix-token-vault.ts` cria um vault por turno de `processMessage`; no boundary único onde saída de tool é serializada para o LLM (junto de `redactSensitiveFields`, nas duas flows), todo `pixKey`/`pixCode` — inclusive aninhado em `suggested_invoice` e arrays de `Invoice` — vira `{{PIX_xxxxxxxx}}`. Depois de `formatOutgoingWhatsApp`, o processor resolve os placeholders por lookup direto (`pixVault.resolve`); placeholder desconhecido ou malformado (`PIX_xxxxxxxx` sem chaves) = bloqueio fail-safe com `pix_token_blocked` no tool log.

- **Thread (`saveMessage`) guarda a versão com placeholder** — o histórico visto pelo LLM nunca contém código real; placeholder antigo copiado do histórico não resolve e bloqueia (reenvio exige `gerar_pix` novo). Consequência aceita: o painel admin mostra `{{PIX_...}}` na conversa; o texto real entregue está em `interaction_logs.response`.
- **`interaction_logs.response` guarda o texto pós-substituição** (necessário pro reenvio manual em `delivery_status='failed'`); `tool_calls` guarda a versão tokenizada (o que o LLM viu).
- **As tools não mudaram**: `gerar_pix`/`listar_faturas`/`get_fatura_atual` continuam retornando `pixKey`/`pixCode` crus; a tokenização é só no boundary das flows. Templates de cobrança (`templates/billing.ts` e automações) NÃO passam pelo vault — não têm LLM no caminho.
- **`containsUnverifiedPix` + `PIX_EMV_RE` viraram defesa em profundidade**: como o toolCallLog carrega tokens, a allowlist fica vazia e qualquer EMV cru digitado pelo LLM bloqueia.
- **Entrega em mensagens separadas (UX de cópia):** quando a resposta resolvida contém PIX, o processor quebra o envio em sequência (`buildPixDeliverySequence` + `sendSequenceWithDeliveryStatus`): texto antes → código puro sozinho → texto depois; com múltiplas faturas, cada código vira sua própria mensagem, mantendo ordem e o contexto de cada fatura. A parte do código vai **crua, sem `sanitizeOutgoingMessage`** (o filtro poderia corromper o payload EMV); as partes de texto passam pelo sanitize normal. Falha parcial **aborta a sequência** na primeira mensagem que esgotar os retries — sintoma aceito deliberadamente: se o texto introdutório já foi entregue e o código falhar, o cliente vê "Aqui está seu PIX:" sem código (pior UX que o balão único nesse cenário, mas nunca entrega código corrompido/parcial); o reenvio manual usa `interaction_logs.response` (texto completo) + `delivery_status='failed'`. A thread continua salvando UMA mensagem assistant (com placeholder), independente de quantas mensagens foram enviadas.
- Limitação conhecida: a rota `/conversations/:id/reply` (copiloto/human mode) não substitui placeholders — operador que copiar `{{PIX_...}}` de uma sugestão envia o literal. Follow-up pendente.

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

### 4. Diagnóstico de velocidade ✅ implementado (2026-06-29)

**Status atual:** tools `solicitar_teste_velocidade` e `interpretar_resultado_velocidade` implementadas e integradas ao prompt da Sofia.

**Fluxo:** cliente relata lentidão → `solicitar_teste_velocidade` (busca `plan_mbps` no SGP se omitido, pede resultado Wi-Fi ou cabo) → `interpretar_resultado_velocidade` → `ok`/`wifi_interference` (reteste no cabo) / `network_issue` (abrir chamado) / `test_failed` (refazer teste).

**Próximo passo:** coleta retroativa de dados de eficácia (visitas evitadas vs. abertas após fluxo) para calibrar thresholds de 80%.

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
- **Não remova `makeServiceRoleFetch` de `config/supabase.ts`** — sem ele, supabase-js sobrescreve o header `Authorization` via eventos de auth e todas as queries caem como `authenticated` (permission denied)
- **Não amplie o interceptor `makeServiceRoleFetch` para além de `/rest/v1/`** — sobrescrever `/auth/v1/` quebra `supabase.auth.getUser(token)` causando logout imediato após login
- **Não retorne objeto `Customer` direto em rotas admin** — use `safeCustomer()` para remover `contratoCentralLogin`/`contratoCentralSenha` antes de `res.json()`
- **Não registre rotas de escrita em `/api/` sem `adminAuthMiddleware`** — `/api/campaigns` sem auth foi uma brecha real que permitia disparo de WhatsApp em massa
- **Não deixe `buscar_cliente` retornar dados de um `phone` diferente do telefone da sessão atual sem verificação de vínculo (CPF batendo com o telefone consultado)** — era IDOR real em produção: qualquer número consultava saldo em aberto e credenciais da Central do Assinante de outro cliente só citando o telefone dele. Ver seção "Identificação do cliente" para o fix (`cross_phone_attempt` + verificação por CPF + mensagem genérica indistinguível entre "não existe" e "CPF não confere").
- **`permission denied for table X TO authenticated` não é problema de chave** — são grants revogados; ver seção "Grants Supabase" para o fix SQL
- **Não use `date` para a coluna de data em `scheduled_visits`** — a coluna se chama `visit_date` (confirmado em migrations, tools.ts, bring-forward-flow.ts). `client.ts` usava `date` erroneamente e visita nunca aparecia no portal — já corrigido.
- **Não adicione colunas em `scheduled_visits` sem migration** — `reminder_sent`/`followup_sent` foram usadas antes da migration 034 existir, fazendo o cron de lembrete/follow-up falhar silenciosamente. Sempre crie a migration antes de usar a coluna no código.
- **Não confie em CPF sem validação de checksum (`isValidCpf`, módulo 11) antes de consultar o SGP** — checar só o comprimento (11 dígitos) não basta: existe um contrato real no SGP com `cpfCnpj = "00000000000"` (dado sujo), e um CPF inválido sem checksum pode casualmente identificar o cliente errado. Todo ponto de entrada de CPF (`processor.ts`, `tools.ts` `buscar_cliente`/`salvar_cpf_cliente`) precisa validar antes de chamar `getCustomerByCpf`.
- **Não deixe resultado bruto de tool call (ou `customerData`) virar string para o LLM ou para `interaction_logs` sem passar por `redactSensitiveFields`** (`integrations/sgp/types.ts`) — `contratoCentralLogin`/`contratoCentralSenha` vazam para o provedor de LLM (DeepSeek/Anthropic) e para o Supabase se esse filtro for pulado em qualquer serialização nova. É a mesma fonte de verdade usada por `safeCustomer()` nas rotas admin — não duplique a lista de campos sensíveis.
- **Não persista nem retorne dado de um identificador (phone/cpf/contrato/customer_id) diferente da sessão atual sem passar por `isPhoneRegisteredToCpf`** (`agent/identity-verification.ts`) — era o mesmo bug raiz repetido em 4 tools: `salvar_cpf_cliente` vinculava qualquer CPF informado à thread sem checar se o telefone da sessão tinha relação com ele (exploração real confirmada em produção — CPF de terceiros persistido na thread de outro número, dando acesso automático ao saldo/credenciais dele); `listar_chamados_sofia`, `abrir_chamado` e `agendar_visita` confiavam no `contrato`/`customer_id` vindo da chamada da tool em vez de resolver o da sessão. Toda tool nova que aceita um identificador de terceiro deve usar essa função (ou `resolveSessionCustomerId` em `tools.ts` para contrato) — nunca reimplementar a checagem ad hoc. Ver seção "Identificação do cliente" para detalhes.
- **Não remova o lockout de tentativas de `verify-otp`** (`auth.ts`, coluna `otp_codes.attempts`, migration `035`) — sem ele o código de 6 dígitos é bruteforçável (1 milhão de combinações, 10 min de validade). O limite é 5 tentativas; a 5ª errada invalida o código na hora, não só conta.
- **Não remova o dedupe de `processed_webhook_ids` em `payment-webhook.ts`** (migration `036`) — é a única defesa contra replay do webhook de pagamento do SGP (reenvio do mesmo payload não deve gerar nova notificação/side-effect). Insert duplicado (`23505`) é o sinal de replay, não um erro de banco.
- **Não chame `whatsappService.sendText()` direto nos 3 pontos de resposta principal ao cliente (fluxo LLM, quick-reply, catch geral de `processMessage`) sem passar por `sendTextWithDeliveryStatus()`** (`processor.ts`) — era a causa raiz de uma falha de entrega totalmente invisível em produção: `sendText` lançava, a exceção pulava pro `catch` geral, e o `interaction_logs.insert()` (que só rodava depois do envio) nunca acontecia — a resposta ficava salva na thread mas nunca chegava ao cliente nem aparecia no painel. `interaction_logs.delivery_status`/`delivery_error` (migration `037`) é a fonte de verdade de entrega hoje — presença de linha não significa mais entrega bem-sucedida sozinha. Ver seção "Falha de entrega silenciosa em `sendText`".
- **Não envie mensagem real nem chame `processMessage` diretamente contra produção em script/diagnóstico sem chamar `assertSandboxNumber(phone)` primeiro** (`utils/test-sandbox.ts`) — foi assim que um teste sintético vazou pra conversa real do WhatsApp pessoal do Ronald (ver "Política de testes ao vivo contra produção" e item 25). A trava só funciona se `TEST_SANDBOX_PHONE` estiver configurado no ambiente; sem ela, `assertSandboxNumber` lança em vez de deixar passar silenciosamente.
- **Não bloqueie a resposta HTTP do webhook (`webhook-router.ts`) esperando `provider.parseWebhook()` ou o processamento do agente** — o ACK deve sair logo após `validateWebhook`, antes de qualquer I/O caro (download/transcrição de mídia, chamada de LLM). É isso que faz o retry nativo do Evolution Go (5x/~30s) funcionar como rede de segurança em vez de correr risco de timeout. Ver item 25 e seção 5 da skill `evolution-go`.
- **Não deixe saída de tool chegar ao contexto do LLM por fora do boundary tokenizado das flows** (`vault.tokenize(redactSensitiveFields(...))` em `runAnthropicFlow`/`runDeepSeekFlow`) — qualquer caminho novo que injete `pixKey`/`pixCode` cru no prompt (contexto manual, initialToolLog, pré-chamada) reabre o vazamento que o vault fechou. Os contextos manuais atuais (`buscar_cliente`, `get_fatura_atual` pré-executado — só `{status}` —, `verificar_cobertura`) não carregam PIX; mantenha assim ou tokenize.
- **Não esvazie `BILLING_ALLOWLIST_CPFS` nem remova o gate `isCpfSendAllowed` em `billing-cadence.ts`/`billing-reminders.ts` sem pedido explícito do Ronald** — rollout de cobrança automática pra base completa de clientes é decisão dele, ainda pendente; ver seção "Allowlist de envio de cobrança" e memória do projeto `project_billing_allowlist_restriction`. Nunca commite CPFs reais em código — a lista vive só na env var do serviço no Railway.
