import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  FileText,
  Target,
  BarChart3,
  Shield,
  Zap,
  ChevronRight,
  Check,
  BriefcaseBusiness,
  ShoppingCart,
  Boxes,
  Users,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/shared/BrandLogo";

const personalFeatures = [
  {
    icon: TrendingUp,
    title: "Entradas",
    description:
      "Registre bicos, freelas, vendas e comissoes. Saiba exatamente quanto entrou.",
  },
  {
    icon: TrendingDown,
    title: "Gastos",
    description:
      "Categorize e entenda para onde vai seu dinheiro. Corte o que nao agrega.",
  },
  {
    icon: FileText,
    title: "Contas",
    description:
      "Nunca mais pague juros por esquecimento. Contas recorrentes com alerta.",
  },
  {
    icon: Target,
    title: "Metas",
    description:
      "Defina objetivos e acompanhe seu progresso: reserva, quitacao, compra.",
  },
  {
    icon: BarChart3,
    title: "Relatorios",
    description:
      "Graficos e analises que mostram sua evolucao financeira mes a mes.",
  },
  {
    icon: Shield,
    title: "100% seguro",
    description:
      "Seus dados protegidos com Row Level Security. So voce acessa o seu.",
  },
];

const businessFeatures = [
  {
    icon: ShoppingCart,
    title: "Compras e vendas",
    description:
      "Registre compras de fornecedor e vendas para clientes com multiplos itens.",
  },
  {
    icon: Boxes,
    title: "Estoque",
    description:
      "Controle o que entra e sai. Alertas de estoque baixo e movimentacoes.",
  },
  {
    icon: Users,
    title: "Clientes",
    description:
      "Cadastre clientes, acompanhe historico de compras e a receber.",
  },
  {
    icon: BarChart3,
    title: "Relatorios do negocio",
    description:
      "Faturamento, lucro, margem e fluxo de caixa do seu negocio.",
  },
];

const plans = [
  {
    id: "free",
    name: "Free",
    price: "R$ 0",
    period: "7 dias por produto",
    description: "Teste tudo sem pagar. Ativa Personal, Business ou ambos.",
    features: [
      "7 dias gratis por produto",
      "Acesso completo durante o teste",
      "Dados preservados apos o periodo",
    ],
    cta: "Comecar gratis",
    highlight: false,
  },
  {
    id: "monthly",
    name: "Mensal",
    price: "R$ 19,90",
    period: "por mes",
    description: "Acesso total ao Personal e Business, mes a mes.",
    features: [
      "Acesso completo (Personal + Business)",
      "Sem limite de tempo",
      "Suporte por e-mail",
    ],
    cta: "Assinar mensal",
    highlight: false,
  },
  {
    id: "semiannual",
    name: "Semestral",
    price: "R$ 65,67",
    period: "a cada 6 meses",
    description: "Economize pagando semestral. Acesso total aos dois produtos.",
    features: [
      "Acesso completo (Personal + Business)",
      "Economia de 45% vs mensal",
      "Suporte prioritario",
    ],
    cta: "Assinar semestral",
    highlight: true,
  },
  {
    id: "annual",
    name: "Anual",
    price: "R$ 167,16",
    period: "por ano",
    description: "Melhor custo por mes. Acesso total aos dois produtos.",
    features: [
      "Acesso completo (Personal + Business)",
      "Economia de 30% vs mensal",
      "Suporte prioritario",
    ],
    cta: "Assinar anual",
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandLogo className="h-12 rounded-xl" priority />
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Entrar
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Comecar gratis</Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-profit/5 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium mb-6">
            <Zap className="h-3.5 w-3.5" />
            Para quem nao tem salario fixo
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text-primary leading-tight mb-6">
            Controle financeiro para{" "}
            <span className="text-accent">renda variavel</span>
          </h1>
          <p className="text-lg sm:text-xl text-text-secondary leading-relaxed mb-10 max-w-2xl mx-auto">
            Do pessoal ao negocio. Autonomos, freelancers e pequenos
            empreendedores merecem uma ferramenta que entende como a renda
            funciona. Sem planilha. Sem complicacao.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto px-8">
                Comecar gratis agora
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Ja tenho conta
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-text-secondary">
            7 dias gratis em cada produto. Sem cartao de credito.
          </p>
        </div>
      </section>

      <section className="py-16 px-4 border-y border-border">
        <div className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { value: "7 dias", label: "Gratis por produto" },
            { value: "< 2 min", label: "Para registrar" },
            { value: "100%", label: "Privacidade" },
            { value: "2 em 1", label: "Pessoal + Negocio" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold text-accent mb-1">{stat.value}</p>
              <p className="text-sm text-text-secondary">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-profit/10 text-profit text-xs font-medium mb-4">
              <TrendingUp className="h-3 w-3" />
              Personal
            </div>
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Sua vida financeira em ordem
            </h2>
            <p className="text-text-secondary text-lg max-w-2xl mx-auto">
              Tudo que voce precisa para controlar o que entra e o que sai.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {personalFeatures.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl border border-border bg-surface hover:border-border/80 transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-semibold text-text-primary mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 border-y border-border bg-surface/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 text-accent text-xs font-medium mb-4">
              <BriefcaseBusiness className="h-3 w-3" />
              Negocio
            </div>
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Gestao completa para o seu negocio
            </h2>
            <p className="text-text-secondary text-lg max-w-2xl mx-auto">
              Compras, vendas, estoque e clientes. Tudo em um lugar, com
              relatorios reais.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {businessFeatures.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl border border-border bg-surface hover:border-border/80 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="font-semibold text-text-primary mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-warning/10 text-warning text-xs font-medium mb-4">
              <Crown className="h-3 w-3" />
              Planos
            </div>
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Comece gratis. Cresca quando quiser.
            </h2>
            <p className="text-text-secondary text-lg max-w-2xl mx-auto">
              Todos os planos pagos dao acesso total ao Personal e ao Business.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={
                  "relative rounded-xl border p-6 flex flex-col " +
                  (plan.highlight
                    ? "border-accent/40 bg-gradient-to-br from-accent/10 to-accent/5"
                    : "border-border bg-surface")
                }
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-accent text-white text-[10px] font-bold uppercase tracking-wide">
                    Mais popular
                  </div>
                )}
                <h3 className="text-lg font-bold text-text-primary">
                  {plan.name}
                </h3>
                <div className="mt-3 mb-1">
                  <span className="text-2xl font-bold text-text-primary">
                    {plan.price}
                  </span>
                  <span className="ml-1 text-xs text-text-muted">
                    {plan.period}
                  </span>
                </div>
                <p className="text-xs text-text-secondary mb-5 min-h-[2.5rem]">
                  {plan.description}
                </p>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-xs text-text-secondary"
                    >
                      <Check className="h-3.5 w-3.5 mt-0.5 text-profit shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/register" className="block">
                  <Button
                    variant={plan.highlight ? "default" : "outline"}
                    className="w-full"
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-10 rounded-2xl bg-surface border border-border relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-profit/5 pointer-events-none" />
            <h2 className="text-2xl font-bold text-text-primary mb-4 relative">
              Comece hoje. 7 dias gratis.
            </h2>
            <p className="text-text-secondary mb-6 relative">
              Teste o Personal, o Business ou os dois. Sem cartao.
            </p>
            <ul className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 relative">
              {["Sem cartao", "Ativacao em 1 clique", "Dados preservados"].map(
                (item) => (
                  <li
                    key={item}
                    className="flex items-center gap-1.5 text-sm text-text-secondary"
                  >
                    <Check className="h-4 w-4 text-profit shrink-0" />
                    {item}
                  </li>
                )
              )}
            </ul>
            <Link href="/register">
              <Button size="lg" className="relative px-10">
                Criar conta gratis
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 px-4 border-t border-border text-center">
        <p className="text-sm text-text-secondary">
          &copy; {new Date().getFullYear()} GranaBase. Feito para quem corre
          atras.
        </p>
      </footer>
    </div>
  );
}
