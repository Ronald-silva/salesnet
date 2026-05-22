# SalesNet Telecom — Plataforma ISP (Fortaleza/CE)

Repositório **monorepo**: frontend (`./`) + backend (`backend/`). Documentação de visão de produto, escalabilidade multi-provedor e diferenciais estratégicos: **[docs/doc.md](docs/doc.md)**.

## Sobre o projeto

Plataforma da **SalesNet Telecom** que une:

| Camada | Stack atual | Função |
|--------|-------------|--------|
| **Site e apps web** | React 18, Vite, TypeScript, Tailwind, shadcn/ui | Institucional, portal do cliente (OTP), painel admin |
| **API e automações** | Node.js, Express, TypeScript | Webhooks Evolution/SGP, agente IA, cron jobs, campanhas |
| **Canais** | **Evolution Go** (WhatsApp) | Entrada/saída da Sofia — multi-instância, anti-ban |
| **ERP** | SGP (API) | Clientes, faturas, rede, chamados — fonte operacional |
| **Produto / dados** | Supabase (Postgres) | Threads, logs, flags operacionais, instâncias WA |

**Objetivo:** um só lugar para **captação**, **atendimento acionável**, **cobrança/campanhas** e **supervisão**, com caminho claro para **replicar em outros provedores** (multi-tenant + adaptadores de WhatsApp e ERP).

---

## Arquitetura WhatsApp (Evolution Go)

O sistema foi **migrado do Twilio** para a **Evolution API** em mai/2026 e agora opera com uma camada de abstração completa:

```
┌─────────────────────────────────────────────────────┐
│                 WhatsAppService (facade)             │
│        Todo o código usa apenas esta interface       │
└──────────────────┬──────────────────────────────────┘
                   │
         ┌─────────▼──────────┐
         │   ProviderRegistry  │
         └─────────┬──────────┘
         ┌─────────▼──────────┐
         │  EvolutionGoProvider│  ← provider ativo
         └────────────────────┘
```

### Componentes principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `integrations/whatsapp/whatsapp-provider.ts` | Interface comum a qualquer provider |
| `integrations/whatsapp/providers/evolution-go.ts` | Implementação Evolution API v2 |
| `integrations/whatsapp/providers/twilio-legacy.ts` | Adapter legado (compat, não ativo) |
| `integrations/whatsapp/provider-registry.ts` | Factory + resolução por tenant |
| `services/whatsapp-service.ts` | **Facade pública** — ponto único de envio |
| `services/instance-manager.ts` | Lifecycle de instâncias (criar, conectar, sync) |
| `services/rate-limiter.ts` | Anti-ban: delays humanizados + limites/min/hora/dia |
| `services/event-bus.ts` | Event bus desacoplado (substitui message-bus.ts) |
| `templates/` | Templates locais de billing e campanhas |
| `bootstrap.ts` | Inicializa providers a partir das env vars |

### Webhooks

| Endpoint | Uso |
|----------|-----|
| `POST /webhook/whatsapp/:instanceName` | Evolution Go (principal) |
| `POST /webhook/twilio` | Legado Twilio (compat durante transição) |
| `POST /webhook/sgp/*` | Eventos SGP (ex.: pagamento) |

### Variáveis de Ambiente (backend)

```env
# ── WhatsApp (Evolution Go) ──────────────────────────
WHATSAPP_PROVIDER=evolution-go
EVOLUTION_API_URL=http://evolution:8080   # Railway: URL interna / VPS: container name
EVOLUTION_API_KEY=sua_chave_aqui

# Twilio mantido opcional para compat/fallback
# TWILIO_ACCOUNT_SID=
# TWILIO_AUTH_TOKEN=
# TWILIO_WHATSAPP_NUMBER=

# ── Tenant ───────────────────────────────────────────
TENANT_MODE=single
DEFAULT_TENANT_ID=salesnet-default
BACKEND_URL=https://seu-backend.railway.app   # para montar webhook URLs

# ── LLM ──────────────────────────────────────────────
LLM_ROUTING_MODE=tiered
LLM_PROVIDER=anthropic
LLM_FALLBACK_PROVIDER=deepseek
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
LLM_MAX_TOKENS=1024
LLM_SIMPLE_MAX_TOKENS=512
LLM_SIMPLE_MAX_TOOL_ROUNDS=3

# ── ERP ──────────────────────────────────────────────
SGP_BASE_URL=https://sgp.seuisp.com.br/api
SGP_API_TOKEN=

# ── Database ─────────────────────────────────────────
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

PORT=3001
NODE_ENV=production
```

Copie o arquivo completo de `backend/.env.example`.

---

## Como executar localmente

### Frontend (raiz do repositório)

```sh
npm install
npm run dev
```

Servidor Vite na porta **8080**.

### Backend (`backend/`)

```sh
cd backend
npm install
cp .env.example .env   # preencha as variáveis
npm run dev
```

API na porta **3001** (`http://localhost:3001/health`).

### Com Docker (backend completo)

```sh
cd backend
# Modo desenvolvimento (sem Nginx/Certbot)
docker compose up api evolution postgres

# Incluir Redis para filas futuras
docker compose --profile with-redis up
```

---

## Colocando em produção (Railway)

### 1. Provisionar Evolution Go no Railway

Crie um novo serviço com a imagem `atendai/evolution-api:latest` e configure:
```env
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=<sua_chave>
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=<sua_connection_string>
```

### 2. Rodar migration SQL no Supabase

```sql
-- Executar no SQL Editor do Supabase:
-- backend/src/scripts/whatsapp-migration.sql
```

### 3. Criar primeira instância WhatsApp

```bash
# Via API (após deploy do backend)
curl -X POST https://seu-backend.railway.app/api/admin/instances \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "salesnet-principal"}'
```

### 4. Escanear QR Code

```bash
curl https://seu-backend.railway.app/api/admin/instances/<id>/qrcode \
  -H "Authorization: Bearer <admin_token>"
```

---

## Migração VPS Hostinger (Fase 2)

O `docker-compose.yml` já está pronto. Basta:

```sh
# Na VPS
git pull
cd backend
cp .env.example .env   # ajustar EVOLUTION_API_URL=http://evolution:8080
docker compose up -d

# Com SSL (Nginx + Certbot)
docker compose --profile with-nginx up -d
```

---

## Estrutura do repositório

```
.
├── src/                    # Frontend React (Vite)
│   ├── pages/              # Institucional, portal cliente, admin
│   ├── components/         # UI, Header, Footer, AIBotWidget, …
│   ├── api/                # Clientes HTTP (admin, portal)
│   └── lib/                # helpers (ex.: whatsapp.ts)
├── backend/                # API Node + agente + automações
│   ├── src/
│   │   ├── agent/          # processor, tools, prompt, memory, complexity-router
│   │   ├── automations/    # cron cobrança, campanhas, webhooks
│   │   ├── integrations/
│   │   │   ├── whatsapp/   # provider interface + Evolution Go + Twilio adapter
│   │   │   └── sgp/        # ERP integration
│   │   ├── services/       # whatsapp-service, instance-manager, rate-limiter, event-bus
│   │   ├── templates/      # mensagens locais (billing + campanhas)
│   │   ├── routes/         # auth, client, admin, webhook-router, admin-instances
│   │   ├── bootstrap.ts    # inicialização de providers
│   │   └── index.ts        # Express app
│   ├── docker-compose.yml  # Evolution + PostgreSQL + Redis + Nginx
│   ├── .env.example
│   └── package.json
├── docs/
│   ├── doc.md              # Visão SalesNet, escalabilidade, diferenciais
│   └── DEPLOY-CHECKLIST.md
├── vercel.json
├── package.json
└── README.md
```

---

## Funcionalidades

### Site institucional

Páginas de planos, cobertura (mapa), suporte (FAQ), hotspots, trabalhe conosco, contato, sobre. CTAs ligados a navegação, widget de chat no browser e links WhatsApp centralizados em `src/lib/whatsapp.ts`.

### WhatsApp operacional (Sofia)

Mensagens chegam via **Evolution Go** → webhook → **event bus** → **agente IA** com **tool-calling** no SGP (fatura, PIX, chamados, conexão, upgrade, transferência humana, etc.). Modo humano interrompe respostas automáticas. **Rate limiting** com delays humanizados protege contra banimento.

### Portal do cliente

Login com OTP via WhatsApp (`/minha-conta/login`), área logada com dados do cliente via API (`/api/client`).

### Painel administrativo

Conversas, métricas, campanhas, churn risks. Gestão de instâncias WhatsApp via `/api/admin/instances` (criar, conectar, QR code, status).

### Automações

- **Cron** diário para lembretes de cobrança (D-3, D0, atraso +3 dias, suspensão D+5).
- **Campanhas** (upsell, indicação, expansão, churn risk).
- **Webhook de pagamento** SGP para reativação automática.

---

## Tecnologias

| Categoria | Tecnologia |
|-----------|-----------|
| Frontend | React 18, Vite, TypeScript, Tailwind, shadcn/ui |
| Backend | Node.js, Express, TypeScript |
| WhatsApp | **Evolution Go** (multi-instância, anti-ban) |
| IA | Anthropic Claude (`@anthropic-ai/sdk`) + DeepSeek (axios) |
| ERP | SGP API (HTTP) |
| Banco | Supabase (Postgres) |
| Infra | Docker Compose, Railway (Fase 1), VPS Hostinger (Fase 2) |
| Testes | Jest — 85/85 passando |

---

## Scripts

### Frontend (raiz)

```sh
npm run dev          # Vite, porta 8080
npm run build
npm run preview
npm run lint
```

### Backend (`backend/`)

```sh
cd backend
npm run dev          # ts-node-dev
npm run dev:watch
npm run build        # tsc
npm run start        # node dist
npm test             # jest --runInBand
```

---

## Requisitos do Sistema

- **Node.js** 18+
- **npm** 9+
- **Docker** 24+ (para stack local completo)
- **Git**

---

## Suporte e manutenção

- Issues no repositório.
- Visão de produto e escalabilidade: [docs/doc.md](docs/doc.md).
- Deploy e smoke tests: [docs/DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md).

---

**SalesNet Telecom** — Fortaleza/CE.
