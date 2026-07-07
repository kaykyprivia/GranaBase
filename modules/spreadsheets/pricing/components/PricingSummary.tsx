"use client";

import { AlertTriangle, OctagonAlert } from "lucide-react";
import type { PricingResult } from "../calculations";
import type { Alert } from "../alerts";
import { cn } from "../../engine/cn";

function formatBRL(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export interface PricingSummaryProps {
  result: PricingResult;
  alerts: Alert[];
}

export function PricingSummary({ result, alerts }: PricingSummaryProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Custo por porção" value={formatBRL(result.custoPorPorcao)} />
        <Stat label="Preço mínimo" value={formatBRL(result.precoMinimo)} />
        <Stat label="Preço sugerido" value={formatBRL(result.precoSugerido)} highlight />
        <Stat label="Preço premium" value={formatBRL(result.precoPremium)} />
        <Stat
          label="Margem de contribuição"
          value={result.margemContribuicaoPct !== null ? `${result.margemContribuicaoPct.toFixed(1)}%` : "—"}
        />
        <Stat
          label="Margem líquida"
          value={result.margemLiquidaPct !== null ? `${result.margemLiquidaPct.toFixed(1)}%` : "—"}
        />
      </div>

      {alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                alert.severidade === "critico"
                  ? "border-expense/30 bg-expense/10 text-expense"
                  : "border-warning/30 bg-warning/10 text-warning"
              )}
            >
              {alert.severidade === "critico" ? (
                <OctagonAlert className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              )}
              <span>{alert.mensagem}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-border/60 p-2.5", highlight && "border-accent/40 bg-accent/5")}>
      <p className="text-[10px] uppercase tracking-wide text-text-secondary">{label}</p>
      <p className={cn("mt-0.5 text-sm font-semibold text-text-primary", highlight && "text-accent")}>{value}</p>
    </div>
  );
}
