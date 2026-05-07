# SalesNet Telecom - Fortaleza/CE

## Sobre o Projeto

Site institucional da **SalesNet Telecom**, provedor de internet via fibra óptica em Fortaleza/CE.

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

Crie um arquivo `.env.local` na raiz do projeto para configurações personalizadas:

```env
# Exemplo de configurações
VITE_WHATSAPP_NUMBER=5585999999999
VITE_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
VITE_API_BASE_URL=https://api.salesnet.com.br
```

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
