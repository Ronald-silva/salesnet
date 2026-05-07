# SalesNet — Checklist de Produção (Railway + Vercel)

Este guia consolida a etapa final para colocar backend e frontend em produção com segurança.

## 1) Pré-requisitos

- Repositório com `backend/railway.json` e `vercel.json` já versionados.
- Build local validado:
  - `npm --prefix backend run build`
  - `npm run build`
- Banco Supabase com schemas aplicados:
  - `backend/src/agent/schema.sql`
  - `backend/src/automations/schema.sql`
  - `backend/src/automations/campaigns/schema.sql`
  - `backend/src/routes/schema.sql`

## 2) Deploy do backend no Railway

1. No Railway, criar projeto via GitHub e definir **Root Directory** como `backend`.
2. Confirmar detecção de Node/Nixpacks.
3. Configurar variáveis de ambiente:
   - `ANTHROPIC_API_KEY`
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_NUMBER`
   - `SGP_BASE_URL`
   - `SGP_API_TOKEN`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NODE_ENV=production`
   - `PORT=3001` (Railway injeta dinâmico, manter fallback)
4. Deploy e copiar URL pública final (ex: `https://salesnet-backend.up.railway.app`).
5. Verificar healthcheck:
   - `curl https://SUA_URL_RAILWAY/health`

## 3) Deploy do frontend no Vercel

1. Importar o repositório no Vercel.
2. Definir:
   - Framework: Vite
   - Root Directory: `.`
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Configurar variável:
   - `VITE_API_URL=https://SUA_URL_RAILWAY`
4. Fazer deploy e validar carregamento de rotas SPA:
   - `/`
   - `/minha-conta/login`
   - `/admin/login`

## 4) Ordem correta de configuração dos webhooks

1. **Twilio webhook de entrada** (primeiro):
   - URL: `https://SUA_URL_RAILWAY/webhook/twilio`
   - Método: `POST`
   - Evento: mensagem recebida no número WhatsApp Business
2. **SGP webhook de pagamento** (depois):
   - URL: `https://SUA_URL_RAILWAY/webhook/sgp/payment-confirmed`
   - Método: `POST`
   - Evento: `pagamento_confirmado`

## 5) Smoke test pós-deploy (E2E funcional)

## Backend

- `GET /health` responde `{ status: "ok" }`.
- Mensagem WhatsApp de teste chega no backend e gera resposta do agente.
- Em caso de assinatura Twilio inválida (produção), rota recusa com `403`.

## Portal do cliente

1. Entrar em `/minha-conta/login`.
2. Solicitar OTP com telefone válido do SGP.
3. Confirmar OTP.
4. Validar carregamento das abas:
   - Fatura
   - Conexão
   - Chamados
   - Indicações
   - Histórico

## Dashboard admin

1. Entrar em `/admin/login` com usuário role `admin`.
2. Validar listagem de conversas.
3. Testar:
   - Assumir conversa (modo humano)
   - Devolver ao bot
   - Resposta manual
4. Validar páginas:
   - Métricas
   - Campanhas
   - Churn risks

## Cobrança e campanhas

- Confirmar jobs carregados nos logs do Railway (`[automations]` e `[campaigns]`).
- Validar que envios são registrados no Supabase (`billing_notifications`, `campaign_sends`).

## 6) Rollback rápido

- Railway: usar “Redeploy” da versão anterior estável.
- Vercel: promover deployment anterior em “Deployments”.
- Revalidar `GET /health` e login admin após rollback.
