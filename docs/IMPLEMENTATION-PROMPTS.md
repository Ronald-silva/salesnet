# SalesNet Platform — Prompts de Implementação por Etapa

Cole o **CONTEXTO MASTER** uma vez no início de cada chat novo.
Depois cole apenas o prompt da etapa que vai trabalhar.

---

## CONTEXTO MASTER (cole sempre no início de cada chat)

```
Projeto: SalesNet Telecom — Transformação de site institucional em plataforma completa de gestão para ISP (provedor de internet fibra óptica) em Fortaleza/CE.

## O que já existe
- Site React + Vite + TypeScript + shadcn/ui + Tailwind CSS em /mnt/hd/SALESNET
- 8 páginas: Home, Planos, Cobertura, Suporte, Hotspots, TrabalheConosco, Contato, Sobre
- Design system: tema dark navy + verde neon (accent: HSL 152 100% 50%)
- React Router v6, TanStack Query instalado, Supabase disponível

## Stack do novo sistema
- Backend: Node.js + TypeScript + Express (novo serviço em /mnt/hd/SALESNET/backend)
- Banco de dados: Supabase (PostgreSQL + Auth + Realtime)
- WhatsApp: Twilio (API oficial Meta — novo número Business dedicado)
- IA: Claude Anthropic API (claude-sonnet-4-5) com Tool Use
- ERP: SGP TSMX (API REST em https://bookstack.sgp.net.br/books/api/)
- Deploy: VPS com Docker + Docker Compose
- Frontend: React existente expandido com /minha-conta e /admin

## Escala atual
- 1.000 clientes ativos
- 50–100 mensagens WhatsApp/dia
- Planos: 20/30/50/100 Mbps — R$50/60/70/90 (com desconto por pontualidade)
- Bairros: Jardim Guanabara, Jardim Iracema, Quintino Cunha, Vila Velha, Nova Assunção

## Número WhatsApp real (PlanCard.tsx)
- 5585996032957

## Arquitetura geral
Twilio (webhook) → Express backend → Claude AI (tool use) → SGP API
                                   ↘ Supabase (threads, logs, campanhas)
                                   ↘ Twilio (envio de resposta)

## Módulos a construir (em ordem)
1. SGP Integration Layer (client de API)
2. Twilio WhatsApp handler (webhook + envio)
3. Claude AI Agent com Tool Use
4. Cron jobs de cobrança (D-3, D0, D+3, D+5)
5. Motor de campanhas (upsell, indicação, churn risk)
6. Portal do Cliente React (/minha-conta)
7. Dashboard Admin React (/admin)
8. Monitoramento de rede
```

---

## ETAPA 1 — Setup do Projeto Backend

```
[Cole o CONTEXTO MASTER acima primeiro]

Crie a estrutura completa do backend Node.js + TypeScript do projeto SalesNet.

Dentro de /mnt/hd/SALESNET/backend, inicialize o projeto com:

1. Estrutura de pastas:
backend/
├── src/
│   ├── config/          # variáveis de ambiente
│   ├── integrations/
│   │   ├── sgp/         # cliente SGP API
│   │   └── twilio/      # cliente Twilio WhatsApp
│   ├── agent/           # Claude AI + tools
│   ├── automations/     # cron jobs de cobrança e campanhas
│   ├── routes/          # Express routes (webhooks, API interna)
│   ├── services/        # lógica de negócio
│   └── index.ts         # entry point
├── docker/
├── package.json
├── tsconfig.json
└── .env.example

2. Instale as dependências:
- express, @types/express
- typescript, ts-node, @types/node
- @anthropic-ai/sdk (Claude)
- twilio
- @supabase/supabase-js
- node-cron
- zod (validação)
- dotenv

3. Configure tsconfig.json com target ES2022, module commonjs, strict true.

4. Crie src/config/env.ts que valida e exporta todas as variáveis de ambiente necessárias:
- ANTHROPIC_API_KEY
- TWILIO_ACCOUNT_SID
- TWILIO_AUTH_TOKEN
- TWILIO_WHATSAPP_NUMBER (o novo número Business)
- SGP_BASE_URL
- SGP_API_TOKEN
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- PORT (default 3001)

5. Crie o src/index.ts com Express básico, health check em GET /health, e log de startup.

6. Crie docker-compose.yml na raiz do backend com o serviço Node.js mapeando porta 3001.

7. Crie .env.example com todas as variáveis sem valores.

Não implemente a lógica de negócio ainda — apenas a estrutura e configuração.
```

---

## ETAPA 2 — SGP Integration Layer

```
[Cole o CONTEXTO MASTER acima primeiro]

Implemente o cliente de integração com a API do SGP TSMX em /mnt/hd/SALESNET/backend/src/integrations/sgp/.

A documentação da API está em https://bookstack.sgp.net.br/books/api/

Crie os seguintes arquivos:

### src/integrations/sgp/client.ts
Cliente base com:
- Axios configurado com baseURL = SGP_BASE_URL
- Header de autenticação: Authorization: Bearer SGP_API_TOKEN
- Interceptor de erro com log
- Timeout de 10s

### src/integrations/sgp/customers.ts
Funções de clientes:
- getCustomerByPhone(phone: string) → busca cliente pelo telefone (normalizar para +55DDNÚMERO)
- getCustomerById(id: string) → dados completos do cliente
- getCustomerPlan(customerId: string) → plano atual

### src/integrations/sgp/billing.ts
Funções de financeiro:
- getCurrentInvoice(customerId: string) → fatura atual com status e valor
- generatePixKey(invoiceId: string) → gera chave PIX/copia-e-cola via SGP
- getOverdueCustomers(daysOverdue: number) → lista inadimplentes por dias de atraso
- getCustomersDueInDays(days: number) → clientes com vencimento em X dias
- suspendCustomer(customerId: string) → suspende acesso
- reactivateCustomer(customerId: string) → reativa após pagamento

### src/integrations/sgp/tickets.ts
Funções de chamados:
- openTicket(customerId: string, type: string, description: string) → abre OS no SGP
- getCustomerTickets(customerId: string) → últimos 5 chamados
- scheduleVisit(customerId: string, date: string, period: 'morning' | 'afternoon') → agenda visita técnica

### src/integrations/sgp/network.ts
Funções de rede:
- getConnectionStatus(customerId: string) → online/offline + velocidade atual
- getNetworkNodeStatus() → status dos nós por bairro

### src/integrations/sgp/types.ts
Interfaces TypeScript para todos os tipos retornados pelo SGP.

Ao final, crie src/integrations/sgp/index.ts que exporta tudo.

Use Zod para validar as respostas da API SGP antes de retornar.
```

---

## ETAPA 3 — Twilio WhatsApp Handler

```
[Cole o CONTEXTO MASTER acima primeiro]

Implemente o handler do Twilio WhatsApp em /mnt/hd/SALESNET/backend/src/integrations/twilio/.

### src/integrations/twilio/client.ts
- Inicializa o cliente Twilio com TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN
- Exporta a instância

### src/integrations/twilio/sender.ts
Funções de envio:
- sendMessage(to: string, body: string) → envia mensagem de texto simples
- sendTemplate(to: string, templateSid: string, variables: Record<string,string>) → envia template aprovado pela Meta
- sendMediaMessage(to: string, body: string, mediaUrl: string) → com imagem/PDF

Todos os números formatados como whatsapp:+55DDNÚMERO

### src/integrations/twilio/webhook.ts
- Express Router em POST /webhook/twilio
- Valida assinatura do Twilio (middleware validateTwilioSignature)
- Extrai: From (número do cliente), Body (mensagem), ProfileName
- Normaliza o número removendo "whatsapp:" prefix
- Publica evento no serviço de mensagens para processamento assíncrono
- Retorna 200 imediatamente (Twilio exige resposta rápida)

### src/integrations/twilio/templates.ts
Objeto com os SIDs dos templates aprovados:
- BILLING_REMINDER_D3
- BILLING_REMINDER_D0
- BILLING_OVERDUE_D3
- BILLING_SUSPENDED_D5
- UPSELL_OFFER
- REFERRAL_REQUEST
- CHURN_RISK_OUTREACH

Registre a rota do webhook no src/index.ts.
```

---

## ETAPA 4 — Claude AI Agent com Tool Use

```
[Cole o CONTEXTO MASTER acima primeiro]

Implemente o AI Agent em /mnt/hd/SALESNET/backend/src/agent/.

### src/agent/tools.ts
Defina todas as tools que o Claude pode chamar. Use o formato de Tool Use da Anthropic SDK:

Tools a implementar (cada uma chama a respectiva função do SGP):
1. buscar_cliente — busca cliente pelo telefone, retorna nome/plano/status
2. get_fatura_atual — retorna valor, vencimento, status, chave PIX
3. gerar_pix — gera copia-e-cola PIX da fatura em aberto
4. listar_chamados — últimos 5 chamados do cliente
5. abrir_chamado — abre OS de suporte (tipo: tecnico, financeiro, comercial)
6. agendar_visita — agenda visita técnica com data e período
7. status_conexao — verifica se está online e velocidade atual
8. solicitar_upgrade — inicia processo de upgrade de plano
9. aplicar_cortesia — aplica desconto/cortesia na fatura atual
10. transferir_humano — pausa bot e notifica atendente no dashboard
11. verificar_cobertura — verifica se CEP tem cobertura
12. marcar_churn_risk — registra cliente como risco de cancelamento no Supabase

### src/agent/memory.ts
Gerencia threads de conversa no Supabase:
- getThread(phone: string) → busca/cria thread com histórico das últimas 20 mensagens
- saveMessage(phone: string, role: 'user'|'assistant', content: string) → persiste mensagem
- isHumanMode(phone: string) → verifica se conversa está com humano
- setHumanMode(phone: string, active: boolean) → ativa/desativa modo humano

Schema Supabase necessário:
- tabela conversation_threads: id, phone, messages (jsonb), human_mode (bool), churn_risk (bool), created_at, updated_at

### src/agent/prompt.ts
System prompt do Claude:
- Identidade: Atendente virtual da SalesNet Telecom
- Regras de negócio: planos, preços, descontos, política de cancelamento
- Quando escalar para humano: ameaça jurídica, raiva extrema, solicitação explícita
- Tom: cordial, direto, brasileiro informal mas profissional
- Sempre chamar o cliente pelo primeiro nome
- Nunca inventar informações — usar apenas o que as tools retornam

### src/agent/processor.ts
Função principal processMessage(phone: string, message: string):
1. Checa se está em human_mode → se sim, ignora (humano está atendendo)
2. Busca/cria thread no Supabase
3. Adiciona mensagem do usuário ao histórico
4. Primeira tool call obrigatória: buscar_cliente(phone) para ter contexto
5. Chama Claude com messages + tools + system prompt
6. Loop de tool use: executa tools que o Claude solicitar, adiciona resultados
7. Obtém resposta final do Claude
8. Salva resposta no thread
9. Envia resposta via Twilio sender
10. Log da interação no Supabase (tabela interaction_logs)

Use claude-sonnet-4-5 e max_tokens: 1024.
```

---

## ETAPA 5 — Automação de Cobrança (Cron Jobs)

```
[Cole o CONTEXTO MASTER acima primeiro]

Implemente os cron jobs de cobrança em /mnt/hd/SALESNET/backend/src/automations/.

### src/automations/billing-reminders.ts

Implemente 4 jobs usando node-cron, todos rodando às 8h00 todo dia:

job_d3 (todo dia 8h):
- Chama SGP getCustomersDueInDays(3)
- Para cada cliente: envia template BILLING_REMINDER_D3 via Twilio
- Variáveis do template: nome, valor_com_desconto, data_vencimento, chave_pix
- Log no Supabase tabela billing_notifications: customer_id, type='d3', sent_at

job_d0 (todo dia 8h):
- Chama SGP getCustomersDueInDays(0)
- Envia template BILLING_REMINDER_D0
- Log no Supabase

job_d3_overdue (todo dia 8h):
- Chama SGP getOverdueCustomers(3)
- Filtra quem já recebeu notificação D3 (verificar Supabase, não duplicar)
- Envia template BILLING_OVERDUE_D3
- Log no Supabase

job_d5_suspend (todo dia 8h):
- Chama SGP getOverdueCustomers(5)
- Chama SGP suspendCustomer() para cada um
- Envia template BILLING_SUSPENDED_D5
- Log no Supabase

### src/automations/payment-webhook.ts
Rota POST /webhook/sgp/payment-confirmed:
- Recebe evento do SGP quando pagamento é confirmado
- Cancela notificações pendentes (marca no Supabase como cancelled)
- Chama SGP reactivateCustomer() se estava suspenso
- Envia mensagem de confirmação amigável via Twilio:
  "João, pagamento confirmado! ✅ Sua internet está ativa. Obrigado!"

### src/automations/index.ts
Inicializa todos os cron jobs e exporta função startAutomations().
Chamar startAutomations() no src/index.ts na inicialização.

### Anti-spam logic
Antes de enviar qualquer notificação de cobrança, verificar no Supabase:
- Se o cliente já recebeu aquele tipo de notificação hoje → skip
- Se o cliente pagou após a última notificação → cancelar todas as pendentes
```

---

## ETAPA 6 — Motor de Campanhas

```
[Cole o CONTEXTO MASTER acima primeiro]

Implemente o motor de campanhas em /mnt/hd/SALESNET/backend/src/automations/campaigns/.

### campaigns/upsell.ts
Job semanal (toda segunda às 10h):
- Consulta SGP: clientes no plano 20Mbps ou 30Mbps há mais de 60 dias sem chamado técnico aberto
- Filtra: não enviou campanha de upsell nos últimos 30 dias (verificar Supabase tabela campaign_sends)
- Envia mensagem personalizada via Twilio (não template — mensagem livre):
  "Oi [nome]! 🚀 Você usa [X]Mbps há [N] meses sem problemas. Por R$[diferença]/mês a mais você vai para [próximo plano]Mbps. Quer testar 7 dias grátis? Responda SIM."
- Se cliente responder SIM → Claude agent assume e finaliza upgrade via SGP

### campaigns/referral.ts
Job diário (todo dia às 9h):
- Consulta SGP: clientes com 30 dias exatos de ativação e sem chamados abertos
- Gera link único: salesnet.com.br/indicar?ref=[customer_id_hash]
- Salva link no Supabase tabela referral_links: customer_id, code, created_at, conversions (int)
- Envia via Twilio:
  "Oi [nome]! Curtindo a internet? 😊 Indique um amigo e ganhe 1 mês de desconto! Seu link: [link]"

### campaigns/churn-risk.ts
Job diário (todo dia às 8h30):
- Regras de churn risk (qualquer uma = risco):
  a) 3+ chamados técnicos abertos no mesmo mês
  b) Atraso recorrente (2+ meses seguidos atrasados)
  c) Chamado de cancelamento registrado nos últimos 7 dias
- Marca no Supabase tabela churn_risks: customer_id, reason, level (low/medium/high), created_at
- Para nível high: dispara mensagem proativa:
  "Oi [nome], percebemos que você teve algumas dificuldades ultimamente. Posso te ajudar? Um técnico pode ir até você amanhã sem custo adicional."
- Aparece no dashboard admin na lista de churn risks

### campaigns/expansion.ts
Função manual acionada pelo admin via POST /api/campaigns/expansion:
- Recebe: { neighborhood: string, message: string }
- Consulta Supabase tabela waitlist (emails/telefones cadastrados no site)
- Filtra por bairro
- Dispara mensagem via Twilio para toda a lista filtrada
- Rate limit: 50 mensagens/minuto para respeitar limites do Twilio

### campaigns/index.ts
Inicializa todos os jobs de campanha.
```

---

## ETAPA 7 — Portal do Cliente (React Frontend)

```
[Cole o CONTEXTO MASTER acima primeiro]

Adicione o Portal do Cliente ao site React existente em /mnt/hd/SALESNET/src/.

### Rota nova: /minha-conta
Adicionar em src/App.tsx:
- Route path="/minha-conta" → ClientPortal
- Route path="/minha-conta/login" → ClientLogin

### src/pages/ClientLogin.tsx
Fluxo de login por OTP:
1. Tela 1: campo de telefone com máscara (85) 99999-9999
2. Ao submeter: POST /api/auth/request-otp → backend chama Twilio para enviar OTP via WhatsApp
3. Tela 2: campo de 6 dígitos para o código
4. Ao verificar: POST /api/auth/verify-otp → backend verifica + cria sessão Supabase
5. Redireciona para /minha-conta

### src/pages/ClientPortal.tsx
Layout com 4 seções (tabs mobile-friendly):

Tab 1 — Início:
- Card de fatura atual: valor, vencimento, status, botão "Copiar PIX"
  (GET /api/client/invoice → backend busca no SGP)
- Card de status da conexão: online/offline, velocidade atual
  (GET /api/client/connection → backend busca no SGP)
- Botão de upgrade de plano se estiver no 20 ou 30Mbps

Tab 2 — Chamados:
- Lista de chamados abertos e histórico (GET /api/client/tickets)
- Botão "Abrir Chamado" com select de tipo + descrição
  (POST /api/client/tickets → backend cria no SGP)

Tab 3 — Indicações:
- Exibe link único de indicação (GET /api/client/referral)
- Contador de indicações enviadas e convertidas
- Botão "Compartilhar no WhatsApp" (abre wa.me com mensagem pré-pronta)
- Créditos ganhos até o momento

Tab 4 — Histórico:
- Lista de faturas dos últimos 12 meses com status
  (GET /api/client/invoices → backend busca no SGP)

### src/api/client.ts
Funções fetch para o portal:
- Todas as chamadas incluem Authorization: Bearer [supabase_jwt]
- Backend valida JWT e identifica o cliente pelo phone do Supabase Auth

### Backend routes necessárias (adicionar ao Express):
- POST /api/auth/request-otp
- POST /api/auth/verify-otp
- GET /api/client/invoice
- GET /api/client/connection
- GET /api/client/tickets
- POST /api/client/tickets
- GET /api/client/referral
- GET /api/client/invoices
```

---

## ETAPA 8 — Dashboard Admin (React Frontend)

```
[Cole o CONTEXTO MASTER acima primeiro]

Adicione o Dashboard Admin ao site React existente em /mnt/hd/SALESNET/src/.

### Rota nova: /admin (protegida)
Adicionar em src/App.tsx com guard de autenticação:
- Route path="/admin/*" → AdminDashboard (redireciona para /admin/login se não autenticado)
- Login: email + senha via Supabase Auth (apenas role admin)

### src/pages/admin/AdminLayout.tsx
Layout base com sidebar de navegação:
- Conversas (ícone chat)
- Clientes (ícone users)
- Campanhas (ícone megaphone)
- Financeiro (ícone dollar)
- Rede (ícone wifi)
- Configurações (ícone settings)

### src/pages/admin/Conversations.tsx
Painel principal — dividido em 2 colunas:

Coluna esquerda (lista):
- Lista de conversas ativas com: nome, número, último texto, badge Bot/Humano, timestamp
- Filtro: Todas | Bot ativo | Aguardando humano | Churn risk
- Busca por nome ou número
- Atualização em tempo real via Supabase Realtime (tabela conversation_threads)

Coluna direita (conversa selecionada):
- Header: nome, número, plano, status de adimplência (dados do SGP cached)
- Histórico de mensagens (estilo WhatsApp: usuário direita, bot esquerda)
- Badge indicando qual tool o Claude chamou em cada resposta
- Botão "Assumir conversa": chama PATCH /api/admin/conversations/:id/human-mode → true
- Botão "Devolver ao bot": chama PATCH /api/admin/conversations/:id/human-mode → false
- Input para responder quando em modo humano (POST /api/admin/conversations/:id/reply)
- Botão "Marcar como churn risk"

### src/pages/admin/Metrics.tsx
KPIs do dia/semana/mês:
- Total de conversas
- % resolvido pelo bot (sem intervenção humana)
- Receita recuperada por cobrança automática (soma de pagamentos pós-notificação)
- Novos clientes captados via bot
- Número de churn risks ativos
- Campanhas enviadas e taxa de resposta

Use recharts (já instalado no projeto) para gráficos de linha e barra.

### src/pages/admin/CampaignManager.tsx
- Lista de campanhas agendadas e histórico de envios
- Card de cada campanha: tipo, data, total enviado, responderam, converteram
- Botão para disparar campanha de expansão manualmente (modal com campo de bairro + mensagem)
- Botão para pausar/retomar cron jobs de cobrança (emergência)

### src/pages/admin/ChurnRiskList.tsx
- Tabela de clientes em risco: nome, plano, motivo, nível (low/medium/high), dias em risco
- Botão de ação rápida: "Enviar oferta" → dispara mensagem proativa via /api/admin/campaigns/churn-outreach/:id
- Badge de status: pendente, em contato, salvo, cancelou

### Backend routes para o admin (adicionar ao Express):
- GET /api/admin/conversations (lista com filtros)
- GET /api/admin/conversations/:id (histórico completo)
- PATCH /api/admin/conversations/:id/human-mode
- POST /api/admin/conversations/:id/reply
- GET /api/admin/metrics
- GET /api/admin/campaigns
- POST /api/admin/campaigns/expansion
- GET /api/admin/churn-risks
- POST /api/admin/campaigns/churn-outreach/:id

Todas as rotas /api/admin/* protegidas por middleware que verifica role='admin' no JWT.
```

---

## ETAPA 9 — Deploy no Railway

```
[Cole o CONTEXTO MASTER acima primeiro]

Configure o deploy no Railway (railway.app). O usuário já tem um plano Railway ativo.
Serão 2 serviços: Backend Node.js no Railway + Frontend React no Vercel (gratuito).

## Por que Railway + Vercel

Railway → Backend (Node.js Express + cron jobs + webhooks)
- URL pública automática com HTTPS (ex: salesnet-backend.up.railway.app)
- Deploy automático a cada git push
- Variáveis de ambiente via painel
- Logs em tempo real no painel
- Cron jobs rodam dentro do processo Node (node-cron funciona normalmente)
- Sem necessidade de Docker manual, nginx ou certbot

Vercel → Frontend (React + Vite)
- Gratuito para projetos pessoais/pequenos
- Deploy automático a cada git push
- CDN global, HTTPS automático
- Ideal para SPAs React

---

### Serviço 1: Backend no Railway

#### railway.json (criar na pasta /mnt/hd/SALESNET/backend)
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node dist/index.js",
    "healthcheckPath": "/health",
    "restartPolicyType": "ON_FAILURE"
  }
}

#### backend/package.json — adicionar scripts:
"scripts": {
  "build": "tsc",
  "start": "node dist/index.js",
  "dev": "ts-node src/index.ts"
}

#### Configurar no painel Railway:
1. New Project → Deploy from GitHub repo
2. Selecionar o repositório, apontar para pasta /backend (Root Directory: backend)
3. Railway detecta Node.js automaticamente (Nixpacks)
4. Adicionar variáveis de ambiente no painel (Settings → Variables):
   - ANTHROPIC_API_KEY
   - TWILIO_ACCOUNT_SID
   - TWILIO_AUTH_TOKEN
   - TWILIO_WHATSAPP_NUMBER
   - SGP_BASE_URL
   - SGP_API_TOKEN
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - NODE_ENV=production
   - PORT=3001 (Railway injeta PORT automaticamente — use process.env.PORT no index.ts)
5. Fazer deploy → Railway gera a URL pública automaticamente

#### IMPORTANTE — PORT no index.ts:
const PORT = process.env.PORT || 3001  // Railway injeta PORT dinamicamente

---

### Serviço 2: Frontend no Vercel

#### vercel.json (criar na raiz /mnt/hd/SALESNET)
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}

Isso garante que o React Router funcione corretamente (SPA routing).

#### Variável de ambiente no Vercel (painel → Settings → Environment Variables):
- VITE_API_URL = https://[sua-url-railway].up.railway.app

#### Configurar no painel Vercel:
1. New Project → Import Git Repository
2. Framework Preset: Vite
3. Root Directory: . (raiz do projeto)
4. Build Command: npm run build
5. Output Directory: dist
6. Adicionar VITE_API_URL com a URL do Railway
7. Deploy

---

### Domínio personalizado (opcional)

No Railway:
- Settings → Domains → Add Custom Domain → api.salesnet.com.br
- Apontar CNAME no DNS para o domínio Railway

No Vercel:
- Settings → Domains → salesnet.com.br e www.salesnet.com.br
- Apontar registros DNS conforme instruções do Vercel

---

### Checklist pós-deploy:

1. Copiar a URL do Railway (ex: https://salesnet-backend.up.railway.app)
2. Configurar webhook do Twilio:
   URL: https://salesnet-backend.up.railway.app/webhook/twilio
   Método: POST
   (Painel Twilio → WhatsApp → Sandbox/Number → When a message comes in)

3. Configurar webhook do SGP para pagamentos:
   URL: https://salesnet-backend.up.railway.app/webhook/sgp/payment-confirmed
   (Painel SGP → Integrações → Webhooks → Evento: pagamento_confirmado)

4. Testar health check:
   curl https://salesnet-backend.up.railway.app/health
   Esperado: { "status": "ok" }

5. Enviar mensagem de teste para o número WhatsApp e verificar resposta do Claude

6. Verificar cron jobs nos logs do Railway:
   Painel Railway → Deployments → Ver logs ao vivo
   Buscar: "cron job iniciado"

7. Atualizar VITE_API_URL no Vercel com a URL final do Railway e fazer redeploy do frontend
```

---

## ETAPA 10 — Correções no Site Existente

```
[Cole o CONTEXTO MASTER acima primeiro]

Corrija os problemas identificados no site React existente antes do go-live.

1. NÚMEROS DE TELEFONE INCONSISTENTES
   Substitua todos os números fictícios pelo número real (5585996032957) nos arquivos:
   - src/components/Header.tsx (linha 51 e 93): trocar 5527999999999
   - src/components/Footer.tsx (linha 46 e 56): trocar telefone e WhatsApp
   - src/components/AIBotWidget.tsx (linhas 69 e 73 e 349): trocar 5585999999999
   - src/pages/Cobertura.tsx (linha 64): trocar 5527999999999
   - src/pages/Suporte.tsx (linha 76): trocar 5527999999999
   Formatar exibição como (85) 9 9603-2957

2. MAPA ERRADO NA COBERTURA
   Em src/pages/Cobertura.tsx linha 81, troque as coordenadas do iframe do Google Maps:
   Atual: -20.33, -40.29 (Vila Velha/ES — ERRADO)
   Correto: use coordenadas de Fortaleza/CE centralizando nos bairros atendidos
   Centro: lat=-3.7716, lng=-38.5661 (Quintino Cunha / Jardim Guanabara)
   Novo src do iframe com zoom adequado para mostrar os 5 bairros.

3. BOTÃO "ABRIR CHAT IA" SEM FUNÇÃO (Suporte.tsx)
   O botão na linha 70 de src/pages/Suporte.tsx não abre o AIBotWidget.
   Solução: Elevar o estado isOpen do AIBotWidget para o App.tsx usando Context API,
   e o botão chama setIsOpen(true) via context.

4. INCONSISTÊNCIA README vs SITE
   O README.md lista planos 100/300/500Mbps (R$79.90/99.90/129.90).
   O site tem 20/30/50/100Mbps (R$50/60/70/90).
   Atualize o README.md para refletir os planos reais do site.

5. COMPONENTES ÓRFÃOS
   PlanCard.tsx e ValueCard.tsx existem mas não são usados em nenhuma página.
   Avalie se vale refatorar Plans.tsx para usar PlanCard (mais manutenível)
   ou deletar os componentes se não forem usar.

6. IMPORT SEM USO (Suporte.tsx linha 4)
   Remova a importação de ChevronDown que não está sendo usada.
```

---

## Ordem de execução sugerida

| Prioridade | Etapa | ROI |
|-----------|-------|-----|
| 1ª | Etapa 10 — Correções site | Qualidade imediata |
| 2ª | Etapas 1+2+3 — Setup + SGP + Twilio | Fundação |
| 3ª | Etapa 4 — Claude AI Agent | Substitui VMix |
| 4ª | Etapa 5 — Cobrança automática | Recupera inadimplência |
| 5ª | Etapa 9 — Deploy | Sistema no ar |
| 6ª | Etapa 6 — Campanhas | Aumenta receita |
| 7ª | Etapa 7 — Portal cliente | Reduz chamados |
| 8ª | Etapa 8 — Dashboard admin | Controle total |

---

*Documento gerado em 06/05/2026 — SalesNet Platform v1.0*
