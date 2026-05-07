# SalesNet Telecom - Fortaleza/CE

## Sobre o Projeto

Plataforma completa da **SalesNet Telecom** com:

- **Frontend institucional** (React + Vite) para captação e suporte.
- **Backend operacional** (Node + Express) com integrações reais:
  - WhatsApp via Twilio
  - SGP (ERP ISP)
  - Supabase (dados operacionais/memória)
  - Agente IA para atendimento e automações

Objetivo: centralizar atendimento, cobrança e campanhas com eficiência operacional e controle de custo.

## Contexto Técnico Atual (para escolha de API)

### Arquitetura em produção (resumo)

- `frontend` em Vercel, consumindo API do backend.
- `backend` (Express/TypeScript) com webhooks (`/webhook/twilio`, `/webhook/sgp/*`) e rotas de portal/admin.
- Integrações principais:
  - `Twilio` para mensagens WhatsApp
  - `SGP` para clientes/faturas/rede/chamados
  - `Supabase` para persistência e suporte a automações
- IA atual integrada via `@anthropic-ai/sdk`.

### Requisitos de IA do projeto

- Boa interpretação de contexto em português (suporte e cobrança).
- Confiabilidade para casos críticos (financeiro/rede/chamados).
- Baixa latência para atendimento.
- Custo previsível por conversa.
- Facilidade de observabilidade e fallback.

## Decisão de API de IA (Claude vs DeepSeek)

### Resposta curta

Sim, **DeepSeek pode ser uma boa opção de economia**, mas para este projeto a abordagem mais segura é:

1. manter **Claude** como motor principal para casos complexos/críticos;
2. introduzir DeepSeek de forma controlada para casos simples/intermediários;
3. medir custo/qualidade antes de trocar o core.

### Recomendação prática para SalesNet

- **Cenário recomendado agora:** Claude-first com roteamento por complexidade.
- **Piloto de DeepSeek:** começar em intents de baixo risco:
  - FAQ
  - reformulação/resumo
  - respostas de catálogo e perguntas recorrentes
- **Não migrar de imediato** casos de maior risco:
  - negociação de cobrança
  - orientações técnicas com impacto operacional
  - ações com tool-calling em múltiplos sistemas

### Critérios objetivos para decisão final

Avaliar por 2-4 semanas com logs comparativos:

- custo por atendimento
- taxa de resolução no primeiro contato
- taxa de escalonamento para humano
- taxa de correção manual necessária
- latência P95

Se DeepSeek mantiver qualidade com redução de custo relevante, ampliar gradualmente.

### Cobertura

Atendemos os seguintes bairros:

- 🏘️ **Jardim Guanabara** - 95% cobertura
- 🏘️ **Jardim Iracema** - 90% cobertura
- 🏘️ **Quintino Cunha** - 85% cobertura
- 🏘️ **Vila Velha** - 88% cobertura
- 🏘️ **Nova Assunção** - 92% cobertura

### Planos Disponíveis

- 📶 **20 Mbps** - R$ 50,00/mês*
- 📶 **30 Mbps** - R$ 60,00/mês*
- ⚡ **50 Mbps** - R$ 70,00/mês* (Mais Popular)
- 🔥 **100 Mbps** - R$ 90,00/mês*

*Pagando até o vencimento. Sem desconto: +R$ 10,00/mês.

## Como executar o projeto

Certifique-se de ter Node.js & npm instalados - [instalar com nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Siga estes passos:

```sh
# Passo 1: Clone o repositório
git clone <URL_DO_SEU_GIT>

# Passo 2: Navegue até o diretório do projeto
cd <NOME_DO_SEU_PROJETO>

# Passo 3: Instale as dependências
npm i

# Passo 4: Inicie o servidor de desenvolvimento
npm run dev
```

## Tecnologias Utilizadas

Este projeto foi desenvolvido com:

- ⚡ **Vite** - Build tool moderna e rápida
- 🔷 **TypeScript** - JavaScript com tipagem estática
- ⚛️ **React 18** - Biblioteca para interfaces de usuário
- 🎨 **shadcn/ui** - Sistema de componentes baseado em Radix UI
- 🎯 **Tailwind CSS** - Framework CSS utility-first
- 🛣️ **React Router** - Roteamento client-side
- 🔄 **TanStack Query** - Gerenciamento de estado e cache
- 📋 **React Hook Form + Zod** - Formulários e validação
- 🎭 **Lucide React** - Ícones modernos
- 🧩 **Backend Node/Express** - APIs, webhooks e automações
- 💬 **Twilio** - WhatsApp oficial
- 🗄️ **Supabase** - persistência e suporte operacional
- 🌐 **SGP API** - integração com ERP ISP
- 🤖 **Anthropic Claude API** - agente principal atual

## Como fazer deploy

Para fazer o deploy do projeto, você pode usar qualquer plataforma de hospedagem que suporte aplicações React:

```sh
# Build para produção
npm run build

# Preview do build
npm run preview
```

Plataformas recomendadas: Vercel, Netlify, GitHub Pages, ou qualquer servidor web.

## Funcionalidades Principais

### 🌐 **Site Institucional Completo**

- ✅ Página inicial com hero section e depoimentos
- ✅ Catálogo de planos com preços e benefícios
- ✅ Mapa de cobertura interativo
- ✅ Sistema de suporte com FAQ
- ✅ Página de hotspots para parceiros
- ✅ Portal de trabalhe conosco
- ✅ Formulário de contato

### 🤖 **Recursos Inteligentes**

- ✅ **Bot IA 24h** - Suporte automatizado
- ✅ **Widget WhatsApp** flutuante
- ✅ **Status da rede** em tempo real
- ✅ **Consulta de CEP** para verificar cobertura

### 📱 **Experiência do Usuário**

- ✅ **Design responsivo** - Mobile-first
- ✅ **Animações suaves** - Transições CSS
- ✅ **Tema consistente** - Sistema de design unificado
- ✅ **SEO otimizado** - Meta tags e estrutura semântica
- ✅ **Performance** - Build otimizado com Vite

## Estrutura do Projeto

```
src/
├── pages/              # Páginas da aplicação
│   ├── Home.tsx       # Página inicial
│   ├── Plans.tsx      # Catálogo de planos
│   ├── Cobertura.tsx  # Mapa de cobertura
│   ├── Suporte.tsx    # Central de suporte
│   ├── Hotspots.tsx   # Programa de parceiros
│   ├── TrabalheConosco.tsx # Portal de vagas
│   ├── Contact.tsx    # Formulário de contato
│   ├── About.tsx      # Sobre a empresa
│   └── NotFound.tsx   # Página 404
├── components/         # Componentes reutilizáveis
│   ├── ui/            # Sistema de design (shadcn/ui)
│   ├── Header.tsx     # Navegação principal
│   ├── Footer.tsx     # Rodapé com links
│   ├── AIBotWidget.tsx # Widget do bot IA
│   ├── FloatingWhatsApp.tsx # Botão WhatsApp
│   ├── PlanCard.tsx   # Card de plano
│   └── ValueCard.tsx  # Card de benefício
└── assets/            # Imagens e recursos estáticos
```

## Scripts Disponíveis

```sh
# Desenvolvimento
npm run dev          # Inicia servidor de desenvolvimento (porta 8080)

# Build
npm run build        # Build para produção
npm run build:dev    # Build em modo desenvolvimento
npm run preview      # Preview do build de produção

# Qualidade de código
npm run lint         # Executa ESLint
```

## Configuração de Ambiente

### Variáveis de Ambiente (Opcional)

Crie um arquivo `.env.local` na raiz do frontend para configurações personalizadas:

```env
# Exemplo de configurações
VITE_WHATSAPP_NUMBER=5585999999999
VITE_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
VITE_API_BASE_URL=https://api.salesnet.com.br
```

### Variáveis do Backend (`backend/.env`)

```env
ANTHROPIC_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=+5585996032957
SGP_BASE_URL=
SGP_API_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
PORT=3001
NODE_ENV=development
```

> Em produção, mantenha segredos no Railway (ou provedor do backend), não no frontend.

## Estratégia recomendada de otimização de tokens

Mesmo usando apenas Claude, a economia pode ser expressiva com arquitetura:

- roteamento por complexidade (`simples`, `intermediário`, `complexo`)
- respostas determinísticas para FAQ sem chamar LLM
- contexto mínimo por requisição (RAG + resumo de histórico)
- limites de saída por categoria de atendimento
- cache de perguntas repetidas

Com isso, você preserva qualidade nos casos críticos e reduz custo médio por conversa.

### Requisitos do Sistema

- **Node.js** 18+
- **npm** 9+ ou **yarn** 1.22+
- **Git** para controle de versão

## Deploy em Produção

### Vercel (Recomendado)

```sh
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### Netlify

```sh
# Build
npm run build

# Upload da pasta dist/ para Netlify
```

### Servidor Próprio

```sh
# Build
npm run build

# Servir arquivos estáticos da pasta dist/
# Configurar servidor web (Apache/Nginx) para SPA
```

## Otimizações Implementadas

- 🚀 **Code Splitting** - Carregamento sob demanda
- 📦 **Tree Shaking** - Remoção de código não utilizado
- 🗜️ **Minificação** - CSS e JS comprimidos
- 🖼️ **Otimização de imagens** - Formatos modernos
- 📱 **PWA Ready** - Preparado para Progressive Web App
- 🔍 **SEO Friendly** - Meta tags e estrutura semântica

## Suporte e Manutenção

Para dúvidas técnicas ou melhorias:

- 📧 Abra uma **issue** no repositório
- 📝 Consulte a **documentação** das tecnologias utilizadas
- 🔧 Verifique os **logs de build** em caso de erros

---

**SalesNet Telecom** - Internet via Fibra Óptica de qualidade em Fortaleza/CE 🌐
