# SalesNet Telecom — Plataforma ISP (Fortaleza/CE)

Monorepo: frontend (`./`) + backend (`backend/`). Documentação estratégica em [docs/doc.md](docs/doc.md).

---

## Visão geral

Plataforma completa da **SalesNet Telecom** que une atendimento via WhatsApp (IA), cobrança automática, portal do cliente e painel administrativo em uma só base de código.

| Camada | Stack | Função |
|--------|-------|--------|
| **Frontend** | React 18 · Vite · TypeScript · Tailwind · shadcn/ui | Site institucional, portal do cliente (OTP), painel admin |
| **Backend** | Node.js · Express · TypeScript | API REST, agente IA Sofia, automações, webhooks |
| **WhatsApp** | Evolution Go (multi-instância) | Canal de entrada/saída da Sofia |
| **ERP** | SGP TSMX (API) | Clientes, faturas, PIX, chamados — fonte de dados operacional |
| **Banco** | Supabase (Postgres) | Threads, logs, leads, instâncias, agendamentos |
| **IA** | Anthropic Claude + DeepSeek | LLM com roteamento por custo/complexidade |

**Deploy atual:** Frontend → Vercel · Backend + Evolution Go → Railway

---

## Agente Sofia — Estado atual

Sofia é a atendente virtual da SalesNet que opera 24h no WhatsApp. Arquitetura em camadas: a mensagem passa por filtros progressivos antes de chegar ao LLM, mantendo custo e latência baixos para perguntas frequentes.

### Pipeline de processamento por mensagem

```
mensagem WhatsApp
        │
        ▼
  isHumanMode?  ──── sim ──▶  descarta silenciosamente
        │ não
        ▼
  sanitizeUserInput()          ← trunca 2000 chars, bloqueia prompt injection (PT+EN)
        │
        ▼
  quickReply()                 ← responde FAQ puro SEM acionar LLM
  (plans, coverage, FAQ)       ← se responder: salva histórico, loga, envia e encerra
        │ null (LLM necessário)
        ▼
  buscar_cliente(phone)        ← pré-executado antes do LLM (tool call explícita)
  get_fatura_atual()           ← pré-executado se cliente existe
        │
        ▼
  classifySession()            ← heurística regex: billing | support | commercial | prospect | default
  classifyMessageComplexity()  ← heurística regex: simple | intermediate | complex
        │
        ▼
  monta systemPrompt           ← SYSTEM_PROMPT + contexto cliente + modo ativo + bairros (se relevante)
        │
        ▼
  resolveTieredRouting()       ← escolhe provider (DeepSeek ou Anthropic) + limites de tokens/rounds
        │
        ▼
  LLM tool-calling loop        ← até 10 rodadas
  (DeepSeek ou Anthropic)
        │
        ▼
  saveMessage() + sendText() + interaction_logs
```

### Camada quick-reply (sem LLM)

Detecta e responde perguntas de FAQ sem acionar o LLM. Fontes em `company-data.ts`.

| Intent | Trigger | Resposta |
|--------|---------|---------|
| `plans_list` | "plano", "preço", "quanto custa", "velocidade", "contratar" | Lista formatada de planos com preços |
| `coverage_list` | "bairro", "cobertura", "atende", "região" | Lista todos os bairros cobertos |
| `coverage_check` | "tem fibra em [bairro]" | Verifica bairro específico |
| `faq_installation` | "instala", "prazo", "demora" | Prazo e condições de instalação |
| `faq_payment` | "forma de pagamento", "como pag", "pix", "boleto" | Métodos e desconto de pontualidade |
| `faq_support` | "suporte", "horário", "atendimento" | Horário de atendimento |

Limitação atual: o quick-reply não tem acesso ao contexto do cliente cadastrado — responde de forma genérica mesmo se o cliente já tem um plano ativo e a pergunta pode ser sobre upgrade.

### Modos de sessão (session-classifier)

| Modo | Condição de ativação (heurística) | O que Sofia faz |
|------|-----------------------------------|----|
| **prospect** | `buscar_cliente` retorna erro | Pergunta se é novo → verifica cobertura → apresenta planos → `registrar_interesse` |
| **billing** | Suspensão ativa OU fatura vencida OU keywords de cobrança | `get_fatura_atual` → `gerar_pix` proativo → `registrar_negociacao` se necessário |
| **support** | Keywords técnicas ("caiu", "lento", "sem sinal") | `status_conexao` → `detectar_apagao_bairro` → `abrir_chamado` → `agendar_visita` |
| **commercial** | Plano ≤ 50 Mbps + keywords de streaming/velocidade | Resolve problema primeiro → oferece upgrade uma vez |
| **default** | Qualquer outra mensagem | Tool-calling livre com contexto completo do cliente |

O classificador usa **exclusivamente regex** — não há LLM extra para entender intenção. Isso economiza custo mas pode errar em mensagens ambíguas ou mistas.

### Ferramentas disponíveis (18)

| Tool | Integração | Função |
|------|-----------|--------|
| `buscar_cliente` | SGP (real) | Dados do contrato por telefone ou CPF |
| `get_fatura_atual` | SGP (real) | Fatura aberta ou mais recente |
| `listar_faturas` | SGP (real) | Histórico de faturas |
| `gerar_pix` | SGP (real) | Código PIX copia-e-cola |
| `confirmar_pagamento` | SGP (real) | Status de pagamento |
| `listar_chamados` | SGP (stub) | Retorna `[]` — endpoint não disponível com token auth |
| `abrir_chamado` | SGP (real) | Abre chamado + registra em `outage_reports` se técnico |
| `agendar_visita` | SGP (stub) + Supabase | SGP não retorna ID real; persiste em `scheduled_visits` |
| `status_conexao` | SGP (real) | Sinal e status da ONU |
| `get_planos_disponiveis` | Local (`company-data.ts`) | Lista planos com velocidades e preços |
| `verificar_cobertura` | Local (`company-data.ts`) | Cobertura por bairro ou lista completa |
| `solicitar_upgrade` | Stub | Fila de análise manual — sem endpoint SGP |
| `aplicar_cortesia` | Stub | Fila de análise manual — sem endpoint SGP |
| `registrar_interesse` | Supabase | Lead prospect (nome, bairro, plano desejado) |
| `registrar_negociacao` | Supabase | Acordo de parcelamento formalizado |
| `marcar_churn_risk` | Supabase | Flag no thread para acompanhamento |
| `detectar_apagao_bairro` | Supabase | ≥ 2 relatos no bairro em 2h = apagão |
| `transferir_humano` | Supabase | Flag `human_mode=true`; desliga bot até reset manual |

### Roteamento de LLM (modo tiered)

| Complexidade | Heurística de ativação | Provider | Limites |
|---|---|---|---|
| **simple** | Saudação curta OU FAQ keyword, ≤ 100 chars | DeepSeek | `LLM_SIMPLE_MAX_TOKENS`, `LLM_SIMPLE_MAX_TOOL_ROUNDS` |
| **intermediate** | Demais mensagens | DeepSeek | `LLM_MAX_TOKENS`, 10 rodadas |
| **complex** | Procon, Anatel, judicial, ouvidoria, ameaça | Anthropic Claude | `LLM_MAX_TOKENS`, 10 rodadas |

Fallback automático: se o provider primário falhar, tenta `LLM_FALLBACK_PROVIDER`.

### Segurança implementada

| Mecanismo | Onde | O que protege |
|-----------|------|--------------|
| Sanitização de input | `sanitize.ts`, início de `processMessage` | Trunca 2000 chars, remove padrões de prompt injection em PT e EN |
| Validação HMAC do webhook | `evolution-go.ts` | Rejeita payloads não assinados pelo Evolution Go |
| Rate limiter por IP (IPv4 + IPv6) | `rate-limiter.ts` | Anti-ban e anti-spam |
| Guard `isHumanMode` | `processor.ts` | Não processa mensagens quando atendente humano está ativo |
| Guard `phone`/`body` undefined | `index.ts` | Descarta eventos mal-formados antes de chegar ao agente |
| Dados sensíveis fora do contexto | `processor.ts` | `contratoCentralSenha`, `contratoCentralLogin` removidos do prompt |

### Gaps para agente especialista em ISP

Esta seção descreve o que falta para elevar Sofia de "atendente competente" para "especialista em ISP de alta eficiência":

| Capacidade | Status | Impacto |
|-----------|--------|---------|
| Classificador de sessão semântico (LLM-based) | ❌ não existe | Erros em mensagens ambíguas ("meu plano é lento" → commercial vs support) |
| Quick-reply com contexto do cliente | ❌ genérico | Cliente com plano ativo vê resposta de prospect ao perguntar sobre planos |
| Histórico de tickets abertos na conversa | ❌ stub | Sofia não sabe se já existe chamado aberto para o problema |
| Leitura de comprovante de pagamento (imagem) | ❌ não existe | Cliente envia foto do comprovante; Sofia não consegue processar |
| Sugestão proativa de diagnóstico (velocidade) | ❌ não existe | Sofia não consegue pedir teste de velocidade e interpretar resultado |
| NPS / satisfação pós-atendimento | ❌ não existe | Sem métrica de qualidade por interação |
| Memória semântica cross-session | ❌ só histórico raw | Sofia não "lembra" preferências ou padrões do cliente entre conversas |
| Multimidia (áudio, vídeo, documentos) | ❌ não existe | Mensagens de voz ignoradas; boleto em PDF não lido |
| A/B testing de prompt/resposta | ❌ não existe | Sem forma de medir qual abordagem gera melhor retenção |
| Suspensão / reativação real via SGP | ❌ stub | `suspendCustomer()` e `reactivateCustomer()` retornam valores fixos |

---

## Planos e cobertura

### Planos disponíveis

| Plano | Download | Upload | Preço |
|-------|----------|--------|-------|
| Basic | 20 Mbps | 10 Mbps | R$ 50/mês |
| Turbo | 50 Mbps | 25 Mbps | R$ 70/mês |
| Ultra | 100 Mbps | 50 Mbps | R$ 90/mês |
| Giga | 300 Mbps | 150 Mbps | R$ 130/mês |

Desconto de R$ 10 pagando até o vencimento. Instalação gratuita. Fidelidade de 12 meses.

### Bairros com cobertura (Fortaleza/CE)

- Jardim Guanabara (95%)
- Nova Assunção (92%)
- Jardim Iracema (90%)
- Vila Velha (88%)
- Quintino Cunha (85%)

---

## Automações

| Automação | Quando dispara | O que faz |
|-----------|---------------|-----------|
| Cobrança D-5 / D-2 | 5 e 2 dias antes do vencimento (pagadores habituais atrasados) | Envia lembrete proativo via WhatsApp |
| Cobrança D+3 | 3 dias de atraso | Aviso de cobrança com PIX |
| Suspensão D+5 | 5 dias de atraso | Aviso de suspensão iminente |
| Lembrete de visita | 24h antes da visita agendada | Confirma data e período com o cliente |
| Follow-up pós-visita | 24h após a visita técnica | Pergunta se o problema foi resolvido |
| Webhook pagamento SGP | Evento de pagamento confirmado | Reativa o serviço automaticamente |
| Campanhas (upsell, indicação, churn, expansão) | Cron diário | Mensagens segmentadas por perfil do cliente |
| Health check instâncias | A cada 5 minutos | Verifica conexão do WhatsApp, reconecta se necessário |

---

## Arquitetura WhatsApp

```
Evolution Go (WhatsApp API)
        │ webhook POST /webhook/whatsapp/:instanceName
        ▼
  webhook-router.ts
        │ normaliza payload → DomainEvent
        ▼
    event-bus.ts
        │ emite 'whatsapp.message.received'
        ▼
   processor.ts
        │ buscar_cliente → classifica modo (billing/support/commercial/prospect)
        │ monta system prompt com contexto do cliente
        ▼
   LLM (DeepSeek / Claude)
        │ tool-calling iterativo (até 10 rodadas)
        ▼
   tools.ts → SGP / Supabase
        │
        ▼
   whatsapp-service.ts → Evolution Go → cliente
```

### Componentes do backend

| Arquivo | Responsabilidade |
|---------|-----------------|
| `agent/processor.ts` | Orquestrador principal: sanitização → quick-reply → pré-tools → sessão → LLM → resposta |
| `agent/quick-reply.ts` | FAQ sem LLM: planos, cobertura, instalação, pagamento, suporte |
| `agent/sanitize.ts` | Trunca 2000 chars, remove 15 padrões de prompt injection (PT+EN) |
| `agent/tools.ts` | 18 ferramentas: SGP (real), Supabase, stubs e dados locais |
| `agent/prompt.ts` | System prompt base + contextos por modo (billing/support/commercial/prospect) |
| `agent/company-data.ts` | Fonte única de verdade: planos, bairros, horários, políticas |
| `agent/session-classifier.ts` | Regex heurístico: billing | support | commercial | prospect | default |
| `agent/complexity-router.ts` | Regex heurístico: simple | intermediate | complex |
| `agent/memory.ts` | Thread history no Supabase, flag human_mode |
| `integrations/sgp/` | Cliente HTTP + billing, customers, tickets, network |
| `integrations/whatsapp/providers/evolution-go.ts` | Parser de webhooks + envio via Evolution Go API |
| `services/whatsapp-service.ts` | Facade pública de envio |
| `services/instance-manager.ts` | Lifecycle de instâncias WhatsApp |
| `services/rate-limiter.ts` | Anti-ban: delays humanizados |
| `services/event-bus.ts` | Event bus desacoplado |
| `automations/` | Cron jobs de cobrança, visitas e campanhas |
| `bootstrap.ts` | Inicializa providers + re-registra webhook no Evolution Go |

---

## Banco de dados (Supabase)

| Tabela | Uso |
|--------|-----|
| `conversation_threads` | Histórico de mensagens por telefone, modo humano, churn risk |
| `interaction_logs` | Log de cada interação (tool calls + resposta) |
| `whatsapp_instances` | Instâncias Evolution Go cadastradas |
| `leads` | Prospectos que entraram em contato mas ainda não são clientes |
| `scheduled_visits` | Visitas técnicas agendadas pela Sofia |
| `outage_reports` | Relatos técnicos para detecção de apagões por bairro |
| `billing_notifications` | Log de notificações de cobrança enviadas |

Para criar todas as tabelas: execute `backend/src/agent/schema.sql` no SQL Editor do Supabase.

---

## Variáveis de ambiente (backend)

```env
# ── Servidor ──────────────────────────────────────────
PORT=3001
NODE_ENV=production
BACKEND_URL=https://salesnet-production.up.railway.app

# ── WhatsApp (Evolution Go) ───────────────────────────
WHATSAPP_PROVIDER=evolution-go
EVOLUTION_API_URL=https://evolution-go-production-xxxx.up.railway.app
EVOLUTION_API_KEY=<global_apikey>
EVOLUTION_INSTANCE_NAME=salesnet
EVOLUTION_INSTANCE_TOKEN=<seu_token_de_instancia>

# ── ERP (SGP TSMX) ────────────────────────────────────
SGP_BASE_URL=https://salesnet.sgp.tsmx.com.br
SGP_API_TOKEN=<token_uuid>
SGP_APP_NAME=Ronald

# ── LLM ──────────────────────────────────────────────
LLM_ROUTING_MODE=tiered
LLM_PROVIDER=deepseek
LLM_FALLBACK_PROVIDER=anthropic
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5
LLM_MAX_TOKENS=1024
LLM_SIMPLE_MAX_TOKENS=512
LLM_SIMPLE_MAX_TOOL_ROUNDS=3

# ── Supabase ──────────────────────────────────────────
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# ── Tenant ────────────────────────────────────────────
TENANT_MODE=single
DEFAULT_TENANT_ID=salesnet-default

# ── Auth (portal do cliente / admin) ─────────────────
JWT_SECRET=
ADMIN_TOKEN=

# ── CORS ─────────────────────────────────────────────
CORS_ORIGIN=https://salesnet-green.vercel.app
```

Copie de `backend/.env.example` e preencha os valores.

---

## Executar localmente

### Frontend

```sh
npm install
npm run dev          # Vite na porta 8080
```

### Backend

```sh
cd backend
npm install
cp .env.example .env   # preencha as variáveis
npm run dev            # ts-node-dev, porta 3001
```

Verificar: `http://localhost:3001/health`

### Com Docker (stack completo)

```sh
cd backend
docker compose up api evolution postgres
```

---

## Deploy (Railway)

### 1. Evolution Go

Crie um serviço com a imagem `atendai/evolution-api:latest`:

```env
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=<sua_chave>
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=<postgres_url>
```

### 2. Backend

Crie um serviço apontando para o repositório (`backend/` como root directory). Configure todas as variáveis de ambiente acima.

O backend faz o **auto-provisioning** da instância WhatsApp e **re-registra o webhook** no Evolution Go a cada reinício — não é necessário configuração manual.

### 3. Tabelas no Supabase

Execute no SQL Editor do Supabase:

```sql
-- backend/src/agent/schema.sql
```

### 4. Escanear QR Code (primeira vez)

```bash
curl https://seu-backend.railway.app/api/admin/instances/<id>/qrcode \
  -H "Authorization: Bearer <admin_token>"
```

---

## Estrutura do repositório

```
.
├── src/                        # Frontend React (Vite)
│   ├── pages/                  # Institucional, portal cliente, admin
│   ├── components/             # Header, Footer, AIBotWidget, ...
│   ├── api/                    # Clientes HTTP
│   └── lib/                    # helpers (whatsapp.ts, etc.)
├── backend/
│   ├── src/
│   │   ├── agent/              # processor, tools, prompt, memory, routers
│   │   ├── automations/        # cron cobrança, campanhas, webhook pagamento
│   │   ├── integrations/
│   │   │   ├── whatsapp/       # Evolution Go provider + abstraction layer
│   │   │   └── sgp/            # billing, customers, tickets, network
│   │   ├── services/           # whatsapp-service, instance-manager, rate-limiter, event-bus
│   │   ├── routes/             # auth, client, admin, webhook-router, admin-instances
│   │   ├── templates/          # mensagens locais de cobrança e campanhas
│   │   ├── bootstrap.ts        # inicialização de providers
│   │   └── index.ts            # Express app entry point
│   ├── docker-compose.yml
│   ├── .env.example
│   └── package.json
├── docs/
│   ├── doc.md                  # Visão de produto e escalabilidade multi-tenant
│   └── DEPLOY-CHECKLIST.md
└── README.md
```

---

## Scripts

### Frontend

```sh
npm run dev
npm run build
npm run lint
```

### Backend

```sh
cd backend
npm run dev          # desenvolvimento com hot-reload
npm run build        # compilação TypeScript
npm run start        # produção (node dist)
npm test             # jest --runInBand
```

---

## Requisitos

- Node.js 18+
- npm 9+
- Docker 24+ (para stack local completo)

---

**SalesNet Telecom** — Fortaleza/CE
