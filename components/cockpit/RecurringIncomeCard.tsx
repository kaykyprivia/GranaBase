"use client";

import { Repeat, TrendingUp } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { RecurringIncomePattern } from "@/lib/projection-engine";

interface RecurringIncomeCardProps {
  patterns: RecurringIncomePattern[];
  projectedNext30: number;
  loading?: boolean;
}

const confidenceStyles = {
  Alta:  { dot: "bg-profit",   text: "text-profit",   badge: "bg-profit/15 text-profit border-profit/20" },
  Média: { dot: "bg-warning",  text: "text-warning",  badge: "bg-warning/15 text-warning border-warning/20" },
  Baixa: { dot: "bg-text-muted", text: "text-text-muted", badge: "bg-border/40 text-text-muted border-border/50" },
} as const;

export function RecurringIncomeCard({ patterns, projectedNext30, loading }: RecurringIncomeCardProps) {
  if (loading) {
    return (
      <div className="cockpit-card p-5 space-y-3">
        <div className="h-4 w-40 bg-border/40 rounded animate-pulse" />
        {[1, 2].map((i) => <div key={i} className="h-12 bg-border/20 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  if (patterns.length === 0) return null;

  return (
    <div className="cockpit-card p-5 animate-fade-up delay-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Renda Recorrente Detectada
          </p>
          <p className="text-sm font-semibold text-text-primary mt-0.5">
            {patterns.length} padrão{patterns.length > 1 ? "s" : ""} identificado{patterns.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-text-muted">Esperado (30d)</p>
          <p className="text-base font-black text-profit tabular-nums">
            {formatCurrency(projectedNext30)}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {patterns.map((pattern) => {
          const styles = confidenceStyles[pattern.confidenceLabel];
          const varPct = pattern.maxAmount > 0
            ? Math.round(((pattern.maxAmount - pattern.minAmount) / pattern.maxAmount) * 100)
            : 0;

          return (
            <div
              key={pattern.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-border/15 border border-border/30"
            >
              <div className="p-2 rounded-lg bg-profit/10 shrink-0">
                <Repeat className="h-3.5 w-3.5 text-profit" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{pattern.label}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-text-muted">Todo dia {pattern.expectedDayOfMonth}</p>
                  {varPct > 10 && (
                    <span className="text-[10px] text-text-muted">±{varPct}% variação</span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-profit tabular-nums">
                  {formatCurrency(pattern.estimatedAmount)}
                </p>
                <span className={cn(
                  "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border inline-block mt-0.5",
                  styles.badge
                )}>
                  Confiança {pattern.confidenceLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border/30 flex items-center gap-2 text-xs text-text-muted">
        <TrendingUp className="h-3.5 w-3.5 text-profit shrink-0" />
        <span>
          Entradas detectadas do histórico. Projetadas na Timeline automaticamente.
        </span>
      </div>
    </div>
  );
}
