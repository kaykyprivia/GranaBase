import Link from "next/link";
import {
  TrendingUp, TrendingDown, FileText, Target,
  BarChart3, Shield, Zap, ChevronRight, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/shared/BrandLogo";

const features = [
  {
    icon: TrendingUp,
    title: "Rastreie entradas",
    description: "Registre bicos, freelas, vendas e comissões. Saiba exatamente quanto entrou.",
    color: "text-profit",
    bg: "bg-profit/10",
  },
  {
    icon: TrendingDown,
    title: "Controle gastos",
    description: "Categorize e entenda para onde vai seu dinheiro. Corte o que não agrega.",
    color: "text-expense",
    bg: "bg-expense/10",
  },
  {
    icon: FileText,
    title: "Gerencie contas",
    description: "Nunca mais pague juros por esquecimento. Alertas inteligentes de vencimento.",
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    icon: Target,
    title: "Alcance metas",
    description: "Defina objetivos e acompanhe seu progresso. Reserva, quitação, compra.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    icon: BarChart3,
    title: "Relatórios reais",
    description: "Gráficos e análises que mostram sua evolução financeira mês a mês.",
    color: "text-profit",
    bg: "bg-profit/10",
  },
  {
    icon: Shield,
    title: "100% seguro",
    description: "Seus dados protegidos com Row Level Security. Só você acessa o seu.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandLogo className="h-12 rounded-xl" priority />
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Começar grátis</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-profit/5 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-sm font-medium mb-6">
            <Zap className="h-3.5 w-3.5" />
            Para quem não tem salário fixo
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-text-primary leading-tight mb-6">
            Controle financeiro para{" "}
            <span className="text-accent">renda variável</span>
          </h1>
          <p className="text-lg sm:text-xl text-text-secondary leading-relaxed mb-10 max-w-2xl mx-auto">
            Autônomos, freelancers e pequenos empreendedores merecem uma ferramenta
            que entende como sua renda funciona. Sem planilha. Sem complicação.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto px-8">
                Começar grátis agora
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Já tenho conta
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-text-secondary">
            Grátis para sempre. Sem cartão de crédito.
          </p>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4 border-y border-border">
        <div className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { value: "R$ 0", label: "Custo mensal" },
            { value: "< 2 min", label: "Para registrar" },
            { value: "100%", label: "Privacidade" },
            { value: "Sempre", label: "Disponível" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="text-3xl font-bold text-accent mb-1">{stat.value}</p>
              <p className="text-sm text-text-secondary">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-text-primary mb-4">
              Tudo que você precisa em um lugar
            </h2>
            <p className="text-text-secondary text-lg max-w-2xl mx-auto">
              Desenvolvido especialmente para quem tem renda variável e precisa
              de clareza financeira real.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="p-6 rounded-xl border border-border bg-surface hover:border-border/80 transition-all duration-200 group"
              >
                <div className={`w-10 h-10 rounded-lg ${feature.bg} flex items-center justify-center mb-4`}>
                  <feature.icon className={`h-5 w-5 ${feature.color}`} />
                </div>
                <h3 className="font-semibold text-text-primary mb-2">{feature.title}</h3>
                <p className="text-sm text-text-secondary leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="p-10 rounded-2xl bg-surface border border-border relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-profit/5 pointer-events-none" />
            <h2 className="text-2xl font-bold text-text-primary mb-4 relative">
              Comece hoje. É gratuito.
            </h2>
            <p className="text-text-secondary mb-6 relative">
              Junte-se a quem parou de ter surpresas financeiras.
            </p>
            <ul className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8 relative">
              {["Sem limite de registros", "Sem cartão", "Sem pegadinha"].map((item) => (
                <li key={item} className="flex items-center gap-1.5 text-sm text-text-secondary">
                  <Check className="h-4 w-4 text-profit shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/register">
              <Button size="lg" className="relative px-10">
                Criar conta grátis
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border text-center">
        <p className="text-sm text-text-secondary">
          © {new Date().getFullYear()} GranaBase. Feito para quem corre atrás.
        </p>
      </footer>
    </div>
  );
}
