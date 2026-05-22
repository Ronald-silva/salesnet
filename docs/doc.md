# SalesNet — Plataforma de Operação, Atendimento e Crescimento para Provedor

Este documento descreve, com clareza, **o que este projeto realiza (e pretende realizar) para a SalesNet Telecom**, e **como desenhar evolução escalável** para replicar a mesma lógica em **outros provedores** sem refazer o produto do zero.

---

## 1. Resumo executivo

A SalesNet hoje combina três frentes que, juntas, raramente existem em um único software no mercado de ISPs de porte regional:

1. **Canal digital de captação e presença** (site institucional moderno, formulários, WhatsApp).
2. **Operação integrada ao ERP** (SGP), com **agente de IA** que conversa no WhatsApp (Twilio) e executa **ações reais** via ferramentas (fatura, PIX, chamados, conexão, etc.).
3. **Automações de negócio**: lembretes de cobrança, campanhas, webhooks de pagamento e painel administrativo para supervisão humana.

O objetivo estratégico é simples de enunciar e difícil de copiar na prática: **menos retrabalho humano, menos inadimplência evitável, mais velocidade de resposta e dados únicos para decisão comercial e de churn.**

---

## 2. O que o projeto realiza hoje na SalesNet (estado atual no código)

Esta seção reflete o repositório como está implementado, não uma promessa de roadmap.

### 2.1 Frontend (React + Vite)

- **Site institucional**: páginas de planos, cobertura, suporte, hotspots, trabalhe conosco, contato, sobre.
- **Widget de “assistente” no site**: experiência de chat no navegador (respostas locais/simuladas para UX); **o canal operacional principal da Sofia é o WhatsApp via backend**, não esse widget isolado.
- **Portal do cliente** (`/minha-conta`): fluxo com OTP e áreas de **fatura, conexão, chamados, indicações**, conforme rotas existentes.
- **Painel administrativo** (`/admin`): conversas, métricas, campanhas, churn risks e placeholders para expansão (clientes, financeiro, rede, configurações).

### 2.2 Backend (Node + Express, pasta `backend/`)

- **Webhook Twilio** (`POST /webhook/twilio`): recebe mensagens WhatsApp, valida assinatura em produção e dispara o **agente IA**.
- **Webhook SGP** (`/webhook/sgp/*`): exemplo central é confirmação de pagamento para reativar fluxos pós-pagamento (integração com automações).
- **API de autenticação do portal** (`/api/auth`): OTP e sessão para o cliente.
- **API do portal** (`/api/client`): dados do cliente alinhados ao SGP (fatura, conexão, chamados, etc.).
- **API admin** (`/api/admin`): operações internas (campanhas sob middleware de admin, etc.).
- **Automações agendadas** (`node-cron`): jobs diários de **cobrança** (D-3, D0, atraso, suspensão) e **módulo de campanhas** (expansão, indicação, upsell, churn risk, etc., conforme implementado).
- **Agente IA**:
  - Usa **Anthropic (Claude)** via SDK oficial.
  - Pode usar **DeepSeek** via API HTTP compatível (OpenAI-style), com **fallback** configurável.
  - **Roteamento por complexidade** (`LLM_ROUTING_MODE=tiered`): heurística local (sem LLM extra) que tende a baratear respostas simples e reservar casos sensíveis para o modelo mais forte.
  - **Tool-calling** com integração SGP: busca de cliente, fatura, PIX, chamados, conexão, upgrade, transferência humana, cobertura, risco de churn, etc.
- **Supabase**: memória de conversa, logs de interação, suporte a features operacionais (ex.: flags de conversa, rastreio de notificações de cobrança/campanhas conforme schema).

### 2.3 Integrações externas

| Sistema | Papel |
|--------|--------|
| **Twilio** | WhatsApp Business API: entrada e saída de mensagens. |
| **SGP (TSMX)** | Fonte de verdade comercial e operacional: clientes, faturas, rede, chamados. |
| **Supabase** | Banco de apoio (Postgres) para o produto, não substitui o ERP. |
| **Anthropic / DeepSeek** | Motores de linguagem; escolha e fallback por variáveis de ambiente. |

---

## 3. O que o projeto se propõe a entregar ao provedor (visão de produto)

Além do que já está no código, a **direção de produto** é:

- **Atendimento 24h** com respostas acionáveis (não só FAQ), respeitando regras de negócio e transferência humana quando necessário.
- **Cobrança inteligente**: lembretes no tempo certo, com antispam e rastreio, reduzindo perda por esquecimento.
- **Campanhas e retenção**: gatilhos comerciais (upsell, indicação, risco de churn) com governança (admin, limites, logs).
- **Uma base de dados de interação** (Supabase) que permite, no futuro, **BI**, **SLA** e **auditoria** (LGPD, qualidade de atendimento).

---

## 4. Escalabilidade: expandir para outros provedores

Hoje o repositório está “vestido” de **SalesNet** (marca, textos, integração SGP). Para **escalar o mesmo produto** a múltiplos ISPs, o caminho maduro — que ainda é evolução de arquitetura, não algo totalmente extraído no código — é:

### 4.1 Multi-tenant (obrigatório para “um produto, N marcas”)

- **Identificador de tenant** em toda requisição (subdomínio, header, ou rota).
- **Configuração por tenant**: nomes, logos, planos, bairros, regras de desconto, canais Twilio, chaves SGP, limites de campanha.
- **Isolamento de dados**: schemas ou `tenant_id` em todas as tabelas de produto no Postgres.

### 4.2 Adaptadores de ERP (“SGP hoje, outro amanhã”)

- Interface única no backend (`BillingPort`, `CustomerPort`, `TicketsPort`…) com **implementação SGP** e, no futuro, **outro ERP** por tenant.
- Isso evita que regras de negócio fiquem espalhadas em `if (sgp)`.

### 4.3 Canais e identidade

- **Um número WhatsApp por tenant** (ou pool), mapeado no Twilio.
- **Prompts e políticas de IA por tenant** (tom, palavras proibidas, escopo de tools).

### 4.4 Observabilidade e custo

- **Métricas por tenant**: tokens, resolução, escalonamento humano, conversão de campanha.
- **Limites**: orçamento mensal de IA por tenant para não explodir custo em um único cliente corporativo.

---

## 5. Ideias que podem ser divisor de água (além do óbvio)

Coisas que muitos provedores **não** entregam juntas; implementação é trabalhosa, mas o posicionamento é forte.

### 5.1 “ISP Copilot” com memória de causa raiz

Não só responder, mas **registrar padrão**: mesma fibra, mesmo bairro, mesma OLT com picos de chamados → alerta proativo para NOC **antes** do cliente ir ao Procon.

### 5.2 Score de saúde do cliente (propensity to churn)

Unificar: atraso, tickets, sentimento no texto, uso de banda (quando disponível no ERP) → **lista priorizada** para retenção humana ou campanha automática.

### 5.3 Compliance e confiança B2B

Trilha de auditoria: **quem** autorizou desconto, **qual** versão do prompt, **qual** tool rodou com **quais** dados. Isso vende para grupos maiores e reduz risco jurídico.

### 5.4 API pública white-label

Permitir que o provedor grande **incorpore** seu próprio app ou CRM chamando sua API de conversa/campanha — você vira **plataforma**, não só painel.

### 5.5 Modo “revenue ops”

Dashboard que liga **campanha → conversão → ARPU → churn** no mesmo gráfico. Operadores de rede raramente têm isso integrado ao WhatsApp.

---

## 6. Documentos relacionados

- `README.md` — como rodar, deploy, variáveis e stack.
- `docs/DEPLOY-CHECKLIST.md` — ordem prática de deploy (Railway + Vercel + webhooks).

---

## 7. Nota final

Este projeto já é **ambicioso na integração real** (WhatsApp + ERP + IA + automações). O salto para **multi-provedor** é principalmente **modelagem de dados, tenants e adaptadores** — não reescrever o frontend do zero. Investir nisso cedo evita acoplamento que custa caro para desfazer depois.
