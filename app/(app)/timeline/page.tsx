"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  FileText,
  CreditCard,
  TrendingDown,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { useCockpitData } from "@/hooks/useCockpitData";
import { useFinancialSystem } from "@/context/FinancialSystemContext";
import { SimulationPanel } from "@/components/cockpit/SimulationPanel";
import { formatCurrency, cn } from "@/lib/utils";
import type { ProjectionDay, DayRisk } from "@/lib/projection-engine";

// Static class map — Tailwind cannot tree-shake dynamic strings
const riskConfig: Record<DayRisk, {
  cardBg: string;
  cardBorder: string;
  text: string;
  label: string;
  dotBg: string;
  tagBg: string;
  icon: React.ElementType;
}> = {
  safe: {
    cardBg:     "bg-profit/8",
    cardBorder: "border-profit/20",
    text:       "text-profit",
    label:      "Saudável",
    dotBg:      "bg-profit",
    tagBg:      "bg-profit/15",
    icon: CheckCircle2,
  },
  warning: {
    cardBg:     "bg-warning/8",
    cardBorder: "border-warning/20",
    text:       "text-warning",
    label:      "Atenção",
    dotBg:      "bg-warning",
    tagBg:      "bg-warning/15",
    icon: AlertTriangle,
  },
  critical: {
    cardBg:     "bg-expense/10",
    cardBorder: "border-expense/30",
    text:       "text-expense",
    label:      "Crítico",
    dotBg:      "bg-expense",
    tagBg:      "bg-expense/15",
    icon: AlertTriangle,
  },
};

function HeatmapCell({ day }: { day: ProjectionDay }) {
  const cfg = riskConfig[day.risk];

  return (
    <div
      className={cn(
        "relative aspect-square rounded-lg flex flex-col items-center justify-center transition-all duration-200",
        day.isToday && "ring-2 ring-accent ring-offset-1 ring-offset-background",
        day.isFuture
          ? cn(cfg.cardBg, cfg.cardBorder, "border")
          : "bg-border/15 border border-border/20 opacity-50"
      )}
    >
      <span className={cn(
        "text-xs font-bold",
        day.isToday ? "text-accent" : day.isFuture ? cfg.text : "text-text-muted"
      )}>
        {day.dayNumber}
      </span>
      {day.events.length > 0 && day.isFuture && (
        <div className="absolute bottom-1 flex gap-0.5">
          {day.events.slice(0, 3).map((_, i) => (
            <div key={i} className={cn("w-1 h-1 rounded-full", cfg.dotBg)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayCard({ day }: { day: ProjectionDay }) {
  const cfg = riskConfig[day.risk];
  const RiskIcon = cfg.icon;

  return (
    <div className={cn(
      "rounded-xl border p-4 transition-all duration-200",
      cfg.cardBg,
      cfg.cardBorder,
      day.isToday && "ring-1 ring-accent/40"
    )}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-text-primary">{day.dateLabel}</span>
          {day.isToday && (
            <span className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded-full font-semibold">
              Hoje
            </span>
          )}
          <span className={cn(
            "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
            cfg.tagBg,
            cfg.text
          )}>
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <RiskIcon className={cn("h-3.5 w-3.5", cfg.text)} />
          <span className={cn("text-sm font-bold tabular-nums", cfg.text)}>
            {formatCurrency(day.balance)}
          </span>
        </div>
      </div>

      {day.events.length > 0 ? (
        <div className="space-y-2">
          {day.events.map((evt) => (
            <div key={evt.id} className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-border/40 shrink-0">
                {evt.type === "bill"
                  ? <FileText className="h-3 w-3 text-warning" />
                  : <CreditCard className="h-3 w-3 text-accent" />}
              </div>
              <span className="text-xs text-text-secondary flex-1 truncate">{evt.title}</span>
              <span className="text-xs text-expense font-semibold tabular-nums shrink-0">
                -{formatCurrency(evt.amount)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 border-t border-border/20">
            <span className="text-xs text-text-muted">Total saindo</span>
            <span className="text-xs font-bold text-expense tabular-nums">
              -{formatCurrency(day.totalOut)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-text-muted">Sem obrigações neste dia</p>
      )}
    </div>
  );
}

export default function TimelinePage() {
  const { projection, loading } = useCockpitData();
  const { rawInput } = useFinancialSystem();
  const [view, setView] = useState<"list" | "heatmap" | "simulation">("list");

  const days = projection.days;
  const futureDaysWithEvents = days.filter((d) => d.isFuture && d.events.length > 0);
  const riskDays = days.filter((d) => d.risk === "critical" && d.isFuture);
  const totalCommitted = futureDaysWithEvents.reduce((s, d) => s + d.totalOut, 0);

  return (
    <div className="cockpit-container animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard"
          className="p-2 rounded-lg hover:bg-border/40 transition-colors text-text-secondary inline-flex shrink-0"
          aria-label="Voltar ao dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-black text-text-primary">
            Timeline <span className="gradient-text">Financeira</span>
          </h1>
          <p className="text-xs text-text-muted">Projeção das obrigações dos próximos 30 dias</p>
        </div>
      </div>

      {/* Summary stats */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3 mb-5 animate-fade-up">
          <div className="cockpit-card p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Comprometido</p>
            <p className="text-lg font-black text-expense tabular-nums">
              {formatCurrency(totalCommitted)}
            </p>
            <p className="text-[10px] text-text-muted mt-0.5">próximos 30 dias</p>
          </div>
          <div className="cockpit-card p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Eventos</p>
            <p className="text-lg font-black text-accent tabular-nums">{futureDaysWithEvents.length}</p>
            <p className="text-[10px] text-text-muted mt-0.5">dias com saídas</p>
          </div>
          <div className="cockpit-card p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Dias críticos</p>
            <p className={cn(
              "text-lg font-black tabular-nums",
              riskDays.length > 0 ? "text-expense" : "text-profit"
            )}>
              {riskDays.length}
            </p>
            <p className="text-[10px] text-text-muted mt-0.5">saldo negativo</p>
          </div>
        </div>
      )}

      {/* Risk alert */}
      {!loading && riskDays.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-expense/30 bg-expense/8 mb-5">
          <span className="text-2xl shrink-0">⚠️</span>
          <div>
            <p className="text-sm font-bold text-expense">
              {riskDays.length} dia{riskDays.length > 1 ? "s" : ""} com saldo projetado negativo
            </p>
            <p className="text-xs text-text-secondary mt-0.5">
              Considere antecipar renda, vender ativos ou postergar compras não essenciais
            </p>
          </div>
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {(["list", "heatmap", "simulation"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border",
              view === v
                ? "bg-accent/20 text-accent border-accent/30"
                : "text-text-secondary hover:text-text-primary border-border/40"
            )}
          >
            {v === "simulation" ? <><Zap className="h-4 w-4" /> E se…</> :
             v === "list"
              ? <><TrendingDown className="h-4 w-4" /> Lista</>
              : <><CalendarDays className="h-4 w-4" /> Heatmap</>}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-border/20 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : view === "simulation" ? (
        <div className="cockpit-card p-5 animate-scale-in">
          <SimulationPanel rawInput={rawInput} />
        </div>
      ) : view === "heatmap" ? (
        <div className="cockpit-card p-5 animate-scale-in">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-4">
            Pressão por dia — próximos 30 dias
          </p>
          <div className="grid grid-cols-7 gap-1.5 mb-3">
            {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
              <div key={i} className="text-center text-[10px] text-text-muted font-medium pb-1">
                {d}
              </div>
            ))}
            {days.map((day) => <HeatmapCell key={day.date} day={day} />)}
          </div>
          <div className="flex items-center gap-4 justify-end pt-3 border-t border-border/30">
            {(["safe", "warning", "critical"] as DayRisk[]).map((risk) => (
              <div key={risk} className="flex items-center gap-1.5">
                <div className={cn("w-3 h-3 rounded", riskConfig[risk].dotBg, "opacity-60")} />
                <span className="text-[10px] text-text-muted">{riskConfig[risk].label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {days.slice(0, 30).map((day) => {
            if (!day.isToday && day.isFuture && day.events.length === 0) return null;
            return <DayCard key={day.date} day={day} />;
          })}
          {futureDaysWithEvents.length === 0 && (
            <div className="cockpit-card p-10 text-center">
              <div className="text-5xl mb-3">🎉</div>
              <p className="text-base font-bold text-profit">Sem obrigações futuras</p>
              <p className="text-sm text-text-muted mt-1">
                Nenhuma conta ou parcela vence nos próximos 30 dias
              </p>
            </div>
          )}
        </div>
      )}

      {/* Risk legend */}
      {view === "list" && !loading && (
        <div className="mt-5 cockpit-card p-4">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-3">
            Legenda de Risco
          </p>
          <div className="space-y-2">
            {(["safe", "warning", "critical"] as DayRisk[]).map((risk) => {
              const cfg = riskConfig[risk];
              const Icon = cfg.icon;
              return (
                <div key={risk} className="flex items-center gap-2.5">
                  <Icon className={cn("h-4 w-4 shrink-0", cfg.text)} />
                  <span className={cn("text-sm font-semibold w-16 shrink-0", cfg.text)}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-text-muted">
                    {risk === "safe" && "Saldo confortável (>15% do inicial)"}
                    {risk === "warning" && "Saldo abaixo de 15% do saldo inicial"}
                    {risk === "critical" && "Saldo projetado negativo"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
