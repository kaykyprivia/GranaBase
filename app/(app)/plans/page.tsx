"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Crown, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
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
  priceLabel: string;
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
      "Acesso ao Personal e Negocio",
      "7 dias de teste em cada",
      "Sem cartao de credito",
    ],
  },
  {
    id: "monthly",
    name: "Mensal",
    price: "R$ 19,90",
    priceLabel: "por mes",
    features: [
      "Acesso completo ao Personal",
      "Acesso completo ao Negocio",
      "Cancele quando quiser",
    ],
  },
  {
    id: "semiannual",
    name: "Semestral",
    price: "R$ 65,67",
    priceLabel: "a cada 6 meses",
    badge: "45% OFF",
    highlight: true,
    features: [
      "Tudo do Mensal",
      "Economia de 45%",
      "Comissao de indicacao: 25%",
    ],
  },
  {
    id: "annual",
    name: "Anual",
    price: "R$ 167,16",
    priceLabel: "por ano",
    badge: "30% OFF",
    features: [
      "Tudo do Mensal",
      "Economia de 30%",
      "Comissao de indicacao: 35%",
    ],
  },
];

type SubscriptionInfo = {
  plan: string;
  status: string;
  current_period_end: string | null;
} | null;

export default function PlansPage() {
  const router = useRouter();
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
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <Crown className="h-6 w-6 text-accent" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
          Escolha seu plano
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Acesso completo ao GranaBase Pessoal e Negocio. Cancele quando quiser.
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[420px] rounded-xl" />
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
                  "relative flex flex-col rounded-xl border p-5 transition-all",
                  plan.highlight
                    ? "border-accent/40 bg-accent/5 shadow-lg"
                    : "border-border/60 bg-surface",
                  plan.id === "free" && "opacity-90"
                )}
              >
                {plan.badge && (
                  <div className="absolute -top-3 right-4 rounded-full bg-accent px-3 py-1 text-xs font-bold text-white shadow">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-lg font-bold text-text-primary">
                    {plan.name}
                  </h3>
                  <div className="mt-2">
                    <span className="text-2xl font-bold text-text-primary">
                      {plan.price}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {plan.priceLabel}
                  </p>
                </div>

                <ul className="mb-6 flex-1 space-y-2">
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
                      "Assinar"
                    )}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
