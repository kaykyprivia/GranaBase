"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { Investment } from "@/types/database";

const TYPE_COLORS: Record<string, string> = {
  CDB:      "#38BDF8",
  Tesouro:  "#22C55E",
  Acao:     "#FACC15",
  "Ação":   "#FACC15",
  ETF:      "#F97316",
  FII:      "#A78BFA",
  Crypto:   "#EC4899",
  Reserva:  "#14B8A6",
  Outro:    "#94A3B8",
};

const FALLBACK_COLORS = [
  "#38BDF8", "#22C55E", "#FACC15", "#F97316",
  "#A78BFA", "#EC4899", "#14B8A6", "#EF4444",
];

function getTypeColor(type: string, index: number) {
  return TYPE_COLORS[type] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

interface AllocationEntry {
  name: string;
  value: number;
  percent: number;
  color: string;
  count: number;
}

function buildAllocation(investments: Investment[]): AllocationEntry[] {
  const total = investments.reduce((s, i) => s + i.amount, 0);
  if (total === 0) return [];

  const map: Record<string, { value: number; count: number }> = {};
  for (const inv of investments) {
    if (!map[inv.investment_type]) map[inv.investment_type] = { value: 0, count: 0 };
    map[inv.investment_type].value += inv.amount;
    map[inv.investment_type].count++;
  }

  return Object.entries(map)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([name, { value, count }], index) => ({
      name,
      value,
      percent: (value / total) * 100,
      color: getTypeColor(name, index),
      count,
    }));
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: AllocationEntry }>;
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-xl">
      <p className="text-sm font-semibold text-text-primary">{d.name}</p>
      <p className="mt-1 text-sm font-bold text-profit">{formatCurrency(d.value)}</p>
      <p className="text-xs text-text-secondary">{d.percent.toFixed(1)}% · {d.count} ativo{d.count !== 1 ? "s" : ""}</p>
    </div>
  );
}

export function PortfolioAllocationChart({ investments }: { investments: Investment[] }) {
  const data = buildAllocation(investments);
  if (data.length === 0) return null;

  const total = investments.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      <div className="flex flex-col items-center">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={3}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} cursor={false} />
          </PieChart>
        </ResponsiveContainer>
        <p className="mt-1 text-xs text-text-secondary">Clique para detalhes</p>
      </div>

      <div className="flex flex-col justify-center space-y-3">
        {data.map((entry) => (
          <div key={entry.name} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: entry.color }} />
                <span className="font-medium text-text-primary">{entry.name}</span>
                <span className="text-[10px] text-text-secondary">{entry.count}x</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">{entry.percent.toFixed(1)}%</span>
                <span className="min-w-[80px] text-right text-sm font-semibold text-text-primary">
                  {formatCurrency(entry.value)}
                </span>
              </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${entry.percent}%`, background: entry.color }}
              />
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border/40 pt-3 text-sm">
          <span className="text-text-secondary">Total investido</span>
          <span className="font-bold text-text-primary">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
