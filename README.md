# SalesNet Telecom — Plataforma ISP (Fortaleza/CE)

Monorepo: frontend React (`./`) + backend Node.js (`backend/`).

---

## Visão geral

Sistema operacional completo da **SalesNet Telecom**, provedor de fibra óptica em Fortaleza/CE. Une atendimento 24h via WhatsApp (agente IA **Sofia**), cobrança automática, portal do cliente e painel administrativo em um único repositório.

| Camada | Stack | Deploy | Função |
|--------|-------|--------|--------|
| **Frontend** | React 18 · Vite · TypeScript · Tailwind · shadcn/ui | Vercel (`salesnet-green.vercel.app`) | Site institucional, portal do cliente (OTP), painel admin |
| **Backend** | Node.js 20 · Express · TypeScript | Railway (`salesnet-production.up.railway.app`) | API REST, agente IA Sofia, automações, webhooks |
| **WhatsApp** | Evolution Go (multi-instância) | Railway (serviço separado) | Canal de entrada/saída da Sofia |
| **ERP** | SGP TSMX | Externo (SaaS) | Clientes, faturas, PIX, chamados, conexão — fonte operacional |
| **Banco** | Supabase (Postgres) | Supabase cloud | Threads, logs, leads, NPS, visitas, instâncias |
| **IA** | Anthropic Claude + DeepSeek | APIs externas | LLM com roteamento por custo/complexidade |

---

## Agente Sofia — Arquitetura completa

Sofia é a atendente virtual da SalesNet que opera 24h no WhatsApp. A arquitetura usa camadas progressivas para manter custo e latência baixos: a maioria das mensagens é respondida sem chamar o LLM.

### Pipeline de processamento (ordem exata de execução)

```
mensagem WhatsApp (Evolution Go → webhook)
        │
        ▼
  isHumanMode(phone)
  ├── sim → descarta silenciosamente (atendente humano ativo)
  └── não ↓
        ▼
  sanitizeUserInput(message)
  ├── trunca em 2000 chars
  └── remove 15 padrões de prompt injection (PT + EN)
        ▼
  NPS pending?
  ├── sim (ainda não enviado) → cancela NPS, processa normalmente
  ├── sim (já enviado) → tenta parseNpsResponse()
  │   ├── score 1-5 → saveNpsResponse() + agradece + encerra
  │   └── não numérico → descarta NPS, processa normalmente
  └── não ↓
        ▼
  quickReply(clean, phone)
  ├── plans_list + cliente existente → null (passa para LLM)
  ├── plans_list + prospect → resposta formatada, encerra
  ├── coverage_list/check/faq_* → resposta formatada, encerra
  └── null (não é FAQ) ↓
        ▼
  buscar_cliente(phone)            ← pré-executado ANTES do LLM
  get_fatura_atual(customerId)     ← pré-executado se cliente existe (best-effort)
  getCustomerInsights(phone)       ← histórico: suporte recorrente, churn, campanhas
        ▼
  verificar_cobertura('*')         ← pré-executado se mensagem contém keyword de bairro
        ▼
  classifySession()                ← heurística regex: billing | support | commercial | prospect | default
  classifyMessageComplexity()      ← heurística regex: simple | intermediate | complex
        ▼
  monta systemWithContext:
    getFortalezaContext()          ← hora local de Fortaleza (UTC-3)
    + SYSTEM_PROMPT                ← personalidade, regras, planos, bairros
    + Contexto do cliente atual    ← dados SGP (sanitizados: sem senha/login)
    + Modo de contexto ativo       ← billing/support/commercial/prospect context block
    + Coverage context             ← lista de bairros, se relevante
    + buildInsightsContext()       ← avisos: suporte recorrente, churn_risk, cliente antigo
        ▼
  resolveTieredRouting()           ← provider + limites de tokens/rounds por tier
        ▼
  runLLMFlow()                     ← loop tool-calling até 10 rodadas (ou cap do tier)
  ├── fallback automático se provider primário falhar
  └── resultado: texto final + toolCallLog
        ▼
  shouldSendNps()                  ← verifica se deve agendar NPS desta sessão
  scheduleNps()                    ← agenda envio em 30min (setTimeout em memória)
        ▼
  saveMessage('assistant') + sendText() + interaction_logs.insert(processing_ms)
```

### Módulo NPS (`nps-flow.ts`)

Fluxo de satisfação pós-atendimento. Roda depois de cada sessão resolvida (não-prospect).

**Condições para enviar:**
- Última sessão há 30min–2h (indicador de sessão recente encerrada)
- Nenhum NPS enviado nos últimos 2h para o mesmo telefone
- Sessão atual não é `prospect`

**Pergunta enviada (30min de delay):**
> "Obrigada por falar com a SalesNet! 😊
> De *1 a 5*, como você avalia nosso atendimento?
> 1 = Muito insatisfeito / 5 = Muito satisfeito"

**Captura:** na próxima mensagem do cliente, `parseNpsResponse()` detecta dígito 1-5. Resposta fora desse range descarta o NPS e processa normalmente.

**Tabela:** `nps_responses` (tenant_id, phone, score, session_id, created_at)

### Módulo de memória do cliente (`customer-memory.ts`)

Enriquece o system prompt com alertas baseados no histórico do Supabase:

| Sinal | Condição | Aviso no prompt |
|-------|----------|-----------------|
| `recurring_support` | ≥ 2 sessões support nos últimos 30 dias | "Problemas recorrentes. Priorizar resolução, não vender." |
| `churn_risk_active` | `conversation_threads.churn_risk = true` | "Cliente em risco de churn. Tom cuidadoso." |
| Cliente antigo | `days_since_first_contact > 365` | "Cliente há mais de 1 ano. Tratamento preferencial." |

Dados coletados: `total_interactions`, `last_session_modes` (5 mais recentes), `open_negotiation`, `campaigns_received`.

### Camada quick-reply (sem LLM)

Responde FAQ puro antes de acionar o LLM. Usa dados de `company-data.ts`.

| Intent | Regex de detecção | Comportamento |
|--------|-------------------|---------------|
| `plans_list` | plano, preço, velocidade, contratar... | **Se cliente existente → passa para LLM** (contexto importa). Se prospect → lista planos com preços |
| `coverage_list` | bairro, cobertura, atende, região | Lista todos os bairros cobertos |
| `coverage_check` | "tem fibra em [bairro]" | Verifica bairro específico (`COVERED_NEIGHBORHOODS`) |
| `faq_installation` | instala, prazo, demora | Prazo 3 dias úteis, instalação gratuita |
| `faq_payment` | forma de pagamento, como pago, pix, boleto | PIX/boleto, desconto R$10 no vencimento |
| `faq_support` | suporte, horário, atendimento | Suporte 24h WhatsApp |

### Modos de sessão (`session-classifier.ts`)

Classificação 100% regex — sem LLM extra. Cada modo adiciona um bloco de contexto específico no system prompt.

| Modo | Condição de ativação | Comportamento da Sofia |
|------|---------------------|----------------------|
| **prospect** | `buscar_cliente` retorna erro | Perguntar se novo cliente → cobertura → planos → `registrar_interesse` → "equipe contacta em 24h" |
| **billing** | Suspensão ativa OU fatura vencida OU keywords de cobrança | `get_fatura_atual` → `gerar_pix` proativo → `registrar_negociacao` se parcelamento |
| **support** | Keywords técnicas (caiu, lento, sem sinal, roteador...) | `status_conexao` → `detectar_apagao_bairro` → `abrir_chamado` → `agendar_visita` se não resolver |
| **commercial** | Plano ≤ 50 Mbps + keywords de streaming/qualidade | Resolve o problema PRIMEIRO → uma oferta de upgrade (não insiste) |
| **default** | Qualquer outra mensagem | Tool-calling livre com contexto completo |

### Roteamento de LLM (`complexity-router.ts`)

Heurística regex — sem LLM extra.

| Tier | Condição | Provider | Limites |
|------|----------|----------|---------|
| **simple** | Saudação curta OU FAQ keyword, ≤ 100 chars | DeepSeek | `LLM_SIMPLE_MAX_TOKENS` / `LLM_SIMPLE_MAX_TOOL_ROUNDS` |
| **intermediate** | Demais mensagens | DeepSeek | `LLM_MAX_TOKENS` / 10 rodadas |
| **complex** | Procon, Anatel, judicial, ouvidoria, ameaça | Anthropic Claude | `LLM_MAX_TOKENS` / 10 rodadas |

`LLM_ROUTING_MODE=tiered` ativa o roteamento. `LLM_ROUTING_MODE=single` usa sempre `LLM_PROVIDER`.

Fallback automático: se provider primário falhar, tenta `LLM_FALLBACK_PROVIDER`.

### Ferramentas disponíveis (18)

| Tool | Integração | Status | Função |
|------|-----------|--------|--------|
| `buscar_cliente` | SGP | ✅ real | Dados do contrato por telefone ou CPF |
| `get_fatura_atual` | SGP | ✅ real | Fatura aberta ou mais recente |
| `listar_faturas` | SGP | ✅ real | Histórico de faturas |
| `gerar_pix` | SGP | ✅ real | Código PIX copia-e-cola |
| `confirmar_pagamento` | SGP | ✅ real | Status de pagamento |
| `abrir_chamado` | SGP + Supabase | ✅ real | Cria chamado + registra em `outage_reports` se técnico |
| `status_conexao` | SGP | ✅ real | Sinal e status da ONU |
| `agendar_visita` | SGP (stub) + Supabase | ⚠️ parcial | SGP não retorna ID real; persiste em `scheduled_visits` |
| `get_planos_disponiveis` | Local | ✅ real | Planos com velocidades e preços de `company-data.ts` |
| `verificar_cobertura` | Local | ✅ real | Cobertura por bairro específico ou `'*'` para listar todos |
| `registrar_interesse` | Supabase | ✅ real | Lead prospect salvo em `leads` |
| `registrar_negociacao` | Supabase | ✅ real | Acordo de parcelamento formalizado |
| `marcar_churn_risk` | Supabase | ✅ real | Flag `churn_risk=true` no thread |
| `detectar_apagao_bairro` | Supabase | ✅ real | ≥ 2 relatos no bairro em 2h = apagão em andamento |
| `transferir_humano` | Supabase | ✅ real | Flag `human_mode=true`; desliga bot até reset manual pelo admin |
| `listar_chamados` | SGP | ❌ stub | Retorna `[]` — endpoint não disponível com token auth |
| `solicitar_upgrade` | — | ❌ stub | Fila de análise manual — sem endpoint SGP |
| `aplicar_cortesia` | — | ❌ stub | Fila de análise manual — sem endpoint SGP |

### Segurança

| Mecanismo | Arquivo | O que protege |
|-----------|---------|--------------|
| Sanitização de input | `sanitize.ts` | Trunca 2000 chars, remove 15 padrões de prompt injection PT+EN |
| Validação HMAC webhook | `evolution-go.ts` | Rejeita payloads não assinados pelo Evolution Go |
| Rate limiter por IP | `rateLimiter.ts` | Anti-spam, anti-flood |
| Guard `isHumanMode` | `processor.ts` | Não processa quando atendente humano ativo |
| Guard phone/body undefined | `index.ts` | Descarta eventos mal-formados antes do agente |
| Dados sensíveis removidos | `processor.ts` | `contratoCentralSenha`, `contratoCentralLogin` excluídos do prompt |

---

## Painel Admin

Rota: `/admin` (protegido por JWT com role `admin` via Supabase Auth)

| Página | Rota | Dados |
|--------|------|-------|
| Conversas | `/admin/conversas` | Threads com filtros: bot / humano / churn |
| Campanhas | `/admin/campanhas` | Histórico de envios por tipo |
| Churn Risks | `/admin/churn-risks` | Clientes flagados com enriquecimento SGP |
| Métricas | `/admin/metricas` | KPIs: total conversas, bot resolution rate, receita recuperada, campanhas |
| **Relatório ROI** | `/admin/relatorio-roi` | Métricas por período: resolução, tempo resposta, PIX, leads, NPS |
| Configurações | `/admin/configuracoes` | Status WhatsApp + QR Code |

### Endpoint ROI (`GET /api/admin/reports/roi?days=30`)

Parâmetros: `days` — inteiro entre 1 e 90 (default: 30).

```json
{
  "period_days": 30,
  "taxa_resolucao_sem_humano": 87,
  "tempo_medio_resposta_ms": 2340,
  "sessoes_por_modo": { "billing": 42, "support": 31, "default": 18, "prospect": 12 },
  "pix_gerados": 38,
  "leads_qualificados": 9,
  "chamados_abertos": 14,
  "nps_medio": 4.2,
  "nps_total_respostas": 67
}
```

`tempo_medio_resposta_ms` requer migration `012_add_processing_ms.sql` aplicada no Supabase (dados acumulados a partir do deploy).

---

## Automações

| Automação | Cron | Condição | Ação |
|-----------|------|----------|------|
| Cobrança D-5 | 09:00 diário | Pagadores habituais com fatura a 5 dias | Lembrete proativo |
| Cobrança D-2 | 09:00 diário | Pagadores habituais com fatura a 2 dias | Lembrete proativo |
| Cobrança D+3 | 10:00 diário | Qualquer cliente com 3 dias de atraso | Aviso com PIX |
| Suspensão D+5 | 10:00 diário | 5 dias de atraso | Aviso de corte iminente |
| Lembrete visita | 08:00 diário | `scheduled_visits` com `visit_date` = amanhã | Confirma data e período |
| Follow-up pós-visita | 10:00 diário | `visit_date` = ontem, `status=scheduled` | "Problema foi resolvido?" |
| Upsell | Cron diário | Clientes ≤ 30 Mbps sem tickets abertos | Oferta de upgrade |
| Churn outreach | Cron diário | `churn_risk=true` no thread | Mensagem de retenção |
| Indicação | Cron diário | Clientes ativos > 60 dias | Campanha de referral |
| Expansão | Cron diário | Prospects fora da cobertura | Aviso quando bairro for coberto |
| Health check WhatsApp | A cada 5min | Sempre | Verifica/reconecta instância |
| Webhook pagamento SGP | Evento | Confirmação de pagamento | Ativa fluxo pós-pagamento |

`getHabitualLatePayerIds()` consulta `billing_notifications` no Supabase — não o SGP (sem endpoint bulk).

---

## Banco de dados (Supabase)

| Tabela | Escrita por | Lida por |
|--------|-------------|---------|
| `conversation_threads` | `memory.ts`, `tools.ts` | `processor.ts`, `admin.ts` |
| `interaction_logs` | `processor.ts` (inclui `processing_ms`) | `reports.ts`, `customer-memory.ts` |
| `nps_responses` | `nps-flow.ts` | `reports.ts` |
| `whatsapp_instances` | `instance-manager.ts` | `webhook-router.ts`, `bootstrap.ts` |
| `leads` | `tools.ts` (registrar_interesse) | painel admin |
| `scheduled_visits` | `tools.ts` (agendar_visita) | automations (lembrete 24h) |
| `outage_reports` | `tools.ts` (abrir_chamado técnico) | `tools.ts` (detectar_apagao_bairro) |
| `billing_notifications` | automações de cobrança | automações (dedup), `getHabitualLatePayerIds` |
| `churn_risks` | `tools.ts` (marcar_churn_risk) | `admin.ts` |
| `campaign_sends` | automações de campanha | `admin.ts` |

Migrations em `backend/src/db/migrations/` (executar no Supabase SQL Editor em ordem):
- `schema.sql` — tabelas base
- `002_enable_rls.sql`
- `003_add_session_mode_to_interaction_logs.sql`
- `011_nps.sql` — tabela `nps_responses`
- `012_add_processing_ms.sql` — coluna `processing_ms` em `interaction_logs`

---

## Gaps para tornar Sofia a melhor agente ISP do mercado

Esta seção mapeia o que falta para elevar Sofia de "atendente muito competente" para "referência de mercado em atendimento ISP via WhatsApp". Listado por impacto estimado.

### Alta prioridade

| Capacidade | Status atual | Por que importa |
|-----------|-------------|-----------------|
| **Classificador de sessão semântico** | Regex puro | Mensagens ambíguas ("tá lento de vez em quando") classificadas errado → contexto errado no prompt → resposta pior |
| **Histórico real de chamados** | `listar_chamados` retorna `[]` | Sofia não sabe se há um chamado aberto para o problema → pode abrir duplicata, criar frustração |
| **Suporte a imagem** (comprovante de pagamento) | Não existe | Cliente manda foto do pix pago → Sofia não vê; causa escalada desnecessária para humano |
| **Suporte a áudio** (mensagem de voz) | Não existe | >40% das mensagens WhatsApp de usuários mais velhos são áudio; todos ignorados hoje |
| **Cobertura dinâmica via SGP** | Lista hardcoded em `company-data.ts` | Nova rua coberta → precisa de deploy para Sofia saber |

### Média prioridade

| Capacidade | Status atual | Por que importa |
|-----------|-------------|-----------------|
| **Script de diagnóstico de velocidade** | Não existe | Sofia deveria pedir "acesse fast.com e me manda o resultado" antes de abrir chamado — reduz visitas desnecessárias |
| **Suspensão / reativação real** | Stubs | Admin precisa fazer manualmente pelo SGP — gargalo operacional |
| **Memória semântica cross-session** | Só sinals de `customer-memory.ts` | Sofia não "lembra" que o cliente pediu upgrade há 2 semanas e ainda não foi atendido |
| **NPS com follow-up em score baixo** | Só salva o score | Score 1-2 deveria acionar transferência automática para humano / campanha de retenção |
| **Quick-reply com contexto de cliente** | coverage_check sem contexto | Cliente ativo que pergunta cobertura pode estar pensando em mudança de endereço — quick-reply não capta isso |

### Baixa prioridade / infraestrutura

| Capacidade | Status atual | Por que importa |
|-----------|-------------|-----------------|
| **A/B testing de prompt/resposta** | Não existe | Sem como medir qual abordagem retém mais clientes |
| **Multi-tenant** | Single-tenant com `DEFAULT_TENANT_ID` | Próximo ISP cliente requer deploy separado hoje |
| **Adaptadores de ERP** | Acoplado ao SGP TSMX | Provedor com outro ERP requer reescrita das integrações |
| **Cancelamento com salvaguardas** | Sempre transfere para humano | Poderia ter uma tela de "motivos + contra-oferta automática" antes da transferência |
| **Detecção de linguagem** | Assume português | Comunidades de outros estados ou turistas podem escrever em outro idioma |

---

## Planos e cobertura (fonte: `company-data.ts`)

| Plano | Download | Upload | Preço | Popular |
|-------|----------|--------|-------|---------|
| Basic | 20 Mbps | 10 Mbps | R$ 50/mês | — |
| Turbo | 50 Mbps | 25 Mbps | R$ 70/mês | — |
| Ultra | 100 Mbps | 50 Mbps | R$ 90/mês | ✓ |
| Giga | 300 Mbps | 150 Mbps | R$ 130/mês | — |

Desconto: R$ 10 pagando até o vencimento. Instalação gratuita. Fidelidade 12 meses.

Bairros cobertos: Jardim Guanabara · Jardim Iracema · Quintino Cunha · Vila Velha · Nova Assunção.

---

## Variáveis de ambiente (backend)

```env
# ── Servidor ──────────────────────────────────────────
PORT=3001
NODE_ENV=production
BACKEND_URL=https://salesnet-production.up.railway.app
CORS_ORIGIN=https://salesnet-green.vercel.app

# ── WhatsApp (Evolution Go) ───────────────────────────
WHATSAPP_PROVIDER=evolution-go
EVOLUTION_API_URL=https://evolution-go-production-xxxx.up.railway.app
EVOLUTION_API_KEY=<global_apikey>
EVOLUTION_INSTANCE_NAME=salesnet
EVOLUTION_INSTANCE_TOKEN=<token_da_instancia>
EVOLUTION_WEBHOOK_SECRET=<hmac_secret>     # opcional mas recomendado em produção

# ── ERP (SGP TSMX) ────────────────────────────────────
SGP_BASE_URL=https://salesnet.sgp.tsmx.com.br
SGP_API_TOKEN=<uuid>
SGP_APP_NAME=Ronald
SGP_WEBHOOK_SECRET=<hmac_secret>           # opcional mas recomendado em produção

# ── LLM ──────────────────────────────────────────────
LLM_ROUTING_MODE=tiered                    # tiered ou single
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
```

---

## Executar localmente

```sh
# Frontend (porta 8080)
npm install && npm run dev

# Backend (porta 3001)
cd backend
npm install
cp .env.example .env   # preencha as variáveis
npm run dev

# Verificar
curl http://localhost:3001/health
```

---

## Estrutura do repositório

```
.
├── src/                          # Frontend React
│   ├── pages/
│   │   ├── admin/                # Conversas, Metrics, Reports, CampaignManager, ChurnRiskList, Configurações
│   │   └── ...                   # Site institucional, portal cliente
│   ├── api/admin.ts              # Cliente HTTP admin (inclui getRoiReport)
│   └── lib/
├── backend/
│   ├── src/
│   │   ├── agent/
│   │   │   ├── processor.ts      # Orquestrador principal — ler primeiro
│   │   │   ├── tools.ts          # 18 ferramentas da Sofia
│   │   │   ├── prompt.ts         # System prompt base + contextos por modo
│   │   │   ├── nps-flow.ts       # Fluxo NPS: schedule, parse, save
│   │   │   ├── customer-memory.ts# Insights cross-session do cliente
│   │   │   ├── quick-reply.ts    # FAQ sem LLM
│   │   │   ├── sanitize.ts       # Proteção contra prompt injection
│   │   │   ├── session-classifier.ts
│   │   │   ├── complexity-router.ts
│   │   │   ├── memory.ts         # Histórico de conversa no Supabase
│   │   │   └── company-data.ts   # Fonte única: planos, bairros, políticas
│   │   ├── automations/          # Cron: cobrança, visitas, campanhas
│   │   ├── integrations/
│   │   │   ├── sgp/              # billing, customers, tickets, network
│   │   │   └── whatsapp/         # Evolution Go provider
│   │   ├── routes/
│   │   │   ├── admin.ts          # Conversas, métricas, campanhas, QR
│   │   │   ├── reports.ts        # GET /api/admin/reports/roi
│   │   │   └── ...
│   │   ├── db/migrations/        # SQLs para o Supabase
│   │   └── index.ts              # Express entrypoint
│   └── package.json
└── docs/
    └── doc.md                    # Visão de produto e escalabilidade multi-tenant
```

---

## Scripts

```sh
# Frontend
npm run dev | build | lint

# Backend
cd backend
npm run dev        # hot-reload (ts-node-dev)
npm run build      # compila TypeScript
npm run start      # produção
npm test           # jest --runInBand
npx tsc --noEmit -p tsconfig.json   # type check sem compilar
```

---

**SalesNet Telecom** — Fortaleza/CE
