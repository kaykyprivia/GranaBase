"use client";

import { useState } from "react";
import { Eye, EyeOff, TrendingUp, Lock, Wallet } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { FinancialProjection } from "@/lib/projection-engine";

interface RealMoneyCardProps {
  projection: FinancialProjection;
  loading?: boolean;
}

// Static class maps — Tailwind cannot tree-shake dynamic strings like `bg-${color}/10`
const colorStyles = {
  neutral: { bg: "bg-border/30", text: "text-text-primary", icon: "text-text-secondary" },
  profit:  { bg: "bg-profit/10",  text: "text-profit",       icon: "text-profit" },
  expense: { bg: "bg-expense/10", text: "text-expense",      icon: "text-expense" },
  warning: { bg: "bg-warning/10", text: "text-warning",      icon: "text-warning" },
  growth:  { bg: "bg-growth/10",  text: "text-growth",       icon: "text-growth" },
  accent:  { bg: "bg-accent/10",  text: "text-accent",       icon: "text-accent" },
} as const;

type ColorKey = keyof typeof colorStyles;

function MoneyRow({
  label,
  value,
  icon: Icon,
  colorKey,
  hidden,
  prefix = "",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  colorKey: ColorKey;
  hidden: boolean;
  prefix?: string;
}) {
  const styles = colorStyles[colorKey];
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0">
      <div className="flex items-center gap-2.5">
        <div className={cn("p-1.5 rounded-lg", styles.bg)}>
          <Icon className={cn("h-3.5 w-3.5", styles.icon)} />
        </div>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className={cn("text-sm font-semibold tabular-nums", styles.text)}>
        {hidden ? "••••••" : `${prefix}${formatCurrency(value)}`}
      </span>
    </div>
  );
}

export function RealMoneyCard({ projection, loading }: RealMoneyCardProps) {
  const [hidden, setHidden] = useState(false);

  if (loading) {
    return (
      <div className="hero-card p-6 space-y-5">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="h-3 w-32 bg-border/40 rounded animate-pulse" />
            <div className="h-8 w-48 bg-border/40 rounded animate-pulse" />
          </div>
          <div className="h-8 w-8 bg-border/40 rounded animate-pulse" />
        </div>
        <div className="space-y-2.5 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-border/20 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const freeColorKey: ColorKey = projection.freeMoneyReal >= 0 ? "profit" : "expense";

  return (
    <div className="hero-card p-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Dinheiro Disponível Real
          </p>
          <span className={cn(
            "text-3xl font-black block tabular-nums animate-count-up",
            projection.freeMoneyReal >= 0 ? "text-profit" : "text-expense"
          )}>
            {hidden ? "R$ ••••••" : formatCurrency(projection.freeMoneyReal)}
          </span>
          <p className="text-xs text-text-muted mt-1">
            Renda — gastos — obrigações restantes do mês
          </p>
        </div>
        <button
          onClick={() => setHidden(!hidden)}
          aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
          className="p-2 rounded-lg hover:bg-border/40 transition-colors text-text-secondary hover:text-text-primary"
        >
          {hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>

      {/* Breakdown */}
      <div>
        <MoneyRow
          label="Saldo acumulado"
          value={projection.currentBalance}
          icon={Wallet}
          colorKey="neutral"
          hidden={hidden}
        />
        <MoneyRow
          label="Saídas do mês"
          value={projection.monthExpenses}
          icon={TrendingUp}
          colorKey="expense"
          hidden={hidden}
          prefix="-"
        />
        <MoneyRow
          label="Obrigações este mês"
          value={projection.committedThisMonth}
          icon={Lock}
          colorKey="warning"
          hidden={hidden}
          prefix="-"
        />
        <MoneyRow
          label="Livre real"
          value={projection.freeMoneyReal}
          icon={TrendingUp}
          colorKey={freeColorKey}
          hidden={hidden}
        />
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-border/30 grid grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Patrimônio</p>
          <p className="text-sm font-semibold text-growth tabular-nums mt-0.5">
            {hidden ? "••••" : formatCurrency(projection.walletBalance)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Pendente total</p>
          <p className="text-sm font-semibold text-expense tabular-nums mt-0.5">
            {hidden ? "••••" : formatCurrency(projection.committedTotal)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Pressão 30d</p>
          <p className={cn(
            "text-sm font-semibold tabular-nums mt-0.5",
            projection.pressureScore > 70 ? "text-expense" :
            projection.pressureScore > 40 ? "text-warning" : "text-profit"
          )}>
            {Math.round(projection.pressureScore)}%
          </p>
        </div>
      </div>
    </div>
  );
}
