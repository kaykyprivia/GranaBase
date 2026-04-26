import { Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] flex-col justify-between p-12 bg-gradient-to-br from-surface via-background to-[#0A1628] border-r border-border relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-profit/5 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-accent/20 border border-accent/30">
            <Wallet className="h-6 w-6 text-accent" />
          </div>
          <div>
            <span className="text-2xl font-bold text-text-primary">Grana</span>
            <span className="text-2xl font-bold text-accent">Base</span>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative">
          <h1 className="text-4xl xl:text-5xl font-bold text-text-primary leading-tight mb-6">
            Domine suas finanças,{" "}
            <span className="text-accent">mesmo com renda variável.</span>
          </h1>
          <p className="text-lg text-text-secondary leading-relaxed mb-10">
            Para autônomos, freelancers e empreendedores que precisam de clareza
            financeira real — sem planilha, sem complicação.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Entradas rastreadas", value: "100%", color: "text-profit" },
              { label: "Visão do saldo", value: "Real time", color: "text-accent" },
              { label: "Contas no prazo", value: "Alertas", color: "text-warning" },
              { label: "Metas cumpridas", value: "Com foco", color: "text-profit" },
            ].map((item) => (
              <div key={item.label} className="p-4 rounded-xl bg-surface/50 border border-border/50">
                <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
                <p className="text-sm text-text-secondary">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonial */}
        <div className="relative p-5 rounded-xl bg-surface/50 border border-border/50">
          <p className="text-sm text-text-secondary italic leading-relaxed">
            &quot;Finalmente entendi para onde ia meu dinheiro. Em 1 semana já sabia o
            que cortar e o que guardar.&quot;
          </p>
          <p className="text-xs text-text-secondary mt-2 font-medium">
            — Ana Lívia, Designer Freelancer
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="p-2 rounded-xl bg-accent/20">
              <Wallet className="h-5 w-5 text-accent" />
            </div>
            <span className="text-xl font-bold">
              Grana<span className="text-accent">Base</span>
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
