"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Loader2,
  PiggyBank,
  Sparkles,
  Gift,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { AccessSummaryCard } from "@/components/access/AccessSummaryCard";

type Product = "personal" | "business";

type AccessStatus = {
  product: Product;
  has_access: boolean;
  access_until: string | null;
  days_remaining: number | null;
  source: string | null;
  has_free_activated: boolean;
  can_activate_free: boolean;
};

const PRODUCT_INFO: Record<
  Product,
  { label: string; description: string; icon: typeof PiggyBank }
> = {
  personal: {
    label: "Pessoal",
    description:
      "Entradas, gastos, metas, investimentos, consorcios e mais para sua vida financeira.",
    icon: PiggyBank,
  },
  business: {
    label: "Negocio",
    description:
      "Compras, vendas, estoque, clientes e relatorios para o seu negocio.",
    icon: BriefcaseBusiness,
  },
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function OnboardingPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<Product | null>(null);
  const [statuses, setStatuses] = useState<AccessStatus[]>([]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        "get_my_product_access_status"
      );
      if (error) throw error;
      setStatuses((data as AccessStatus[] | null) ?? []);
    } catch (error) {
      console.error("Erro ao carregar status:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao carregar status";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleActivate(product: Product) {
    setActivating(product);
    try {
      const { error } = await supabase.rpc("activate_free_product", {
        p_product: product,
      });
      if (error) throw error;

      toast.success(
        `Periodo gratuito de ${PRODUCT_INFO[product].label} ativado`
      );
      await loadStatus();
    } catch (error) {
      console.error("Erro ao ativar:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao ativar periodo";
      toast.error(msg);
    } finally {
      setActivating(null);
    }
  }

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <Sparkles className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
              Comece agora
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Ative 7 dias gratuitos em cada produto. Voce escolhe quais quer
              testar.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {statuses.map((status) => (
              <ProductCard
                key={status.product}
                status={status}
                activating={activating === status.product}
                onActivate={() => void handleActivate(status.product)}
              />
            ))}
          </div>

          {/* Resumo de acesso */}
          <AccessSummaryCard variant="compact" className="mt-6" />

          {/* CTA Indique e Ganhe */}
          <div className="mt-6 rounded-xl border border-profit/30 bg-profit/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-profit/15">
                  <Gift className="h-5 w-5 text-profit" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    Precisa de mais dias gratis?
                  </p>
                  <p className="text-xs text-text-secondary">
                    Indique amigos e ganhe dias bonus + comissao por indicacao.
                  </p>
                </div>
              </div>
              <Link href="/referrals">
                <Button variant="outline" size="sm" className="gap-2">
                  <Gift className="h-4 w-4" />
                  Indique e Ganhe
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  free: "Periodo gratuito",
  referral: "Bonus por indicacao",
  bonus: "Bonus",
  admin: "Bonus (admin)",
  subscription: "Assinatura",
  super_admin: "Super Admin",
};

function ProductCard({
  status,
  activating,
  onActivate,
}: {
  status: AccessStatus;
  activating: boolean;
  onActivate: () => void;
}) {
  const info = PRODUCT_INFO[status.product];
  const Icon = info.icon;
  const remaining = status.days_remaining;

  // Estados:
  // 1. Tem acesso (free ativo, bonus, assinatura, etc)
  // 2. Nunca ativou — pode ativar free
  // 3. Ativou mas expirou — so paga ou ganha bonus
  const isActive = status.has_access;
  const canActivate = status.can_activate_free;
  const hasExpired =
    !isActive && status.has_free_activated && !status.can_activate_free;

  let badge: React.ReactNode = null;
  if (isActive) {
    const sourceLabel = status.source
      ? SOURCE_LABELS[status.source] ?? status.source
      : "Ativo";
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full border border-profit/30 bg-profit/10 px-2.5 py-0.5 text-xs font-medium text-profit">
        <CheckCircle2 className="h-3 w-3" />
        {sourceLabel}
        {remaining !== null && remaining > 0 ? ` · ${remaining}d` : ""}
      </span>
    );
  } else if (hasExpired) {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
        <Clock className="h-3 w-3" />
        Expirado
      </span>
    );
  } else {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
        Disponivel
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-surface p-6",
        isActive
          ? "border-profit/40"
          : hasExpired
          ? "border-warning/30"
          : "border-border/60"
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
          <Icon className="h-5 w-5 text-accent" />
        </div>
        {badge}
      </div>

      <h2 className="text-lg font-bold text-text-primary">{info.label}</h2>
      <p className="mt-1 flex-1 text-sm text-text-secondary">
        {info.description}
      </p>

      {status.access_until && isActive && (
        <p className="mt-3 text-xs text-text-muted">
          Ativo ate {formatDate(status.access_until)}
        </p>
      )}

      <div className="mt-4">
        {canActivate ? (
          <Button
            type="button"
            className="w-full gap-2"
            disabled={activating}
            onClick={onActivate}
          >
            {activating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Ativar 7 dias gratis
          </Button>
        ) : isActive ? (
          <Button type="button" variant="outline" className="w-full" disabled>
            Ativo agora
          </Button>
        ) : (
          <Link href="/plans" className="block">
            <Button type="button" variant="outline" className="w-full gap-2">
              <Sparkles className="h-4 w-4" />
              Ver planos
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
