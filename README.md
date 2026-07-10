# SalesNet Telecom Platform

Monorepo do produto da SalesNet: frontend React + backend Node.js com agente IA para atendimento via WhatsApp.

## O Que Este Repo Entrega

- Atendimento WhatsApp com a Sofia (tool-calling + integrações reais)
- Operação ISP conectada ao SGP (clientes, faturas, PIX, chamados)
- Portal/Admin web
- Automações de cobrança, campanhas e NPS
- Detecção de padrões operacionais (clusters de queda/lentidão, spike de cobrança, onda de churn, queda de NPS) com alertas no painel e no WhatsApp do admin

## Stack

- Frontend: React + Vite + TypeScript + Tailwind
- Backend: Node.js + Express + TypeScript
- Banco operacional de produto: Supabase (Postgres)
- ERP: SGP TSMX
- LLM: Anthropic + DeepSeek (roteamento por complexidade)

## Ambientes

- Frontend (Vercel): `salesnet-green.vercel.app`
- Backend (Railway): `salesnet-production.up.railway.app`

## Quick Start

### 1) Frontend

```bash
npm install
npm run dev
```

### 2) Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### 3) Health check

```bash
curl http://localhost:3001/health
```

## Scripts Principais

### Frontend (raiz)

```bash
npm run dev
npm run build
npm run lint
```

### Backend (`backend/`)

```bash
npm run dev
npm run build
npm run start
npx tsc --noEmit -p tsconfig.json
```

## Documentação

- Arquitetura e decisões técnicas da Sofia: [`CLAUDE.md`](./CLAUDE.md)
- Visão de produto e evolução multi-tenant: [`docs/doc.md`](./docs/doc.md)
- Checklist de deploy: [`docs/DEPLOY-CHECKLIST.md`](./docs/DEPLOY-CHECKLIST.md)

## Estrutura Rápida

```text
.
├── src/                     # Frontend React
├── backend/
│   └── src/
│       ├── agent/           # Processor, prompt, tools, memory, NPS
│       ├── integrations/    # SGP + WhatsApp providers
│       ├── routes/          # APIs admin/client/webhooks
│       ├── automations/     # Jobs de cobrança/campanhas
│       └── db/migrations/   # SQL de evolução de schema
└── docs/
```

## Contribuição

- TypeScript estrito (sem `any`)
- Para mudanças no backend, rode sempre:

```bash
npx tsc --noEmit -p backend/tsconfig.json
```

- Antes de PR, confira regras adicionais em [`CLAUDE.md`](./CLAUDE.md)

---

SalesNet Telecom - Fortaleza/CE
