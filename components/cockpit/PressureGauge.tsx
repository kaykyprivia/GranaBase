"use client";

import { cn, formatCurrency } from "@/lib/utils";
import type { PressureLevel } from "@/lib/projection-engine";

interface PressureGaugeProps {
  score: number;
  level: PressureLevel;
  loading?: boolean;
  committedAmount: number;
  avgMonthlyIncome: number;
  /** Projected income in next 30 days from recurring patterns (optional) */
  projectedIncomeNext30?: number;
}

const levelLabels: Record<PressureLevel, string> = {
  healthy:   "Saudável",
  attention: "Atenção",
  critical:  "Crítico",
};

const levelColors: Record<PressureLevel, string> = {
  healthy:   "text-profit",
  attention: "text-warning",
  critical:  "text-expense",
};

const fillClass: Record<PressureLevel, string> = {
  healthy:   "pressure-bar-fill-healthy",
  attention: "pressure-bar-fill-attention",
  critical:  "pressure-bar-fill-critical",
};

function FormatK({ value }: { value: number }) {
  if (value >= 1000) return <>{`R$ ${(value / 1000).toFixed(1)}k`}</>;
  return <>{formatCurrency(value)}</>;
}

export function PressureGauge({
  score,
  level,
  loading,
  committedAmount,
  avgMonthlyIncome,
  projectedIncomeNext30 = 0,
}: PressureGaugeProps) {
  if (loading) {
    return (
      <div className="cockpit-card p-5 space-y-3">
        <div className="h-4 w-36 bg-border/40 rounded animate-pulse" />
        <div className="h-3 bg-border/40 rounded animate-pulse" />
        <div className="flex justify-between">
          <div className="h-3 w-20 bg-border/40 rounded animate-pulse" />
          <div className="h-3 w-16 bg-border/40 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const clampedScore = Math.min(100, Math.max(0, score));
  const hasProjectedIncome = projectedIncomeNext30 > 0;
  // Show projected income when it materially reduces apparent pressure
  const effectiveBase = hasProjectedIncome
    ? Math.max(avgMonthlyIncome, projectedIncomeNext30)
    : avgMonthlyIncome;

  return (
    <div className="cockpit-card p-5 animate-fade-up delay-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Pressão Financeira
          </p>
          <p className={cn("text-base font-bold mt-0.5", levelColors[level])}>
            {levelLabels[level]}
          </p>
        </div>
        <div className={cn("text-2xl font-black tabular-nums", levelColors[level])}>
          {clampedScore}
          <span className="text-base font-normal text-text-muted">%</span>
        </div>
      </div>

      {/* Bar */}
      <div className="pressure-bar-track h-3 mb-3">
        <div
          className={cn("h-full rounded-full transition-all duration-700", fillClass[level])}
          style={{ width: `${clampedScore}%` }}
        />
      </div>

      {/* Threshold markers */}
      <div className="flex justify-between text-[10px] text-text-muted mb-4">
        <span>0%</span>
        <span className="text-profit">40% Saudável</span>
        <span className="text-warning">70% Atenção</span>
        <span className="text-expense">100%</span>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-3 border-t border-border/30 pt-3">
        <div>
          <p className="text-xs text-text-muted">Comprometido (30d)</p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            <FormatK value={committedAmount} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-text-muted">
            {hasProjectedIncome ? "Base de cálculo" : "Renda média"}
          </p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            <FormatK value={effectiveBase} />
          </p>
        </div>
      </div>

      {/* Projected income badge — shows when recurring income is detected */}
      {hasProjectedIncome && (
        <div className="mt-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-profit/8 border border-profit/15">
          <div className="w-1.5 h-1.5 rounded-full bg-profit animate-pulse shrink-0" />
          <p className="text-[11px] text-profit font-medium">
            {formatCurrency(projectedIncomeNext30)} de renda recorrente esperada (30d)
          </p>
        </div>
      )}
    </div>
  );
}
