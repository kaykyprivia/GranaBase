"use client";

import { Activity } from "lucide-react";
import type { PressureLevel } from "@/lib/projection-engine";
import { cn } from "@/lib/utils";

interface ContextualHeaderProps {
  message: string;
  pressureLevel: PressureLevel;
  loading?: boolean;
}

const levelConfig: Record<PressureLevel, { color: string; dot: string; label: string }> = {
  healthy: {
    color: "text-profit",
    dot: "bg-profit",
    label: "Saudável",
  },
  attention: {
    color: "text-warning",
    dot: "bg-warning",
    label: "Atenção",
  },
  critical: {
    color: "text-expense",
    dot: "bg-expense animate-pulse",
    label: "Crítico",
  },
};

export function ContextualHeader({ message, pressureLevel, loading }: ContextualHeaderProps) {
  const config = levelConfig[pressureLevel];

  if (loading) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-surface/40 animate-pulse">
        <div className="w-4 h-4 rounded-full bg-border" />
        <div className="h-4 w-64 bg-border rounded" />
      </div>
    );
  }

  return (
    <div className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300",
      pressureLevel === "healthy" && "border-profit/20 bg-profit/5",
      pressureLevel === "attention" && "border-warning/20 bg-warning/5",
      pressureLevel === "critical" && "border-expense/20 bg-expense/5"
    )}>
      <div className="flex items-center gap-2 shrink-0">
        <div className={cn("w-2 h-2 rounded-full", config.dot)} />
        <Activity className={cn("h-4 w-4", config.color)} />
      </div>
      <p className="text-sm text-text-secondary flex-1">
        <span className={cn("font-semibold mr-1", config.color)}>
          {config.label} —
        </span>
        {message}
      </p>
    </div>
  );
}
