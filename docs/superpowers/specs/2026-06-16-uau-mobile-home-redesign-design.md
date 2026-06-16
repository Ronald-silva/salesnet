---
name: uau-mobile-home-redesign
description: Redesign da tela Home do app mobile UAU+ — estilo fintech clean, hierarquia por cobrança/assinatura, atalhos com ícones Ionicons
metadata:
  type: project
---

# Redesign da Home — UAU+ Mobile

## Contexto

A tela Home atual (`app/(tabs)/home.tsx`) exibe os dados corretos, mas carece de hierarquia visual e aparência profissional: o botão "Avisos" é um bloco escuro sem identidade, os atalhos são caixas de texto simples sem ícones, e a ordem das seções não reflete a prioridade do usuário.

**Abordagem escolhida:** Redesign com Herói (B) — reordenação das seções, hero card de cobrança/assinatura, atalhos com ícones Ionicons, sino de notificações no header. Nenhum componente compartilhado novo além do próprio `home.tsx`. Biblioteca `@expo/vector-icons` (Ionicons) já disponível no projeto.

**Estilo visual:** Fintech clean (referência: Nubank/Inter) — cards brancos com sombra suave, tipografia hierárquica, destaque em `uau-green` (#0BA95B).

---

## Hierarquia de Conteúdo

Ordem definitiva das seções na tela:

1. **Header** — saudação + sino de notificações
2. **Hero Card** — cobrança atual ou CTA de assinatura
3. **Cashback** — dupla de cards lado a lado
4. **Atalhos** — grid 2×N com ícone + label
5. **Campanhas** — scroll horizontal (condicional)

---

## Seções

### 1. Header

- Saudação: `Olá, [nome]` — `text-3xl font-bold text-uau-black`
- Subtítulo: nome do plano + status da assinatura quando disponível; fallback `"Seu UAU+ em um só lugar."`
- Notificações: ícone `notifications-outline` (Ionicons, 24px, cor `uau-black`) no canto direito
  - Badge: círculo verde `uau-green` com número de não lidos; ponto sem número se count = 0; ausente se `unreadCount === 0`
- Fundo `uau-light`, sem card envolvente

### 2. Hero Card — Cobrança / Assinatura

Card branco, `rounded-2xl`, `shadow-sm`, borda esquerda grossa `border-l-4 border-uau-green`.

**Estado com cobrança (`billingQuery.data` presente):**
- Título: `"Cobrança atual"` — `text-sm font-semibold text-uau-gray`
- Badge de status: pill arredondado — cor determinada por mapeamento case-insensitive do campo `status` da API:
  - Contém `"ativ"` → fundo verde claro, texto verde
  - Contém `"pend"` ou `"aguard"` → fundo amarelo claro, texto amarelo escuro
  - Contém `"venc"` ou `"atras"` ou `"cancel"` → fundo vermelho claro, texto vermelho
  - Fallback (qualquer outro valor) → fundo cinza claro, texto cinza
- Valor: `text-3xl font-bold text-uau-black`
- Vencimento e método de pagamento: `text-sm text-uau-gray`
- CTA interno: botão `uau-green` full-width `"Pagar cobrança atual"` → `router.push("/(tabs)/billing")`

**Estado sem cobrança (usuário não assinante):**
- Título: `"Assinatura"`
- Texto: `"Você ainda não tem uma assinatura"` + subtexto motivador
- CTA interno: botão `uau-green` full-width `"Assinar agora"` → `router.push("/subscribe")`

### 3. Cashback — Dupla de Cards

Dois cards `flex-1` lado a lado com `gap-3`.

Cada card:
- Ícone Ionicons no topo (`cash-outline` / `gift-outline`), cor `uau-green`, tamanho 20px
- Label: `text-sm text-uau-gray`
- Valor: `text-2xl font-bold text-uau-black` via `<MoneyText />`

| Card | Ícone | Label | Valor |
|---|---|---|---|
| Esquerdo | `cash-outline` | Cashback total | `totalBalance` / `availableBalance` / `balance` |
| Direito | `gift-outline` | Promocional | `promotionalBalance` / `promoBalance` |

### 4. Atalhos — Grid 2×N com Ícone

`flex-row flex-wrap gap-3`. Cada célula: `w-[48%]`, card branco `rounded-xl border border-gray-100`, `p-4`, itens centrados.

Estrutura interna de cada célula:
```
ícone (Ionicons, 28px, uau-green)
label (text-xs font-medium text-uau-black, mt-2, text-center)
```

Mapa de atalhos (sem "Assinar agora" — movido para o Hero Card):

| Label | Ícone Ionicons | Rota |
|---|---|---|
| Minha Carteira | `wallet-outline` | `/(tabs)/wallet` |
| Cobranças | `receipt-outline` | `/(tabs)/billing` |
| Minha Rede | `people-outline` | `/referrals` |
| Parceiros | `storefront-outline` | `/(tabs)/partners` |
| Meus Veículos | `car-outline` | `/vehicles` |
| Histórico | `time-outline` | `/history` |
| Perfil | `person-outline` | `/(tabs)/profile` |

### 5. Campanhas (condicional)

Idêntico à lógica atual, mas reposicionado para o **final** da tela.
- Renderiza apenas quando `campaigns.length > 0`
- Scroll horizontal, cards `w-72`, título + subtítulo + CTA + botão Fechar
- Sem alteração na lógica de `viewMutation`, `clickMutation`, `dismissMutation`

---

## Estados de Loading e Erro

- `isLoading`: exibe `<Loading />` centralizado abaixo do header, antes do Hero Card
- `hasError`: exibe `<ErrorState />` com mensagem genérica; as seções que dependem dos dados mostram fallback vazio (R$ 0,00, "Nenhuma cobrança")
- Sem alteração nos hooks existentes

---

## Escopo

**Dentro do escopo:**
- Arquivo `app/(tabs)/home.tsx` — única alteração de código
- Uso de `@expo/vector-icons/Ionicons` (já disponível)
- Nenhum componente compartilhado novo

**Fora do escopo:**
- Outras telas (billing, wallet, profile, etc.)
- Alterações nos hooks ou API
- Refatoração do componente `Screen`, `Card` ou `Button`
- SafeAreaView ou mudanças de layout global
