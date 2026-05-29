/**
 * Behavioral Finance Engine — GranaBase V2
 *
 * Analyzes spending behavior over time, detects trends, computes a discipline score,
 * and generates human-readable insights in PT-BR.
 *
 * Design principles:
 * - Non-judgmental: identifies facts, never shames
 * - Honest: shows improvements AND worsenings
 * - Actionable: each insight can drive a decision
 */

import type { ExpenseEntry } from "@/types/database";
import { getMonthKey } from "@/lib/projection-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BehaviorTrend = "improving" | "worsening" | "stable";

export interface CategoryTrend {
  category: string;
  recent30: number;       // spending in last 30 days
  previous30: number;     // spending in previous 30 days (days 31–60 ago)
  change: number;         // absolute delta
  changePercent: number;  // percent change (positive = increased, negative = decreased)
  trend: BehaviorTrend;
}

export interface MonthlyTrend {
  monthKey: string;        // "2026-04"
  monthLabel: string;      // "Abr 2026"
  total: number;
  byCategory: Record<string, number>;
}

export interface BehaviorReport {
  overallTrend: BehaviorTrend;
  spendingChangePercent: number;   // total spending last30 vs prev30
  disciplineScore: number;          // 0–100 (higher = more controlled)
  categoryTrends: CategoryTrend[];  // only categories with ≥R$50 movement
  biggestImprovement: CategoryTrend | null;
  biggestWorsening: CategoryTrend | null;
  monthlyTrends: MonthlyTrend[];    // last 4 months for mini chart
  highlights: BehaviorHighlight[];  // human-readable insights
}

export interface BehaviorHighlight {
  id: string;
  type: "positive" | "negative" | "neutral";
  emoji: string;
  text: string;
}

// ─── Month label ─────────────────────────────────────────────────────────────

const MONTH_LABELS: Record<string, string> = {
  "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr",
  "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Set", "10": "Out", "11": "Nov", "12": "Dez",
};

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[month] ?? month} ${year}`;
}

// ─── Core analysis ────────────────────────────────────────────────────────────

/**
 * Sums expenses that fall within a date range [fromStr, toStr) (YYYY-MM-DD strings).
 * Groups by category.
 */
function sumByCategory(
  expenses: ExpenseEntry[],
  fromStr: string,
  toStr: string
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of expenses) {
    if (e.spent_at >= fromStr && e.spent_at < toStr) {
      result[e.category] = (result[e.category] ?? 0) + e.amount;
    }
  }
  return result;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Compute a discipline score (0–100):
 * - Starts at 100
 * - Penalized by worsening trends weighted by amount
 * - Boosted by improving trends
 * - Capped at [0, 100]
 */
function computeDisciplineScore(
  trends: CategoryTrend[],
  spendingChangePercent: number
): number {
  let score = 70; // neutral baseline

  // Overall spending trend
  if (spendingChangePercent < -10)  score += 15;  // significant reduction
  else if (spendingChangePercent < 0)  score += 8;
  else if (spendingChangePercent > 30)  score -= 20;
  else if (spendingChangePercent > 10)  score -= 10;

  // Category trend bonuses/penalties (weighted by impact)
  for (const t of trends) {
    const weight = Math.min(Math.abs(t.changePercent) / 100, 0.5);
    if (t.trend === "improving") score += weight * 10;
    else if (t.trend === "worsening") score -= weight * 12;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Generate human-readable highlights about spending behavior.
 * These are displayed in the Intelligence tab.
 */
function generateHighlights(
  trends: CategoryTrend[],
  spendingChangePercent: number,
  disciplineScore: number
): BehaviorHighlight[] {
  const highlights: BehaviorHighlight[] = [];

  // Overall spending
  if (spendingChangePercent < -15) {
    highlights.push({
      id: "overall-down",
      type: "positive",
      emoji: "📉",
      text: `Seus gastos totais caíram ${Math.abs(Math.round(spendingChangePercent))}% vs. mês passado`,
    });
  } else if (spendingChangePercent > 25) {
    highlights.push({
      id: "overall-up",
      type: "negative",
      emoji: "📈",
      text: `Gastos totais subiram ${Math.round(spendingChangePercent)}% em relação ao período anterior`,
    });
  }

  // Best improvement
  const best = trends.find((t) => t.trend === "improving" && Math.abs(t.changePercent) > 15);
  if (best) {
    highlights.push({
      id: `improve-${best.category}`,
      type: "positive",
      emoji: "✅",
      text: `${best.category} caiu ${Math.abs(Math.round(best.changePercent))}% — excelente controle`,
    });
  }

  // Biggest worsening
  const worst = trends.find((t) => t.trend === "worsening" && t.changePercent > 20);
  if (worst) {
    highlights.push({
      id: `worsen-${worst.category}`,
      type: "negative",
      emoji: "⚠️",
      text: `${worst.category} subiu ${Math.round(worst.changePercent)}% — vale revisar`,
    });
  }

  // Discipline score milestone
  if (disciplineScore >= 80) {
    highlights.push({
      id: "discipline-high",
      type: "positive",
      emoji: "🏆",
      text: "Comportamento financeiro consistente nos últimos 60 dias",
    });
  } else if (disciplineScore < 40) {
    highlights.push({
      id: "discipline-low",
      type: "neutral",
      emoji: "💡",
      text: "Revise as categorias com maior crescimento de gastos",
    });
  }

  return highlights.slice(0, 4);
}

// ─── Monthly trend builder ────────────────────────────────────────────────────

function buildMonthlyTrends(expenses: ExpenseEntry[], monthsBack = 4): MonthlyTrend[] {
  const now = new Date();
  const trends: MonthlyTrend[] = [];

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = getMonthKey(d);
    const byCategory: Record<string, number> = {};

    let total = 0;
    for (const e of expenses) {
      if (e.spent_at.startsWith(key)) {
        byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
        total += e.amount;
      }
    }

    trends.push({ monthKey: key, monthLabel: monthLabel(key), total, byCategory });
  }

  return trends;
}

// ─── Main function ────────────────────────────────────────────────────────────

export function analyzeBehavior(expenses: ExpenseEntry[]): BehaviorReport {
  if (expenses.length === 0) {
    return {
      overallTrend: "stable",
      spendingChangePercent: 0,
      disciplineScore: 50,
      categoryTrends: [],
      biggestImprovement: null,
      biggestWorsening: null,
      monthlyTrends: [],
      highlights: [],
    };
  }

  const todayStr  = daysAgoStr(0);
  const ago30Str  = daysAgoStr(30);
  const ago60Str  = daysAgoStr(60);

  const recent30   = sumByCategory(expenses, ago30Str, todayStr);
  const previous30 = sumByCategory(expenses, ago60Str, ago30Str);

  const totalRecent   = Object.values(recent30).reduce((s, v) => s + v, 0);
  const totalPrevious = Object.values(previous30).reduce((s, v) => s + v, 0);

  const spendingChangePercent =
    totalPrevious > 0
      ? ((totalRecent - totalPrevious) / totalPrevious) * 100
      : 0;

  // Compute per-category trends
  const allCategories = new Set([...Object.keys(recent30), ...Object.keys(previous30)]);
  const categoryTrends: CategoryTrend[] = [];

  for (const category of allCategories) {
    const r = recent30[category] ?? 0;
    const p = previous30[category] ?? 0;
    const change = r - p;

    // Skip trivially small movements
    if (Math.max(r, p) < 50) continue;

    const changePercent = p > 0 ? (change / p) * 100 : (r > 0 ? 100 : 0);
    const trend: BehaviorTrend =
      changePercent < -10 ? "improving" :
      changePercent > 10  ? "worsening" :
      "stable";

    categoryTrends.push({
      category,
      recent30: r,
      previous30: p,
      change,
      changePercent,
      trend,
    });
  }

  // Sort by absolute change magnitude
  categoryTrends.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  const improvements = categoryTrends.filter((t) => t.trend === "improving");
  const worsenings   = categoryTrends.filter((t) => t.trend === "worsening");

  const biggestImprovement = improvements.length > 0 ? improvements[0] : null;
  const biggestWorsening   = worsenings.length > 0   ? worsenings[0]   : null;

  const overallTrend: BehaviorTrend =
    spendingChangePercent < -5  ? "improving" :
    spendingChangePercent > 10  ? "worsening" :
    "stable";

  const disciplineScore = computeDisciplineScore(categoryTrends, spendingChangePercent);
  const highlights = generateHighlights(categoryTrends, spendingChangePercent, disciplineScore);
  const monthlyTrends = buildMonthlyTrends(expenses, 4);

  return {
    overallTrend,
    spendingChangePercent,
    disciplineScore,
    categoryTrends: categoryTrends.slice(0, 8), // top 8 categories
    biggestImprovement,
    biggestWorsening,
    monthlyTrends,
    highlights,
  };
}
