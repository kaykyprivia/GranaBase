"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import type { RadarDimension } from "@/lib/projection-engine";

// Radar fill color changes based on overall health score — emotional impact
function radarColor(score: number): { stroke: string; fill: string } {
  if (score >= 70) return { stroke: "#22C55E", fill: "#22C55E" };
  if (score >= 50) return { stroke: "#38BDF8", fill: "#38BDF8" };
  if (score >= 30) return { stroke: "#FACC15", fill: "#FACC15" };
  return { stroke: "#EF4444", fill: "#EF4444" };
}

interface RadarChartInnerProps {
  data: RadarDimension[];
  overallScore: number;
}

const RadarChartInner = dynamic(
  () =>
    import("recharts").then((m) => {
      const { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } = m;

      return {
        default: ({ data, overallScore }: RadarChartInnerProps) => {
          const { stroke, fill } = radarColor(overallScore);
          return (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={data} margin={{ top: 8, right: 28, bottom: 8, left: 28 }}>
                <PolarGrid stroke="rgba(30,41,59,0.8)" />
                <PolarAngleAxis
                  dataKey="label"
                  tick={{ fill: "#94A3B8", fontSize: 11, fontWeight: 500 }}
                />
                <Radar
                  name="Score"
                  dataKey="score"
                  stroke={stroke}
                  fill={fill}
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0A0F1E",
                    border: "1px solid #1E293B",
                    borderRadius: "10px",
                    color: "#F1F5F9",
                    fontSize: 12,
                    padding: "8px 12px",
                  }}
                  formatter={(v: number, _n: string, p: { payload?: RadarDimension }) => [
                    `${v}/100`,
                    p.payload?.fullLabel ?? "Score",
                  ]}
                />
              </RadarChart>
            </ResponsiveContainer>
          );
        },
      };
    }),
  { ssr: false }
);

interface FinancialRadarProps {
  dimensions: RadarDimension[];
  loading?: boolean;
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const barColor =
    score >= 70 ? "bg-profit" : score >= 40 ? "bg-warning" : "bg-expense";
  const textColor =
    score >= 70 ? "text-profit" : score >= 40 ? "text-warning" : "text-expense";

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-text-secondary w-[72px] shrink-0 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-border/50 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", barColor)}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={cn("text-xs font-bold w-8 text-right tabular-nums", textColor)}>
        {score}
      </span>
    </div>
  );
}

export function FinancialRadar({ dimensions, loading }: FinancialRadarProps) {
  if (loading) {
    return (
      <div className="cockpit-card p-5 space-y-3">
        <div className="h-4 w-36 bg-border/40 rounded animate-pulse" />
        <div className="h-[200px] bg-border/20 rounded-xl animate-pulse" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-4 bg-border/20 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  // Guard: avoid NaN when dimensions is empty
  const overallScore =
    dimensions.length > 0
      ? Math.round(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length)
      : 0;

  const overallLabel =
    overallScore >= 70 ? "Excelente" :
    overallScore >= 50 ? "Bom" :
    overallScore >= 30 ? "Regular" : "Crítico";

  const { stroke: overallStroke } = radarColor(overallScore);

  return (
    <div className="cockpit-card p-5 animate-fade-up delay-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Radar Financeiro
          </p>
          <p className="text-sm font-semibold text-text-primary mt-0.5">
            Saúde em 5 dimensões
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tabular-nums" style={{ color: overallStroke }}>
            {overallScore}
            <span className="text-base font-normal text-text-muted">/100</span>
          </p>
          <p className="text-xs font-semibold" style={{ color: overallStroke }}>{overallLabel}</p>
        </div>
      </div>

      {dimensions.length > 0 ? (
        <RadarChartInner data={dimensions} overallScore={overallScore} />
      ) : (
        <div className="h-[200px] flex items-center justify-center text-text-muted text-sm">
          Sem dados suficientes
        </div>
      )}

      <div className="space-y-2.5 mt-3 pt-3 border-t border-border/30">
        {dimensions.map((d) => (
          <ScoreBar key={d.label} score={d.score} label={d.label} />
        ))}
      </div>
    </div>
  );
}
