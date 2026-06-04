"use client";

import { cn } from "@/lib/utils";
import type { MarketOverview } from "@/lib/market";

interface TickerPillProps {
  label: string;
  value: string;
  changePercent?: number | null;
  badge?: string;
}

function TickerPill({ label, value, changePercent, badge }: TickerPillProps) {
  const hasChange = changePercent !== null && changePercent !== undefined;
  const isPositive = (changePercent ?? 0) >= 0;

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-surface/70 px-3.5 py-2 backdrop-blur-sm">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-text-secondary">{label}</span>
      <span className="text-sm font-bold text-text-primary">{value}</span>
      {hasChange && (
        <span className={cn("text-xs font-semibold", isPositive ? "text-profit" : "text-expense")}>
          {isPositive ? "+" : ""}{changePercent!.toFixed(2)}%
        </span>
      )}
      {badge && !hasChange && (
        <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">{badge}</span>
      )}
    </div>
  );
}

export function MarketTicker({ data }: { data: MarketOverview }) {
  const pills: TickerPillProps[] = [
    { label: "CDI", value: `${data.cdi.annualizedValue.toFixed(2)}%`, badge: "a.a." },
    { label: "SELIC", value: `${data.selic.annualizedValue.toFixed(2)}%`, badge: "a.a." },
    { label: "IPCA", value: `${data.ipca.annualizedValue.toFixed(2)}%`, badge: "a.a." },
    { label: "USD", value: `R$ ${data.dolar.value.toFixed(2)}` },
    { label: "EUR", value: `R$ ${data.euro.value.toFixed(2)}` },
    {
      label: "IBOV",
      value: data.ibovespa.price
        ? data.ibovespa.price.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " pts"
        : "—",
      changePercent: data.ibovespa.changePercent,
    },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin scrollbar-track-transparent">
      {pills.map((p) => <TickerPill key={p.label} {...p} />)}
    </div>
  );
}
