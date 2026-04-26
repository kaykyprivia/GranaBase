# GranaBase

> Plataforma de gestão financeira premium para pessoas com renda variável.

Desenvolvida para autônomos, freelancers, vendedores, comissionados e pequenos empreendedores que precisam de clareza financeira real — sem planilha, sem complicação.

---

## Visão do Produto

A maioria das pessoas com renda variável não sabe:
- Quanto entrou no mês
- Quanto saiu (e para onde)
- Quanto ainda precisa pagar
- Quanto está parcelado
- Quanto sobra de verdade
- Quanto pode investir

O **GranaBase** resolve isso com uma interface premium, simples e poderosa.

---

## Stack Técnica

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js 15 (App Router) |
| Linguagem | TypeScript 5 (strict mode) |
| Estilização | Tailwind CSS 3 |
| Banco de dados | PostgreSQL (Supabase) |
| Autenticação | Supabase Auth |
| Segurança | Row Level Security (RLS) |
| Formulários | React Hook Form + Zod |
| Gráficos | Recharts |
| Ícones | Lucide React |
| Toasts | Sonner |
| Deploy | Vercel |

---

## Funcionalidades

- **Dashboard** — visão geral com saldo, entradas, saídas, pendências e metas
- **Entradas** — registro e histórico de toda receita (bicos, freelas, vendas, comissões)
- **Gastos** — controle de despesas por categoria
- **Contas** — gestão de contas a pagar com alertas de vencimento
- **Parcelas** — controle inteligente de compras parceladas
- **Calendário** — visualização financeira mensal
- **Investimentos** — registro e acompanhamento de aplicações
- **Metas** — definição e progresso de objetivos financeiros
- **Relatórios** — analytics reais com gráficos interativos
- **Configurações** — perfil e preferências

---

## Setup Local

### Pré-requisitos
- Node.js 20+
- npm 10+
- Conta no [Supabase](https://supabase.com) (gratuita)

### 1. Clonar o repositório

```bash
git clone https://github.com/seu-usuario/granabase.git
cd granabase
```

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env.local
```

Preencha no `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

### 4. Configurar banco de dados (Supabase)

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Crie um novo projeto
3. Vá em **SQL Editor**
4. Execute o conteúdo de `supabase/migrations/001_initial_schema.sql`

Isso criará todas as tabelas com RLS configurado.

### 5. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Chave pública anon do Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional | Chave service role (apenas para scripts admin) |

---

## Scripts

```bash
npm run dev          # Servidor de desenvolvimento
npm run build        # Build de produção
npm run start        # Servidor de produção
npm run lint         # Verificar lint
npm run typecheck    # Verificar tipos TypeScript
```

---

## Deploy na Vercel

### 1. Conectar repositório

1. Acesse [vercel.com](https://vercel.com)
2. Importe o repositório GitHub
3. Framework preset: **Next.js** (detectado automaticamente)

### 2. Configurar variáveis de ambiente

No painel da Vercel, adicione:

```
NEXT_PUBLIC_SUPABASE_URL     → URL do Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY → Anon key do Supabase
```

### 3. Deploy

Clique em **Deploy**. A Vercel executará `npm run build` automaticamente.

### 4. Configurar callback de autenticação

No Supabase, vá em **Authentication → URL Configuration** e adicione:

```
Site URL: https://seu-projeto.vercel.app
Redirect URLs: https://seu-projeto.vercel.app/api/auth/callback
```

---

## Estrutura do Projeto

```
granabase/
├── app/
│   ├── (auth)/           # Páginas de autenticação (login, register)
│   ├── (app)/            # Páginas protegidas (dashboard, módulos)
│   │   ├── dashboard/
│   │   ├── income/
│   │   ├── expenses/
│   │   ├── bills/
│   │   ├── installments/
│   │   ├── calendar/
│   │   ├── investments/
│   │   ├── goals/
│   │   ├── reports/
│   │   └── settings/
│   ├── api/auth/callback/ # OAuth callback
│   ├── globals.css        # Design system + Tailwind
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Landing page
├── components/
│   ├── ui/               # Componentes base (Button, Input, Card...)
│   ├── shared/           # Componentes reutilizáveis (StatCard, EmptyState...)
│   └── layout/           # Sidebar, Header, BottomNav
├── lib/
│   ├── supabase/         # Client, Server, Middleware clients
│   ├── utils.ts          # Helpers (formatCurrency, formatDate...)
│   └── validations.ts    # Schemas Zod
├── types/
│   └── database.ts       # Tipos TypeScript do banco
├── supabase/
│   └── migrations/       # SQL migrations
├── middleware.ts          # Proteção de rotas
└── ...configs
```

---

## Banco de Dados

### Tabelas

| Tabela | Descrição |
|--------|-----------|
| `profiles` | Perfis de usuário (criado via trigger no signup) |
| `income_entries` | Registros de receita |
| `expense_entries` | Registros de despesa |
| `bills` | Contas a pagar |
| `installments` | Compras parceladas |
| `installment_payments` | Parcelas individuais (geradas automaticamente) |
| `investments` | Registros de investimentos |
| `financial_goals` | Metas financeiras |

Todas as tabelas têm **RLS ativo** — usuários só acessam seus próprios dados.

---

## Roadmap

### v1.0 (Atual)
- [x] Autenticação completa
- [x] Dashboard com métricas
- [x] CRUD de entradas e gastos
- [x] Gestão de contas e parcelas
- [x] Calendário financeiro
- [x] Investimentos e metas
- [x] Relatórios com gráficos

### v1.1 (Próximo)
- [ ] Exportação em PDF/CSV
- [ ] Notificações de vencimento (email)
- [ ] Recorrência automática de contas
- [ ] Modo offline (PWA)

### v2.0 (Futuro)
- [ ] Multi-contas bancárias
- [ ] Importação de extratos (OFX)
- [ ] App mobile (React Native)
- [ ] Integração Open Finance

---

## Segurança

- **Row Level Security (RLS)** em todas as tabelas
- Usuário só lê/escreve seus próprios dados
- Tokens armazenados em cookies HTTP-only via `@supabase/ssr`
- Middleware de proteção de rotas em todas as páginas privadas
- Validação de inputs com Zod em todos os formulários
- Sem service role key exposta no cliente

---

## Licença

MIT — Use, modifique e distribua livremente.

---

Feito com dedicação para quem corre atrás. 🚀
