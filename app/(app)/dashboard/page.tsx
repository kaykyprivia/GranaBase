"use client";

import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Target,
  Calendar,
  Wallet,
  Zap,
  RefreshCw,
} from "lucide-react";
import { useCockpitData } from "@/hooks/useCockpitData";
import { getContextualMessage } from "@/lib/projection-engine";
import { ContextualHeader } from "@/components/cockpit/ContextualHeader";
import { ExecutiveMode } from "@/components/cockpit/ExecutiveMode";
import { RealMoneyCard } from "@/components/cockpit/RealMoneyCard";
import { PressureGauge } from "@/components/cockpit/PressureGauge";
import { MiniTimeline } from "@/components/cockpit/MiniTimeline";
import { InsightGrid } from "@/components/cockpit/InsightCard";
import { FinancialRadar } from "@/components/cockpit/FinancialRadar";
import { RecurringIncomeCard } from "@/components/cockpit/RecurringIncomeCard";
import { GlobalContributionButton } from "@/components/wallet/WalletContributionProvider";
import { formatCurrency, cn } from "@/lib/utils";

function QuickStat({
  label,
  value,
  positive,
  loading,
}: {
  label: string;
  value: number;
  positive: boolean;
  loading: boolean;
}) {
  return (
    <div className="cockpit-card px-4 py-3 flex items-center gap-3">
      <div className={cn("p-2 rounded-lg shrink-0", positive ? "bg-profit/10" : "bg-expense/10")}>
        {positive
          ? <TrendingUp className="h-4 w-4 text-profit" />
          : <TrendingDown className="h-4 w-4 text-expense" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-muted">{label}</p>
        {loading ? (
          <div className="h-5 w-24 bg-border/40 rounded animate-pulse mt-0.5" />
        ) : (
          <p className={cn("text-sm font-bold tabular-nums", positive ? "text-profit" : "text-expense")}>
            {formatCurrency(value)}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, href }: { title: string; subtitle?: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div>
        <h2 className="text-base font-bold text-text-primary">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors font-medium"
        >
          Ver tudo <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function RiskDateBanner({ date }: { date: string }) {
  const d = new Date(date + "T00:00:00");
  const months = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-expense/30 bg-expense/8 animate-scale-in">
      <span className="text-2xl shrink-0">🚨</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-expense">Risco financeiro projetado</p>
        <p className="text-xs text-text-secondary">
          Saldo negativo previsto dia{" "}
          <span className="text-expense font-semibold">
            {d.getDate()} de {months[d.getMonth()]}
          </span>
        </p>
      </div>
      <Link href="/timeline" className="text-xs text-expense hover:underline font-semibold whitespace-nowrap shrink-0">
        Ver timeline →
      </Link>
    </div>
  );
}

export default function DashboardPage() {
  const { projection, insights, loading, refreshing } = useCockpitData();
  const contextMessage = getContextualMessage(projection);

  return (
    <div className="cockpit-container animate-fade-in">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-black text-text-primary tracking-tight">
            Cockpit <span className="gradient-text">Financeiro</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Sistema Operacional da sua vida financeira
          </p>
        </div>
        <div className="flex items-center gap-2">
          {refreshing && (
            <RefreshCw className="h-3.5 w-3.5 text-text-muted animate-spin" aria-label="Atualizando..." />
          )}
          <GlobalContributionButton />
        </div>
      </div>

      {/* Executive mode — compact daily status */}
      <div className="mb-3">
        <ExecutiveMode projection={projection} loading={loading} />
      </div>

      {/* Status banner */}
      <div className="mb-4">
        <ContextualHeader
          message={contextMessage}
          pressureLevel={projection.pressureLevel}
          loading={loading}
        />
      </div>

      {/* Risk alert */}
      {!loading && projection.nextRiskDate && (
        <div className="mb-4">
          <RiskDateBanner date={projection.nextRiskDate} />
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <QuickStat label="Entradas do mês" value={projection.monthIncome} positive loading={loading} />
        <QuickStat label="Saídas do mês" value={projection.monthExpenses} positive={false} loading={loading} />
      </div>

      {/* Hero card */}
      <div className="mb-4">
        <RealMoneyCard projection={projection} loading={loading} />
      </div>

      {/* Pressure + Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <PressureGauge
          score={projection.pressureScore}
          level={projection.pressureLevel}
          committedAmount={projection.committedNext30Days}
          avgMonthlyIncome={projection.avgMonthlyIncome}
          projectedIncomeNext30={projection.projectedIncomeNext30}
          loading={loading}
        />
        <MiniTimeline days={projection.days} loading={loading} />
      </div>

      {/* Recurring income — shown only when patterns are detected */}
      {(loading || projection.recurringIncome.length > 0) && (
        <div className="mb-4">
          <RecurringIncomeCard
            patterns={projection.recurringIncome}
            projectedNext30={projection.projectedIncomeNext30}
            loading={loading}
          />
        </div>
      )}

      {/* Insights */}
      <div className="mb-4">
        <SectionHeader
          title="Inteligência Financeira"
          subtitle="Análise automática do comportamento"
          href="/intelligence"
        />
        <InsightGrid insights={insights} loading={loading} limit={4} />
      </div>

      {/* Radar + Nav shortcuts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <FinancialRadar dimensions={projection.radar} loading={loading} />

        <div className="space-y-2">
          <SectionHeader title="Navegação Rápida" />
          {[
            { href: "/timeline",     icon: Calendar,   label: "Timeline Financeira",    desc: "Projeção dos próximos 30 dias",  color: "text-accent"  },
            { href: "/investments",  icon: TrendingUp,  label: "Patrimônio & Carteira", desc: "Investimentos e crescimento",    color: "text-growth"  },
            { href: "/intelligence", icon: Zap,         label: "Inteligência",           desc: "Insights e análise financeira",  color: "text-warning" },
            { href: "/goals",        icon: Target,      label: "Metas",                  desc: "Progresso das suas metas",       color: "text-profit"  },
            { href: "/bills",        icon: Wallet,      label: "Contas & Parcelas",      desc: "Obrigações pendentes",           color: "text-expense" },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <div className="cockpit-card px-4 py-3 flex items-center gap-3 cursor-pointer">
                <div className="p-2 rounded-lg bg-border/40 shrink-0">
                  <item.icon className={cn("h-4 w-4", item.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary">{item.label}</p>
                  <p className="text-xs text-text-muted truncate">{item.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Surplus projection */}
      {!loading && (
        <div className="cockpit-card p-5 animate-fade-up delay-300">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Projeção de Sobra — próximos 30 dias
          </p>
          <div className="flex items-end justify-between">
            <div>
              <p className={cn(
                "text-3xl font-black tabular-nums",
                projection.surplusProjected >= 0 ? "text-profit" : "text-expense"
              )}>
                {formatCurrency(projection.surplusProjected)}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {projection.projectedIncomeNext30 > 0
                  ? "Renda recorrente esperada menos obrigações 30d"
                  : "Renda média menos obrigações dos próximos 30 dias"}
              </p>
            </div>
            <div className="text-right space-y-1">
              {projection.projectedIncomeNext30 > 0 ? (
                <>
                  <p className="text-xs text-text-muted">Renda projetada (30d)</p>
                  <p className="text-sm font-semibold text-profit tabular-nums">
                    {formatCurrency(projection.projectedIncomeNext30)}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-text-muted">Renda média (3 meses)</p>
                  <p className="text-sm font-semibold text-text-primary tabular-nums">
                    {formatCurrency(projection.avgMonthlyIncome)}
                  </p>
                </>
              )}
              <p className="text-xs text-text-muted">Obrigações 30d</p>
              <p className="text-sm font-semibold text-expense tabular-nums">
                -{formatCurrency(projection.committedNext30Days)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
