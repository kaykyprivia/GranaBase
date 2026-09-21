"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Check,
  CreditCard,
  Crown,
  Flame,
  Loader2,
  Lock,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type PlanType = "monthly" | "semiannual" | "annual";

type Plan = {
  id: PlanType | "free";
  name: string;
  price: string;
  originalPrice?: string;
  priceLabel: string;
  discountPercent?: string;
  savings?: string;
  badge?: string;
  highlight?: boolean;
  features: string[];
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "R$ 0",
    priceLabel: "7 dias gratis",
    features: [
      "7 dias no GranaBase Pessoal",
      "7 dias no GranaBase Negocio",
      "Controle de gastos e receitas",
      "Fluxo de caixa completo",
      "Sem cartao de credito",
    ],
  },
  {
    id: "monthly",
    name: "Mensal",
    price: "R$ 19,99",
    originalPrice: "R$ 24,99",
    priceLabel: "por mes",
    discountPercent: "20% OFF",
    savings: "Economize R$ 60,00/ano",
    features: [
      "Personal ilimitado (gastos, metas, investimentos)",
      "Negocio completo (vendas, estoque, clientes)",
      "Consorcios e carteira de investimentos",
      "Relatorios e graficos avancados",
      "Exportacao de PDF",
      "Comissao de indicacao: 15%",
      "Cancele quando quiser",
    ],
  },
  {
    id: "semiannual",
    name: "Semestral",
    price: "R$ 89,96",
    originalPrice: "R$ 149,94",
    priceLabel: "a cada 6 meses",
    discountPercent: "40% OFF",
    savings: "Economize R$ 59,98",
    badge: "MAIS ESCOLHIDO",
    highlight: true,
    features: [
      "Tudo do plano Mensal",
      "Economia de R$ 59,98",
      "Comissao de indicacao: 25%",
      "Suporte prioritario",
      "Acesso antecipado a novidades",
      "Backup em nuvem ilimitado",
    ],
  },
  {
    id: "annual",
    name: "Anual",
    price: "R$ 164,93",
    originalPrice: "R$ 299,88",
    priceLabel: "por ano",
    discountPercent: "45% OFF",
    savings: "Economize R$ 134,95",
    features: [
      "Tudo do plano Mensal",
      "Economia de R$ 134,95",
      "Comissao de indicacao: 35%",
      "Suporte prioritario",
      "Acesso antecipado a novidades",
      "Backup em nuvem ilimitado",
      "Acesso VIP a novas features",
    ],
  },
];

type SubscriptionInfo = {
  plan: string;
  status: string;
  current_period_end: string | null;
} | null;

export default function PlansPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [subscribingTo, setSubscribingTo] = useState<string | null>(null);
  const [currentSubscription, setCurrentSubscription] =
    useState<SubscriptionInfo>(null);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_subscription");
      if (error) throw error;
      const sub = (data?.[0] ?? null) as SubscriptionInfo;
      setCurrentSubscription(sub);
    } catch (error) {
      console.error("Erro ao carregar assinatura:", error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  async function handleSubscribe(planType: PlanType) {
    setSubscribingTo(planType);
    try {
      const response = await fetch("/api/mp/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planType }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Falha ao iniciar assinatura");
      }

      if (result.initPoint) {
        toast.success("Redirecionando para o Mercado Pago...");
        window.location.href = result.initPoint;
      } else {
        throw new Error("URL de pagamento nao retornada");
      }
    } catch (error) {
      console.error("Erro ao assinar:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao iniciar assinatura"
      );
      setSubscribingTo(null);
    }
  }

  const isSubscribed = Boolean(currentSubscription);

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
            <Crown className="h-7 w-7 text-accent" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
          Escolha seu plano
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Acesso completo ao GranaBase Pessoal e Negocio. Cancele quando quiser.
        </p>

        {/* Gatilhos visuais abaixo do título */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Garantia 7 dias
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-accent" />
            Acesso imediato
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="h-4 w-4 text-accent" />
            Pagamento seguro
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[460px] rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {isSubscribed && currentSubscription && (
            <div className="mb-6 rounded-xl border border-accent/30 bg-accent/5 p-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                <p className="text-sm text-text-primary">
                  Voce ja tem uma assinatura ativa:{" "}
                  <strong className="text-accent">
                    {currentSubscription.plan.toUpperCase()}
                  </strong>
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  "relative flex flex-col rounded-xl border p-5 pt-8 transition-all",
                  plan.highlight
                    ? "border-accent/60 bg-accent/5 shadow-lg ring-1 ring-accent/30"
                    : "border-border/60 bg-surface hover:border-border",
                  plan.id === "free" && "opacity-90"
                )}
              >
                {/* Badge principal (MAIS ESCOLHIDO) */}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-[10px] font-bold tracking-wider text-white shadow-md">
                    <span className="flex items-center gap-1">
                      <Flame className="h-3 w-3" />
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Badge de desconto */}
                {plan.discountPercent && (
                  <div className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white shadow">
                    {plan.discountPercent}
                  </div>
                )}

                {/* Nome do plano */}
                <div className="mb-4">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-lg font-bold text-text-primary">
                      {plan.name}
                    </h3>
                    {plan.highlight && (
                      <BadgeCheck className="h-4 w-4 text-accent" />
                    )}
                  </div>

                  {/* Preços */}
                  <div className="mt-2 flex flex-col gap-0.5">
                    {plan.originalPrice && (
                      <span className="text-xs text-text-muted line-through">
                        {plan.originalPrice}
                      </span>
                    )}
                    <span className="text-2xl font-bold text-text-primary">
                      {plan.price}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {plan.priceLabel}
                  </p>

                  {/* Savings */}
                  {plan.savings && (
                    <p className="mt-1.5 text-[11px] font-medium text-emerald-500">
                      💚 {plan.savings}
                    </p>
                  )}
                </div>

                {/* Features */}
                <ul className="mb-5 flex-1 space-y-2">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-text-secondary"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Botão */}
                {plan.id === "free" ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled
                  >
                    Plano atual
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    disabled={
                      subscribingTo === plan.id ||
                      (isSubscribed && currentSubscription?.plan === plan.id)
                    }
                    onClick={() => handleSubscribe(plan.id as PlanType)}
                  >
                    {subscribingTo === plan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processando...
                      </>
                    ) : isSubscribed &&
                      currentSubscription?.plan === plan.id ? (
                      "Assinatura ativa"
                    ) : (
                      "Assinar agora"
                    )}
                  </Button>
                )}

                {/* Selo de garantia */}
                {plan.id !== "free" && (
                  <p className="mt-2 text-center text-[10px] text-text-muted">
                    <ShieldCheck className="mr-1 inline h-3 w-3" />
                    Garantia de 7 dias
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Rodapé com métodos de pagamento */}
          <div className="mt-8 flex flex-col items-center gap-2 text-xs text-text-secondary">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              <span>Pagamento via Pix ou Cartao de Credito</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              <span>Ambiente 100% seguro via Mercado Pago</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}