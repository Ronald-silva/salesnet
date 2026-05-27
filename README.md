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

## Agente Sofia

Sofia é a atendente virtual da SalesNet que opera 24h no WhatsApp. Usa tool-calling para consultar o SGP em tempo real e responder com dados precisos.

### Cenários cobertos

| Modo | Ativação | O que Sofia faz |
|------|----------|-----------------|
| **Prospect** | Número não cadastrado no SGP | Pergunta se é novo cliente → verifica cobertura → apresenta planos → registra lead |
| **Cobrança** | Fatura vencida / suspensão / cliente pergunta sobre fatura | Busca fatura → gera PIX automaticamente → negocia parcelamento se necessário |
| **Suporte técnico** | "internet caiu", "lento", "sem sinal" | Status de conexão → detecta apagão no bairro → orienta reinício → abre chamado + visita |
| **Comercial** | Plano ≤ 50 Mbps + reclamação de velocidade | Resolve o problema primeiro → oferece upgrade uma vez de forma natural |
| **Cancelamento** | "quero cancelar" | Entende o motivo → tenta reter → marca churn risk → transfere para humano se insistir |
| **Default** | Qualquer outra mensagem | Atende usando o contexto do cliente e ferramentas disponíveis |

### Ferramentas disponíveis

| Tool | Função |
|------|--------|
| `buscar_cliente` | Busca dados do contrato pelo telefone no SGP |
| `get_fatura_atual` | Retorna fatura aberta ou mais recente |
| `listar_faturas` | Histórico de faturas (pagas + abertas) |
| `gerar_pix` | Gera código PIX copia-e-cola |
| `confirmar_pagamento` | Verifica se o pagamento foi confirmado no SGP |
| `abrir_chamado` | Abre chamado técnico/financeiro/comercial |
| `agendar_visita` | Agenda visita técnica (manhã ou tarde) |
| `status_conexao` | Verifica se a conexão está online |
| `detectar_apagao_bairro` | Detecta múltiplos relatos técnicos no bairro (últimas 2h) |
| `solicitar_upgrade` | Registra pedido de upgrade de plano |
| `registrar_negociacao` | Formaliza acordo de parcelamento |
| `registrar_interesse` | Captura lead de novo cliente (nome, bairro, plano desejado) |
| `verificar_cobertura` | Verifica se um bairro tem cobertura (ou lista todos com `*`) |
| `aplicar_cortesia` | Solicita desconto/cortesia na fatura |
| `marcar_churn_risk` | Sinaliza risco de cancelamento para o time |
| `transferir_humano` | Pausa o bot e transfere para atendente humano |

### Roteamento de LLM (modo tiered)

| Complexidade | Exemplos | Provider |
|---|---|---|
| **simple** | "oi", "quais os planos?", "segunda via" | DeepSeek (rápido, barato) |
| **intermediate** | Fatura + PIX, suporte técnico | DeepSeek |
| **complex** | Procon, ação judicial, ameaças | Anthropic Claude (fallback) |

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
| `agent/processor.ts` | Loop principal: contexto → LLM → tools → resposta |
| `agent/tools.ts` | Implementação das 17 ferramentas |
| `agent/prompt.ts` | System prompt + contexto por modo |
| `agent/session-classifier.ts` | Classifica modo (billing/support/commercial/prospect/default) |
| `agent/complexity-router.ts` | Classifica complexidade (simple/intermediate/complex) |
| `agent/memory.ts` | Thread history no Supabase, modo humano |
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
EVOLUTION_INSTANCE_TOKEN=salesnet-token-2026

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
