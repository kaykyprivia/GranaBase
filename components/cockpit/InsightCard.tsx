"use client";

import { cn } from "@/lib/utils";
import type { FinancialInsight } from "@/lib/insights-engine";
import { formatCurrency } from "@/lib/utils";

interface InsightCardProps {
  insight: FinancialInsight;
  compact?: boolean;
}

export function InsightCard({ insight, compact }: InsightCardProps) {
  const cardClass = {
    critical: "insight-card-critical",
    warning: "insight-card-warning",
    positive: "insight-card-positive",
    info: "insight-card-info",
  }[insight.severity];

  const titleColor = {
    critical: "text-expense",
    warning: "text-warning",
    positive: "text-profit",
    info: "text-accent",
  }[insight.severity];

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all duration-200 hover:scale-[1.01]",
      cardClass
    )}>
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none mt-0.5 shrink-0">{insight.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", titleColor)}>
            {insight.title}
          </p>
          {!compact && (
            <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
              {insight.message}
            </p>
          )}
          {insight.value !== undefined && !compact && (
            <p className={cn("text-xs font-semibold mt-1.5 tabular-nums", titleColor)}>
              {formatCurrency(insight.value)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface InsightGridProps {
  insights: FinancialInsight[];
  loading?: boolean;
  limit?: number;
}

export function InsightGrid({ insights, loading, limit = 4 }: InsightGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-border/20 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-xl border border-profit/20 bg-profit/5">
        <span className="text-2xl">✅</span>
        <div>
          <p className="text-sm font-semibold text-profit">Tudo sob controle</p>
          <p className="text-xs text-text-secondary">Nenhum alerta financeiro no momento</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {insights.slice(0, limit).map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}
