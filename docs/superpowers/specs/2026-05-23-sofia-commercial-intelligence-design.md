# Sofia — Plataforma de Inteligência Comercial

**Data:** 2026-05-23
**Status:** Aprovado pelo usuário
**Escopo:** Evolução do agente Sofia de reativo para proativo, cobrindo três modos de operação: Cobrança, Suporte Técnico e Comercial.

---

## Contexto

A Sofia já existe com 12 ferramentas SGP, roteamento de LLM por complexidade (DeepSeek/Anthropic) e memória de conversa de 20 mensagens. O problema atual: ela é 100% reativa — só age quando o cliente pergunta. Os dois maiores gargalos operacionais da SalesNet são cobrança (clientes com fatura vencida sem acompanhamento além do corte automático do SGP) e suporte técnico (visitas técnicas caras para problemas que poderiam ser resolvidos remotamente).

---

## Arquitetura: Classificador de Sessão

No início de cada conversa — e reavaliado a cada mensagem — um **Classificador de Sessão** cruza o conteúdo da mensagem com os dados do cliente no SGP para determinar o modo de operação:

```
Mensagem chega
       ↓
Classificador de Sessão (dados SGP + conteúdo da mensagem)
  ├── Cliente inadimplente + fala de pagamento/corte  →  MODO COBRANÇA
  ├── Cliente relata problema técnico                 →  MODO SUPORTE
  ├── Cliente no plano mais baixo + reclama velocidade→  MODO COMERCIAL
  └── Demais casos                                    →  MODO PADRÃO (atual)
```

Os modos não são agentes separados. São **blocos de contexto e ferramentas adicionais** injetados no system prompt existente da Sofia junto com os dados do SGP. O comportamento base (identidade, tom, regras de transferência para humano) permanece inalterado.

---

## Modo Cobrança

### Scheduler Proativo (cron diário)

Um job roda uma vez por dia e consulta o SGP em busca de clientes com **2+ atrasos nos últimos 6 meses** e fatura próxima ao vencimento. Para cada cliente elegível, dispara a mensagem da cadência correspondente via WhatsApp.

**Cadência:**

| Momento | Mensagem |
|---|---|
| D-5 | Aviso amigável + meio de pagamento via SGP |
| D-2 | Aviso de urgência + meio de pagamento atualizado |
| D+1 | Fatura vencida + meio de pagamento + abertura para negociação |
| Pós-corte (quando cliente contatar) | Confirmação do corte + meio de pagamento + oferta de negociação |

**Regras:**
- Apenas clientes com 2+ atrasos nos últimos 6 meses recebem a cadência — clientes adimplentes não são impactados
- Se o cliente pagar em qualquer etapa, a cadência para imediatamente (verificação via SGP antes de cada disparo)
- Máximo de 1 mensagem proativa por dia por cliente
- Valores, descontos e meios de pagamento vêm exclusivamente do SGP — a Sofia não inventa nenhum dado financeiro

### Fluxo de Negociação

Quando o cliente indica que não consegue pagar o valor total, a Sofia abre negociação com as opções disponíveis no SGP (`registrar_negociacao`). Não oferece condições fixas — usa o que o sistema disponibilizar.

### Novas ferramentas necessárias

| Ferramenta | Descrição |
|---|---|
| `listar_inadimplentes_recorrentes(dias_vencimento)` | Retorna clientes com histórico de atraso e fatura vencendo em X dias |
| `registrar_negociacao(customer_id, condicoes)` | Registra acordo de parcelamento no SGP |
| `confirmar_pagamento(invoice_id)` | Verifica se o pagamento foi confirmado |

---

## Modo Suporte Técnico

### Triage Estruturado

Antes de abrir qualquer chamado ou agendar visita, a Sofia executa um diagnóstico em camadas:

```
Cliente reporta problema técnico
          ↓
Sofia chama status_conexao (SGP)
          ↓
    ┌─── Sinal OK no sistema
    │    → Problema no roteador do cliente
    │    → Sofia guia: reiniciar roteador, testar cabo, aguardar 2 min
    │    → Se persistir: abre chamado + agenda visita
    │
    └─── Sinal ruim ou ausente
              ↓
         Chama detectar_apagao_bairro(bairro)
              ↓
         ┌─── 2+ clientes do bairro com problema nas últimas 2h
         │    → APAGÃO DETECTADO
         │    → Sofia informa a situação e previsão de normalização
         │    → Não abre chamado individual
         │
         └─── Problema isolado
              → Abre chamado técnico
              → Oferece agendamento de visita (manhã ou tarde)
```

### Acompanhamento de Visita

Quando uma visita é agendada:
- **1h antes da visita:** Sofia envia lembrete automático ao cliente
- **Após a visita:** Sofia envia mensagem de acompanhamento pedindo confirmação de resolução (`👍 ou 👎`)
- Se cliente responde `👎`: Sofia reabre o atendimento e oferece novo agendamento

### Nova ferramenta necessária

| Ferramenta | Descrição |
|---|---|
| `detectar_apagao_bairro(bairro)` | Consulta Supabase: conta threads com chamado técnico no mesmo bairro nas últimas 2h. Retorna `{ outage: boolean, count: number }` |

---

## Modo Comercial

### Gatilhos de Upsell

A Sofia detecta oportunidades **dentro do atendimento**, apenas quando há sinal real do cliente. Nunca interrompe o assunto principal para vender.

| Situação | Ação da Sofia |
|---|---|
| Cliente no plano 20 ou 30 Mbps + reclama de lentidão | Resolve o problema primeiro. Depois sugere plano superior com base no perfil de uso |
| Cliente adimplente há 6+ meses em qualquer contato | Menciona naturalmente condições para upgrade de fidelidade |
| Cliente pergunta sobre cobertura para terceiro | Identifica como lead de indicação e encaminha |

### Regras Anti-Spam Comercial

- Upsell aparece **no máximo uma vez por conversa**
- Não aparece enquanto o problema principal não estiver resolvido
- Não aparece se o cliente estiver inadimplente
- Não requer ferramentas novas — cruza dados já disponíveis via `buscar_cliente`

---

## Componentes a Implementar

| Componente | Arquivo | Complexidade |
|---|---|---|
| Classificador de Sessão | `agent/session-classifier.ts` | Baixa |
| Injeção de contexto por modo | `agent/prompt.ts` (extensão) | Baixa |
| Scheduler proativo de cobrança | `automations/billing-cadence.ts` | Média |
| Detecção de apagão | `agent/tools.ts` (nova tool) | Baixa |
| Ferramentas SGP de cobrança | `integrations/sgp.ts` (extensão) | Média |
| Acompanhamento de visita | `automations/visit-followup.ts` | Baixa |

---

## O que NÃO está no escopo

- Reescrita do core do agente (processor, memory, roteamento LLM)
- Integração com canais além do WhatsApp
- Dashboard de métricas de cobrança (já existe no admin panel)
- Mudança no sistema de autenticação ou SGP

---

## Critérios de Sucesso

- Cliente inadimplente recorrente recebe notificação antes do vencimento e paga sem precisar ligar
- Problema técnico de roteador resolvido sem visita técnica em ≥ 50% dos casos
- Apagão de bairro identificado automaticamente e clientes informados antes de reclamarem individualmente
- Upsell oferecido em contexto certo sem gerar reclamações de spam
