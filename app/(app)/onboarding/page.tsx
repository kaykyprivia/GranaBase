"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Clock,
  Loader2,
  PiggyBank,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Product = "personal" | "business";

type FreeStatus = {
  product: Product;
  activated: boolean;
  activation_starts_at: string | null;
  activation_ends_at: string | null;
  is_currently_active: boolean;
  can_activate: boolean;
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

function daysRemaining(endsAt: string | null): number | null {
  if (!endsAt) return null;
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function OnboardingPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<Product | null>(null);
  const [statuses, setStatuses] = useState<FreeStatus[]>([]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        "get_my_free_activation_status"
      );
      if (error) throw error;
      setStatuses((data as FreeStatus[] | null) ?? []);
    } catch (error) {
      console.error("Erro ao carregar status free:", error);
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

      toast.success(`Periodo gratuito de ${PRODUCT_INFO[product].label} ativado`);
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
              Ative 7 dias gratuitos em cada produto. Voce escolhe quais
              quer testar.
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
      )}
    </div>
  );
}

function ProductCard({
  status,
  activating,
  onActivate,
}: {
  status: FreeStatus;
  activating: boolean;
  onActivate: () => void;
}) {
  const info = PRODUCT_INFO[status.product];
  const Icon = info.icon;
  const remaining = daysRemaining(status.activation_ends_at);

  let badge: React.ReactNode = null;
  if (status.is_currently_active) {
    badge = (
      <span className="inline-flex items-center gap-1 rounded-full border border-profit/30 bg-profit/10 px-2.5 py-0.5 text-xs font-medium text-profit">
        <CheckCircle2 className="h-3 w-3" />
        Ativo {remaining !== null ? `· ${remaining}d restantes` : ""}
      </span>
    );
  } else if (status.activated) {
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
        status.is_currently_active
          ? "border-profit/40"
          : status.activated
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

      {status.activation_starts_at && (
        <p className="mt-3 text-xs text-text-muted">
          Inicio: {formatDate(status.activation_starts_at)}
          {status.activation_ends_at &&
            ` · Fim: ${formatDate(status.activation_ends_at)}`}
        </p>
      )}

      <div className="mt-4">
        {status.can_activate ? (
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
        ) : status.is_currently_active ? (
          <Button type="button" variant="outline" className="w-full" disabled>
            Ativo agora
          </Button>
        ) : (
          <Button type="button" variant="outline" className="w-full" disabled>
            Periodo encerrado
          </Button>
        )}
      </div>
    </div>
  );
}
