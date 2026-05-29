"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Zap,
  Brain,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Info,
  BarChart3,
  Repeat,
} from "lucide-react";
import { useCockpitData } from "@/hooks/useCockpitData";
import { useFinancialSystem } from "@/context/FinancialSystemContext";
import { FinancialRadar } from "@/components/cockpit/FinancialRadar";
import { PressureGauge } from "@/components/cockpit/PressureGauge";
import { BehaviorInsights } from "@/components/cockpit/BehaviorInsights";
import { analyzeBehavior } from "@/lib/behavioral-engine";
import { formatCurrency, cn } from "@/lib/utils";
import type { FinancialInsight, InsightSeverity } from "@/lib/insights-engine";

const severityConfig: Record<InsightSeverity, {
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  label: string;
}> = {
  critical: {
    icon: AlertTriangle,
    color: "text-expense",
    bg: "bg-expense/8",
    border: "border-expense/25",
    label: "Crítico",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-warning",
    bg: "bg-warning/8",
    border: "border-warning/20",
    label: "Atenção",
  },
  positive: {
    icon: CheckCircle2,
    color: "text-profit",
    bg: "bg-profit/8",
    border: "border-profit/20",
    label: "Positivo",
  },
  info: {
    icon: Info,
    color: "text-accent",
    bg: "bg-accent/8",
    border: "border-accent/20",
    label: "Informação",
  },
};

function FullInsightCard({ insight }: { insight: FinancialInsight }) {
  const config = severityConfig[insight.severity];
  const SeverityIcon = config.icon;

  return (
    <div className={cn(
      "rounded-xl border p-5 transition-all duration-200 hover:scale-[1.01]",
      config.bg,
      config.border
    )}>
      <div className="flex items-start gap-4">
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <span className="text-2xl">{insight.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className={cn("text-base font-bold", config.color)}>
              {insight.title}
            </p>
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
              config.color,
              config.border,
              config.bg
            )}>
              {config.label}
            </span>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">
            {insight.message}
          </p>
          {insight.value !== undefined && (
            <div className="mt-3 pt-3 border-t border-border/20">
              <div className="flex items-center gap-2">
                <SeverityIcon className={cn("h-4 w-4", config.color)} />
                <span className={cn("text-sm font-bold tabular-nums", config.color)}>
                  {formatCurrency(insight.value)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryBadge({ category }: { category: FinancialInsight["category"] }) {
  const icons: Record<FinancialInsight["category"], React.ElementType> = {
    spending: TrendingDown,
    subscriptions: Repeat,
    installments: BarChart3,
    income: TrendingUp,
    savings: CheckCircle2,
    bills: AlertTriangle,
  };
  const labels: Record<FinancialInsight["category"], string> = {
    spending: "Gastos",
    subscriptions: "Assinaturas",
    installments: "Parcelas",
    income: "Renda",
    savings: "Poupança",
    bills: "Contas",
  };
  const Icon = icons[category];
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-border/40 border border-border/60">
      <Icon className="h-3 w-3 text-text-muted" />
      <span className="text-[10px] font-medium text-text-secondary">{labels[category]}</span>
    </div>
  );
}

function HealthSummary({ score, dimensions }: {
  score: number;
  dimensions: Array<{ label: string; score: number }>;
}) {
  const label =
    score >= 70 ? "Excelente" : score >= 50 ? "Boa" : score >= 30 ? "Regular" : "Crítica";
  const color =
    score >= 70 ? "text-profit" : score >= 50 ? "text-accent" : score >= 30 ? "text-warning" : "text-expense";

  return (
    <div className="cockpit-card p-5">
      <div className="flex items-center gap-4 mb-5">
        <div className="p-3 rounded-xl bg-accent/10 border border-accent/20">
          <Brain className="h-6 w-6 text-accent" />
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Saúde Financeira Geral
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className={cn("text-3xl font-black tabular-nums", color)}>{score}</span>
            <span className="text-text-muted">/100</span>
            <span className={cn("text-base font-bold", color)}>— {label}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {dimensions.map((d) => {
          const c = d.score >= 70 ? "text-profit" : d.score >= 40 ? "text-warning" : "text-expense";
          const bg = d.score >= 70 ? "bg-profit" : d.score >= 40 ? "bg-warning" : "bg-expense";
          return (
            <div key={d.label} className="text-center">
              <div className="relative h-16 flex items-end justify-center mb-1">
                <div className="w-full h-full bg-border/30 rounded-sm relative overflow-hidden">
                  <div
                    className={cn("absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-700", bg)}
                    style={{ height: `${d.score}%`, opacity: 0.7 }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-text-muted">{d.label}</p>
              <p className={cn("text-xs font-bold tabular-nums", c)}>{d.score}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function IntelligencePage() {
  const { projection, insights, loading } = useCockpitData();
  const { rawInput } = useFinancialSystem();

  // Compute behavior report from raw expenses (client-side, fast)
  const behaviorReport = rawInput
    ? analyzeBehavior(rawInput.expenses)
    : null;

  const overallScore =
    projection.radar.length > 0
      ? Math.round(projection.radar.reduce((s, d) => s + d.score, 0) / projection.radar.length)
      : 0;

  const criticalInsights = insights.filter((i) => i.severity === "critical");
  const warningInsights = insights.filter((i) => i.severity === "warning");
  const positiveInsights = insights.filter((i) => i.severity === "positive");
  const infoInsights = insights.filter((i) => i.severity === "info");

  const grouped = [
    { label: "Alertas críticos", items: criticalInsights, show: criticalInsights.length > 0 },
    { label: "Pontos de atenção", items: warningInsights, show: warningInsights.length > 0 },
    { label: "Pontos positivos", items: positiveInsights, show: positiveInsights.length > 0 },
    { label: "Informações", items: infoInsights, show: infoInsights.length > 0 },
  ];

  return (
    <div className="cockpit-container animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard"
          className="p-2 rounded-lg hover:bg-border/40 transition-colors text-text-secondary inline-flex"
          aria-label="Voltar ao dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-text-primary">
            <span className="gradient-text-growth">Inteligência</span>{" "}
            Financeira
          </h1>
          <p className="text-xs text-text-muted">Análise automática do seu comportamento financeiro</p>
        </div>
        <Zap className="ml-auto h-5 w-5 text-warning" />
      </div>

      {/* Health summary */}
      {loading ? (
        <div className="h-48 bg-border/20 rounded-xl animate-pulse mb-5" />
      ) : (
        <div className="mb-5 animate-fade-up">
          <HealthSummary
            score={overallScore}
            dimensions={projection.radar}
          />
        </div>
      )}

      {/* Insights count pills */}
      {!loading && (
        <div className="grid grid-cols-4 gap-2 mb-5 animate-fade-up delay-100">
          {[
            { label: "Críticos", count: criticalInsights.length, color: "text-expense", bg: "bg-expense/10 border-expense/20" },
            { label: "Atenção", count: warningInsights.length, color: "text-warning", bg: "bg-warning/10 border-warning/20" },
            { label: "Positivos", count: positiveInsights.length, color: "text-profit", bg: "bg-profit/10 border-profit/20" },
            { label: "Info", count: infoInsights.length, color: "text-accent", bg: "bg-accent/10 border-accent/20" },
          ].map((item) => (
            <div key={item.label} className={cn("rounded-xl border p-3 text-center", item.bg)}>
              <p className={cn("text-xl font-black tabular-nums", item.color)}>{item.count}</p>
              <p className="text-[10px] text-text-muted mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* All insights grouped */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-border/20 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div className="cockpit-card p-10 text-center animate-scale-in">
          <div className="text-5xl mb-4">🏆</div>
          <p className="text-lg font-bold text-profit">Saúde financeira exemplar</p>
          <p className="text-sm text-text-muted mt-2">
            Nenhum alerta detectado. Continue assim!
          </p>
        </div>
      ) : (
        <div className="space-y-6 animate-fade-up delay-200">
          {grouped.filter((g) => g.show).map((group) => (
            <div key={group.label}>
              <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                {group.label}
              </p>
              <div className="space-y-3">
                {group.items.map((insight) => (
                  <div key={insight.id}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <CategoryBadge category={insight.category} />
                    </div>
                    <FullInsightCard insight={insight} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Behavioral analysis */}
      {behaviorReport && (
        <div className="mt-6">
          <p className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
            Análise de Comportamento — últimos 60 dias
          </p>
          <BehaviorInsights report={behaviorReport} loading={loading} />
        </div>
      )}

      {/* Radar + Pressure side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <FinancialRadar dimensions={projection.radar} loading={loading} />
        <PressureGauge
          score={projection.pressureScore}
          level={projection.pressureLevel}
          committedAmount={projection.committedNext30Days}
          avgMonthlyIncome={projection.avgMonthlyIncome}
          loading={loading}
        />
      </div>

      {/* Tips section */}
      {!loading && projection.pressureLevel === "critical" && (
        <div className="mt-5 cockpit-card p-5 border-expense/20 animate-fade-up">
          <p className="text-sm font-bold text-expense mb-3">🚨 Modo Sobrevivência Financeira</p>
          <div className="space-y-2.5">
            {[
              "Priorize contas com juros mais altos",
              "Corte assinaturas não essenciais temporariamente",
              "Negocie prazos de pagamento com credores",
              "Identifique fontes de renda extra urgentes",
              "Evite novos parcelamentos até normalizar o fluxo",
            ].map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-expense font-bold shrink-0 mt-0.5">•</span>
                <p className="text-sm text-text-secondary">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && projection.pressureLevel === "healthy" && projection.surplusProjected > 0 && (
        <div className="mt-5 cockpit-card p-5 border-profit/20 bg-profit/5 animate-fade-up">
          <p className="text-sm font-bold text-profit mb-3">💡 Oportunidades de Investimento</p>
          <div className="space-y-2.5">
            {[
              `Você tem ${formatCurrency(projection.surplusProjected)} disponível para investir`,
              "Considere aumentar sua reserva de emergência",
              "Avalie aportes em renda fixa ou Tesouro Direto",
              "Diversifique sua carteira de investimentos",
              "Antecipe parcelas para reduzir juros futuros",
            ].map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-profit font-bold shrink-0 mt-0.5">•</span>
                <p className="text-sm text-text-secondary">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
