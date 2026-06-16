---
name: uau-mobile-home-redesign
description: Redesign da tela Home do app mobile UAU+ — alinhado ao design do app UAU Lava Car original (teal + maroon, stats row, cards com gradiente)
metadata:
  type: project
---

# Redesign da Home — UAU+ Mobile

## Contexto

A tela Home atual (`app/(tabs)/home.tsx`) exibe dados corretos mas tem visual sem identidade: botão "Avisos" como bloco preto, atalhos como caixas de texto simples, sem hierarquia. O cliente já usa o **app UAU Lava Car** (repo `Uaulavacar43/app-uau-clube`, API em `api.uaulavacar.com.br`) e o novo UAU+ precisa ter a **mesma linguagem visual** para não causar estranhamento.

**Abordagem:** Redesign alinhado à marca — replicar o layout e tokens visuais do app UAU Lava Car adaptando o conteúdo para o contexto UAU+ (cashback, assinaturas, cobranças). Arquivo único alterado: `app/(tabs)/home.tsx` + `tailwind.config.js` (novas cores).

---

## Tokens de Design (extraídos do app original)

Adicionar ao `tailwind.config.js`:

```js
uau: {
  teal:   "#009688",   // cor primária — header, ícones, labels de stats
  maroon: "#7D1C2F",   // cor secundária — cards alternados
  green:  "#0BA95B",   // mantida para compatibilidade com outros componentes
  black:  "#101418",
  gray:   "#667085",
  light:  "#F5F7FA",
  white:  "#FFFFFF",
}
```

Gradientes dos cards de ação (inline style, não Tailwind):
- **Teal card:** `['#009B8D', '#00695C']` (LinearGradient, diagonal)
- **Maroon card:** `['#7D1C2F', '#1A0010']` (LinearGradient, diagonal)

> Requer instalação de `expo-linear-gradient` (ainda não instalado no projeto).

---

## Estrutura da Tela

### 1. Header — Faixa Teal

Faixa full-width com fundo teal (`#009688`), compensando o padding do `Screen` com margem negativa (`-mx-5 -mt-6`), `rounded-b-3xl`.

```
┌─────────────────────────────────────────┐
│  [fundo teal]                    🔔  3  │
│  Olá, Ronald                            │
│  Assinatura ativa · Plano Gold          │
└─────────────────────────────────────────┘
```

- Texto em branco
- Sino: `Ionicons "notifications-outline"`, 24px, branco
- Badge: círculo `#FF5252` com número de não lidos; oculto se `unreadCount === 0`
- Subtítulo: plano + status quando disponível; fallback `"Seu UAU+ em um só lugar."`
- Padding interno: `px-5 pt-4 pb-6`

### 2. Stats Row — 3 Cards

Três cards brancos lado a lado, `flex-1`, `gap-3`.

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Cashback │  │ Veículos │  │Assinatura│  ← label teal, text-xs
│          │  │          │  │          │
│  R$0,00  │  │    0     │  │  Ativa   │  ← valor bold
└──────────┘  └──────────┘  └──────────┘
```

Cada card:
- Label: `text-xs font-semibold text-uau-teal` no topo
- Valor: `text-xl font-bold text-uau-black` (via `<MoneyText />` ou `<Text />`)
- `rounded-xl border border-gray-100 bg-white p-3`

Dados:
| Card | Fonte | Fallback |
|---|---|---|
| Cashback | `wallet.totalBalance` / `availableBalance` | `R$ 0,00` |
| Veículos | não disponível no UAU+ — exibir `0` fixo até haver endpoint | `0` |
| Assinatura | `subscription.status` (normalizado) | `"—"` |

> Campo "Veículos" é placeholder — mostrar `0` até o endpoint `/vehicles/count` ser implementado. Não bloqueia o redesign.

### 3. CTA Principal — Botão Pill Preto

```
┌─────────────────────────────────────────────┐
│         Pagar cobrança atual                │  ← pill preto, full width
└─────────────────────────────────────────────┘
```

- `h-14 rounded-full bg-uau-black items-center justify-center`
- Texto: `font-semibold text-white text-base`
- Label dinâmico: `"Pagar cobrança atual"` se tem billing, `"Assinar agora"` se não tem
- Rota: `/(tabs)/billing` ou `/subscribe`
- **Substitui** o `<Button />` atual (que usa `uau-green`; este usa black pill próprio)

### 4. Cards de Ação — Grid 2×N com Gradiente

Grid `flex-row flex-wrap gap-3`. Cada card: `w-[48%]`, aspect ratio quadrado (`aspect-square`), `rounded-2xl overflow-hidden`.

Conteúdo interno centralizado (ícone em cima, label abaixo):
```
┌──────────────────┐  ┌──────────────────┐
│   [gradient]     │  │   [gradient]     │
│       💳          │  │       🚗          │
│  Minha Carteira  │  │  Cobranças       │
└──────────────────┘  └──────────────────┘
```

Ícones: `Ionicons`, 40px, branco. Label: `text-sm font-semibold text-white text-center`, `mt-3`.

Alternância de gradiente (índice par = teal, índice ímpar = maroon):

| Label | Ícone | Rota | Gradiente |
|---|---|---|---|
| Minha Carteira | `wallet-outline` | `/(tabs)/wallet` | teal |
| Cobranças | `receipt-outline` | `/(tabs)/billing` | maroon |
| Parceiros | `storefront-outline` | `/(tabs)/partners` | maroon |
| Minha Rede | `people-outline` | `/referrals` | teal |
| Meus Veículos | `car-outline` | `/vehicles` | teal |
| Histórico | `time-outline` | `/history` | maroon |
| Perfil | `person-outline` | `/(tabs)/profile` | maroon |

> "Assinar agora" **removido** dos atalhos — está no CTA principal.

### 5. Campanhas (condicional, ao final)

Renderiza apenas quando `campaigns.length > 0`. Scroll horizontal. Cards `w-72`, `rounded-xl`, fundo branco. Sem alteração na lógica (`viewMutation`, `clickMutation`, `dismissMutation`).

---

## Dependência Nova: `expo-linear-gradient`

Os cards de ação usam `LinearGradient`. Instalação:
```bash
npx expo install expo-linear-gradient
```

---

## Estados de Loading e Erro

- `isLoading`: `<Loading />` exibido abaixo do header teal, antes dos stats
- `hasError`: `<ErrorState />` com mensagem genérica; stats mostram fallback vazio

---

## Escopo

**Dentro do escopo:**
- `app/(tabs)/home.tsx` — arquivo principal
- `tailwind.config.js` — adicionar `uau-teal` e `uau-maroon`
- Instalar `expo-linear-gradient`

**Fora do escopo:**
- Outras telas
- Componentes compartilhados (`Screen`, `Card`, `Button`)
- Endpoint de contagem de veículos
- Logo UAU Lava Car no header (não temos o asset — usar texto/gradiente)
