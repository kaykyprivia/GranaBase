"use client";

import Link from "next/link";
import { AlertTriangle, Shield } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { FinancialProjection } from "@/lib/projection-engine";

interface ExecutiveModeProps {
  projection: FinancialProjection;
  loading?: boolean;
}

/** Circular health indicator (0–100 score rendered as arc) */
function HealthRing({ score }: { score: number }) {
  const color =
    score >= 70 ? "#22C55E" : score >= 50 ? "#38BDF8" : score >= 30 ? "#FACC15" : "#EF4444";
  const circumference = 2 * Math.PI * 14; // r=14
  const progress = (score / 100) * circumference;

  return (
    <div className="relative w-10 h-10 shrink-0">
      <svg width="40" height="40" className="-rotate-90">
        <circle cx="20" cy="20" r="14" fill="none" stroke="rgba(30,41,59,0.8)" strokeWidth="3" />
        <circle
          cx="20" cy="20" r="14" fill="none"
          stroke={color} strokeWidth="3"
          strokeDasharray={`${progress} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[11px] font-black"
        style={{ color }}
      >
        {score}
      </span>
    </div>
  );
}

function PressureDot({ level }: { level: FinancialProjection["pressureLevel"] }) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold",
      level === "healthy"   && "bg-profit/10 border-profit/25 text-profit",
      level === "attention" && "bg-warning/10 border-warning/25 text-warning",
      level === "critical"  && "bg-expense/10 border-expense/25 text-expense"
    )}>
      <div className={cn(
        "w-1.5 h-1.5 rounded-full",
        level === "healthy"   && "bg-profit",
        level === "attention" && "bg-warning animate-pulse",
        level === "critical"  && "bg-expense animate-pulse"
      )} />
      {level === "healthy" ? "OK" : level === "attention" ? "⚡" : "🔴"}
    </div>
  );
}

export function ExecutiveMode({ projection, loading }: ExecutiveModeProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-border/40 animate-pulse">
        <div className="w-10 h-10 rounded-full bg-border/40" />
        <div className="flex-1 h-4 bg-border/40 rounded" />
      </div>
    );
  }

  const radarAvg = projection.radar.length > 0
    ? Math.round(projection.radar.reduce((s, d) => s + d.score, 0) / projection.radar.length)
    : 0;

  // Next event from the timeline
  const nextEvent = projection.days
    .slice(1)
    .find((d) => d.events.length > 0);

  const freeColor = projection.freeMoneyReal >= 0 ? "text-profit" : "text-expense";

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-surface-2 animate-fade-in overflow-x-auto">
      {/* Health ring */}
      <HealthRing score={radarAvg} />

      {/* Divider */}
      <div className="w-px h-8 bg-border/50 shrink-0" />

      {/* Free money */}
      <div className="shrink-0">
        <p className="text-[10px] text-text-muted">Livre</p>
        <p className={cn("text-sm font-black tabular-nums leading-tight", freeColor)}>
          {formatCurrency(projection.freeMoneyReal)}
        </p>
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-border/50 shrink-0" />

      {/* Pressure */}
      <div className="shrink-0">
        <p className="text-[10px] text-text-muted mb-0.5">Pressão</p>
        <PressureDot level={projection.pressureLevel} />
      </div>

      {/* Divider */}
      <div className="w-px h-8 bg-border/50 shrink-0" />

      {/* Next event */}
      {nextEvent && (
        <>
          <div className="min-w-0">
            <p className="text-[10px] text-text-muted">Próximo evento</p>
            <p className="text-xs font-semibold text-text-primary truncate">
              {nextEvent.dateLabel} — {nextEvent.events[0]?.title}
            </p>
          </div>
          <div className="w-px h-8 bg-border/50 shrink-0" />
        </>
      )}

      {/* Risk alert or health icon */}
      <div className="ml-auto shrink-0">
        {projection.nextRiskDate ? (
          <Link href="/timeline">
            <div className="flex items-center gap-1 text-expense">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-[10px] font-semibold">Risco</span>
            </div>
          </Link>
        ) : projection.pressureLevel === "healthy" ? (
          <Shield className="h-4 w-4 text-profit" />
        ) : null}
      </div>
    </div>
  );
}
