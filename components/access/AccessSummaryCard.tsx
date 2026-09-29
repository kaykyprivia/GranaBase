"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  Gift,
  History,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type BreakdownItem = {
  product: "personal" | "business";
  source: string;
  starts_at: string;
  ends_at: string | null;
  days: number;
  reason: string;
  granted_at: string;
};

type AccessSummary = {
  access_until: string | null;
  days_remaining: number;
  total_bonus_days: number;
  breakdown: BreakdownItem[];
};

const SOURCE_LABELS: Record<string, string> = {
  free: "Periodo gratuito",
  bonus: "Bonus",
  referral: "Indicacao",
  admin: "Bonus (admin)",
  subscription: "Assinatura",
};

const REASON_LABELS: Record<string, string> = {
  "free-activation": "Ativacao do free",
  "mission-streak-7": "Tarefa: 7 dias seguidos",
  "mission-streak-30": "Tarefa: 30 dias seguidos",
  "mission-share-weekly": "Tarefa: compartilhar",
  "referral-purchase": "Indicacao convertida",
  "test-stacking": "Bonus de teste",
  "referral-signup": "Indicacao cadastrada",
};

const PRODUCT_LABELS: Record<string, string> = {
  personal: "Pessoal",
  business: "Negocio",
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface AccessSummaryCardProps {
  variant?: "full" | "compact";
  className?: string;
}

export function AccessSummaryCard({
  variant = "full",
  className,
}: AccessSummaryCardProps) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<AccessSummary | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("get_my_access_summary");
        if (error) throw error;
        if (!active) return;

        const list = data as AccessSummary[] | null;
        setSummary(list?.[0] ?? null);
      } catch (err) {
        console.warn("Erro ao carregar resumo de acesso:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase]);

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-border/60 bg-surface p-6",
          className
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    );
  }

  if (!summary || summary.days_remaining === 0) {
    return null;
  }

  const isCompact = variant === "compact";

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-surface p-5",
        className
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
          <TrendingUp className="h-5 w-5 text-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Seu acesso atual
          </p>
          <p className="text-xs text-text-secondary">
            Acompanhe seus dias disponiveis
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div
        className={cn(
          "grid gap-3",
          isCompact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
        )}
      >
        <div className="rounded-lg border border-profit/30 bg-profit/5 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-profit">
            <Calendar className="h-3.5 w-3.5" />
            <p className="text-[10px] font-medium uppercase tracking-wider">
              Acesso ate
            </p>
          </div>
          <p className="text-lg font-bold text-text-primary">
            {formatDate(summary.access_until)}
          </p>
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3">
          <div className="mb-1 flex items-center gap-1.5 text-accent">
            <Clock className="h-3.5 w-3.5" />
            <p className="text-[10px] font-medium uppercase tracking-wider">
              Dias restantes
            </p>
          </div>
          <p className="text-lg font-bold text-text-primary">
            {summary.days_remaining}
            <span className="ml-1 text-xs font-medium text-text-secondary">
              dias
            </span>
          </p>
        </div>

        {!isCompact && (
          <div className="col-span-2 sm:col-span-1 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-warning">
              <Gift className="h-3.5 w-3.5" />
              <p className="text-[10px] font-medium uppercase tracking-wider">
                Ganhos por tarefas
              </p>
            </div>
            <p className="text-lg font-bold text-text-primary">
              +{summary.total_bonus_days}
              <span className="ml-1 text-xs font-medium text-text-secondary">
                dias
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Historico detalhado (apenas variant full) */}
      {!isCompact && summary.breakdown.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2">
            <History className="h-3.5 w-3.5 text-text-muted" />
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Historico de dias
            </p>
          </div>
          <div className="space-y-2">
            {summary.breakdown.map((item, index) => {
              const sourceLabel =
                SOURCE_LABELS[item.source] ?? item.source;
              const reasonLabel =
                REASON_LABELS[item.reason] ?? item.reason;
              const productLabel =
                PRODUCT_LABELS[item.product] ?? item.product;

              return (
                <div
                  key={index}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        item.source === "free"
                          ? "bg-accent/10 text-accent"
                          : item.source === "subscription"
                          ? "bg-profit/10 text-profit"
                          : "bg-warning/10 text-warning"
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-text-primary">
                        {reasonLabel}
                      </p>
                      <p className="truncate text-[10px] text-text-muted">
                        {sourceLabel} · {productLabel} ·{" "}
                        {formatDate(item.starts_at)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-text-primary">
                    +{item.days}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
