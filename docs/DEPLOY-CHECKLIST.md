# SalesNet — Checklist de Produção (Railway + Vercel)

## Arquitetura

```
WhatsApp ──► Evolution Go (Railway) ──► Backend SalesNet (Railway) ──► Claude / SGP / Supabase
              ◄──────────────────────────────────────────────────────
```

Dois serviços no mesmo projeto Railway:
- **evolution** → recebe e envia mensagens WhatsApp
- **backend** → agente IA, automações, API

---

## 1) Supabase — Rodar os SQLs (ordem importa)

No editor SQL do Supabase, rodar nesta sequência:

```
1. backend/src/agent/schema.sql             → conversation_threads, interaction_logs
2. backend/src/automations/schema.sql       → billing_notifications
3. backend/src/automations/campaigns/schema.sql → campaign_sends, referral_links, churn_risks
4. backend/src/routes/schema.sql            → otp_codes, client_sessions
5. backend/src/scripts/whatsapp-migration.sql   → tenants, whatsapp_instances, whatsapp_send_log
```

O arquivo 5 já insere o tenant padrão e a instância `salesnet` como `disconnected`.

---

## 2) Railway — Serviço Evolution Go

### 2.1 Criar o serviço

1. Novo projeto Railway → **"Add Service" → "Docker Image"**
2. Imagem: `atendai/evolution-api:latest`
3. Nome do serviço: `evolution`
4. Após criar, ir em **Settings → Networking** e gerar domínio público (ex: `evolution-salesnet.up.railway.app`)

### 2.2 Volume (obrigatório — mantém sessão WhatsApp entre deploys)

Em **Settings → Volumes → Add Volume**:
- Mount Path: `/evolution/instances`
- Tamanho: 1 GB é suficiente

### 2.3 Variáveis de ambiente

| Variável | Valor |
|---|---|
| `AUTHENTICATION_TYPE` | `apikey` |
| `AUTHENTICATION_API_KEY` | gerar chave aleatória (ex: `openssl rand -hex 32`) |
| `SERVER_URL` | `https://evolution-salesnet.up.railway.app` (URL pública do passo 2.1) |
| `DATABASE_PROVIDER` | `sqlite` |
| `LOG_LEVEL` | `ERROR` |
| `DEL_INSTANCE` | `false` |
| `QRCODE_LIMIT` | `30` |
| `WEBHOOK_GLOBAL_ENABLED` | `false` |

### 2.4 Verificar

```bash
curl https://evolution-salesnet.up.railway.app/
# Deve retornar JSON com info da API
```

---

## 3) Railway — Serviço Backend SalesNet

### 3.1 Criar o serviço

1. **"Add Service" → "GitHub Repo"** → selecionar o repositório
2. **Root Directory**: `backend`
3. Railway detecta Nixpacks (Node.js) automaticamente
4. Nome do serviço: `backend`
5. Após criar, gerar domínio público (ex: `salesnet-backend.up.railway.app`)

### 3.2 Variáveis de ambiente

#### WhatsApp / Evolution Go
| Variável | Valor |
|---|---|
| `WHATSAPP_PROVIDER` | `evolution-go` |
| `EVOLUTION_API_URL` | `https://evolution-salesnet.up.railway.app` |
| `EVOLUTION_API_KEY` | mesma chave do passo 2.3 |
| `EVOLUTION_INSTANCE_NAME` | `salesnet` |
| `BACKEND_URL` | `https://salesnet-backend.up.railway.app` |

> **Rede interna Railway (opcional):** se ambos os serviços estão no mesmo projeto,
> você pode usar `http://evolution.railway.internal:8080` em `EVOLUTION_API_URL`
> para evitar tráfego externo. A URL pública funciona em ambos os casos.

#### IA
| Variável | Valor |
|---|---|
| `LLM_ROUTING_MODE` | `tiered` (recomendado) ou `single` |
| `LLM_PROVIDER` | `anthropic` |
| `LLM_FALLBACK_PROVIDER` | `deepseek` (opcional) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` |
| `DEEPSEEK_API_KEY` | apenas se usar DeepSeek |
| `LLM_MAX_TOKENS` | `1024` |
| `LLM_SIMPLE_MAX_TOKENS` | `512` |
| `LLM_SIMPLE_MAX_TOOL_ROUNDS` | `3` |

#### ERP e banco
| Variável | Valor |
|---|---|
| `SGP_BASE_URL` | `https://sgp.seuisp.com.br/api` |
| `SGP_API_TOKEN` | token do SGP |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave service role do Supabase |

#### Servidor
| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `TENANT_MODE` | `single` |
| `DEFAULT_TENANT_ID` | `salesnet-default` |

### 3.3 Verificar deploy

```bash
curl https://salesnet-backend.up.railway.app/health
# Esperado: { "status": "ok", "provider": "evolution-go", ... }
```

Nos logs do Railway, deve aparecer:
```
✅ WhatsApp provider: Evolution Go (...)
✅ WhatsApp instance: "salesnet" (disconnected)   ← ou "🆕 Instância provisionada"
🚀 SalesNet backend running on port ...
```

---

## 4) Conectar o WhatsApp (escanear QR)

O backend provisiona a instância automaticamente no startup. Para escanear o QR:

### Opção A — Via painel admin

1. Acessar `https://seu-frontend.vercel.app/admin/login`
2. Navegar em **Instâncias**
3. Clicar em **Conectar** → exibe o QR Code
4. Escanear com o WhatsApp do número de produção

### Opção B — Via curl direto no Evolution Go

```bash
# Listar instâncias
curl -H "apikey: SUA_CHAVE" https://evolution-salesnet.up.railway.app/instance/fetchInstances

# Obter QR Code da instância salesnet
curl -H "apikey: SUA_CHAVE" https://evolution-salesnet.up.railway.app/instance/connect/salesnet
# Retorna { qrcode: { base64: "..." } } — copiar o base64 e abrir num leitor de QR
```

### Verificar conexão

```bash
curl -H "apikey: SUA_CHAVE" \
  https://evolution-salesnet.up.railway.app/instance/connectionState/salesnet
# Esperado: { instance: { state: "open" } }
```

Quando conectado, o Supabase atualiza `whatsapp_instances.status = 'connected'`.

---

## 5) Configurar webhook SGP (pagamentos)

No painel do SGP, configurar:
- **URL**: `https://salesnet-backend.up.railway.app/webhook/sgp/payment-confirmed`
- **Método**: `POST`
- **Evento**: confirmação de pagamento

---

## 6) Deploy do frontend no Vercel

1. Importar repositório no Vercel
2. Framework: **Vite** | Root Directory: `.` | Build: `npm run build` | Output: `dist`
3. Variável de ambiente:
   - `VITE_API_URL=https://salesnet-backend.up.railway.app`
4. Deploy e validar rotas: `/`, `/minha-conta/login`, `/admin/login`

---

## 7) Smoke test E2E

- [ ] `GET /health` retorna `{ status: "ok", provider: "evolution-go" }`
- [ ] Supabase: `whatsapp_instances` tem status `connected`
- [ ] Enviar mensagem WhatsApp para o número → agente responde em segundos
- [ ] Logs Railway mostram `[processor] tier=...` e `[agent]` sem erros
- [ ] Portal `/minha-conta/login` solicita OTP com sucesso
- [ ] Admin `/admin/login` mostra conversas

---

## 8) Troubleshooting

### Agente não responde
1. Verificar `GET /health` — backend está no ar?
2. Logs Railway: erro em `[webhook]` ou `[processor]`?
3. Evolution Go conectado? (`connectionState` retorna `open`?)
4. Supabase: `whatsapp_instances.status = 'connected'`?

### QR Code expira sem ser escaneado
- QR dura ~60s. Repetir `GET /instance/connect/salesnet` para gerar novo.
- Se instância sumir após redeploy: o Volume do passo 2.2 não foi configurado.

### Backend não acha instância conectada
- Verificar `DEFAULT_TENANT_ID=salesnet-default` está setado
- A instância no Supabase deve ter `tenant_id = 'salesnet-default'`
- (já inserido automaticamente pelo `whatsapp-migration.sql`)

### Evolution Go não entrega webhook no backend
- Verificar `BACKEND_URL` está correto e acessível publicamente
- Testar: `curl -X POST https://salesnet-backend.up.railway.app/webhook/whatsapp/salesnet -H "Content-Type: application/json" -d '{}'`

---

## 9) Rollback rápido

- **Railway**: usar "Redeploy" da versão anterior estável (aba Deployments)
- **Vercel**: promover deployment anterior em "Deployments"
- Revalidar `GET /health` e login admin após rollback
