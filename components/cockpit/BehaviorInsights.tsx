"use client";

import { TrendingDown, TrendingUp, Minus, BarChart3 } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { BehaviorReport, CategoryTrend } from "@/lib/behavioral-engine";

interface BehaviorInsightsProps {
  report: BehaviorReport;
  loading?: boolean;
}

const trendConfig = {
  improving: { icon: TrendingDown, color: "text-profit", bg: "bg-profit/10",  label: "↓ Reduzindo" },
  worsening: { icon: TrendingUp,   color: "text-expense", bg: "bg-expense/10", label: "↑ Crescendo" },
  stable:    { icon: Minus,         color: "text-text-muted", bg: "bg-border/30",  label: "→ Estável"  },
} as const;

function DisciplineGauge({ score }: { score: number }) {
  const color =
    score >= 70 ? "#22C55E" :
    score >= 50 ? "#38BDF8" :
    score >= 30 ? "#FACC15" : "#EF4444";
  const label =
    score >= 70 ? "Disciplinado" :
    score >= 50 ? "Equilibrado" :
    score >= 30 ? "Atenção" : "Crítico";

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-border/15 border border-border/30">
      <div className="relative w-12 h-12 shrink-0">
        <svg width="48" height="48" className="-rotate-90">
          <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(30,41,59,0.8)" strokeWidth="4" />
          <circle
            cx="24" cy="24" r="18" fill="none"
            stroke={color} strokeWidth="4"
            strokeDasharray={`${(score / 100) * (2 * Math.PI * 18)} ${2 * Math.PI * 18}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-black" style={{ color }}>
          {score}
        </span>
      </div>
      <div>
        <p className="text-xs text-text-muted">Disciplina Financeira</p>
        <p className="text-base font-bold" style={{ color }}>{label}</p>
        <p className="text-[10px] text-text-muted mt-0.5">baseado nos últimos 60 dias</p>
      </div>
    </div>
  );
}

function CategoryRow({ trend }: { trend: CategoryTrend }) {
  const cfg = trendConfig[trend.trend];
  const Icon = cfg.icon;
  const absPct = Math.abs(Math.round(trend.changePercent));

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/20 last:border-0">
      <div className={cn("p-1.5 rounded-lg shrink-0", cfg.bg)}>
        <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{trend.category}</p>
        <p className="text-xs text-text-muted">
          {formatCurrency(trend.previous30)} → {formatCurrency(trend.recent30)}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className={cn("text-sm font-bold tabular-nums", cfg.color)}>
          {trend.trend === "improving" ? "-" : trend.trend === "worsening" ? "+" : ""}{absPct}%
        </p>
        <p className={cn("text-[10px]", cfg.color)}>{cfg.label}</p>
      </div>
    </div>
  );
}

export function BehaviorInsights({ report, loading }: BehaviorInsightsProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-20 bg-border/20 rounded-xl animate-pulse" />
        {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-border/20 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  if (report.categoryTrends.length === 0 && report.highlights.length === 0) {
    return (
      <div className="cockpit-card p-6 text-center">
        <BarChart3 className="h-8 w-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-muted">Dados insuficientes para análise de comportamento.</p>
        <p className="text-xs text-text-muted mt-1">
          Registre gastos por pelo menos 60 dias para ver tendências.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Discipline gauge */}
      <DisciplineGauge score={report.disciplineScore} />

      {/* Highlights */}
      {report.highlights.length > 0 && (
        <div className="space-y-2">
          {report.highlights.map((h) => (
            <div
              key={h.id}
              className={cn(
                "flex items-start gap-3 p-3 rounded-xl border",
                h.type === "positive" && "bg-profit/5 border-profit/20",
                h.type === "negative" && "bg-expense/5 border-expense/20",
                h.type === "neutral"  && "bg-border/15 border-border/30"
              )}
            >
              <span className="text-lg leading-none">{h.emoji}</span>
              <p className={cn(
                "text-sm",
                h.type === "positive" && "text-profit",
                h.type === "negative" && "text-expense",
                h.type === "neutral"  && "text-text-secondary"
              )}>
                {h.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Category trends */}
      {report.categoryTrends.length > 0 && (
        <div className="cockpit-card p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Últimos 30d vs. 30d anteriores
          </p>
          <div>
            {report.categoryTrends.slice(0, 6).map((trend) => (
              <CategoryRow key={trend.category} trend={trend} />
            ))}
          </div>
        </div>
      )}

      {/* Overall spending change */}
      {Math.abs(report.spendingChangePercent) > 5 && (
        <div className={cn(
          "flex items-center gap-3 p-3 rounded-xl border",
          report.overallTrend === "improving" ? "bg-profit/5 border-profit/20" :
          report.overallTrend === "worsening" ? "bg-expense/5 border-expense/20" :
          "bg-border/15 border-border/30"
        )}>
          <span className="text-xl">
            {report.overallTrend === "improving" ? "📉" : report.overallTrend === "worsening" ? "📈" : "📊"}
          </span>
          <div>
            <p className={cn(
              "text-sm font-semibold",
              report.overallTrend === "improving" ? "text-profit" :
              report.overallTrend === "worsening" ? "text-expense" : "text-text-secondary"
            )}>
              {report.overallTrend === "improving"
                ? `Gastos totais caíram ${Math.abs(Math.round(report.spendingChangePercent))}%`
                : report.overallTrend === "worsening"
                ? `Gastos totais subiram ${Math.round(report.spendingChangePercent)}%`
                : "Gastos estáveis"}
            </p>
            <p className="text-xs text-text-muted">comparando últimos 30d com 30d anteriores</p>
          </div>
        </div>
      )}
    </div>
  );
}
