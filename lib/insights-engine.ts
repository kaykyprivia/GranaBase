import type { Bill, ExpenseEntry, IncomeEntry, InstallmentPayment } from "@/types/database";
import { getEffectiveInstallmentStatus, isInstallmentPaid } from "@/lib/installments";
import { getAvgMonthlyIncome, getMonthKey } from "@/lib/projection-engine";
import { formatCurrency } from "@/lib/utils";

export type InsightSeverity = "info" | "warning" | "critical" | "positive";
export type InsightCategory =
  | "spending"
  | "subscriptions"
  | "installments"
  | "income"
  | "savings"
  | "bills";

export interface FinancialInsight {
  id: string;
  severity: InsightSeverity;
  category: InsightCategory;
  title: string;
  message: string;
  value?: number;
  icon: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function monthTotal(expenses: ExpenseEntry[], monthKey: string): number {
  return expenses
    .filter((e) => e.spent_at.startsWith(monthKey))
    .reduce((s, e) => s + e.amount, 0);
}

function avgMonthlyExpense(expenses: ExpenseEntry[], monthsBack = 3): number {
  const now = new Date();
  let total = 0;
  let counted = 0;
  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const sum = monthTotal(expenses, getMonthKey(d));
    if (sum > 0) { total += sum; counted++; }
  }
  return counted > 0 ? total / counted : 0;
}

function topSpendCategory(
  expenses: ExpenseEntry[],
  monthKey: string
): { category: string; amount: number } | null {
  const byCategory: Record<string, number> = {};
  expenses
    .filter((e) => e.spent_at.startsWith(monthKey))
    .forEach((e) => { byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount; });

  const entries = Object.entries(byCategory);
  if (entries.length === 0) return null;
  const [category, amount] = entries.sort((a, b) => b[1] - a[1])[0];
  return { category, amount };
}

// Pre-built as array once at module level — avoids Array.from() on every expense check
const SUBSCRIPTION_KEYWORDS = [
  "netflix", "spotify", "amazon", "disney", "globo", "youtube", "microsoft",
  "apple", "google", "adobe", "notion", "slack", "zoom", "chatgpt", "openai",
  "deezer", "canva", "figma", "dropbox", "icloud",
] as const;
const SUBSCRIPTION_KEYWORDS_SET = new Set(SUBSCRIPTION_KEYWORDS);

function isSubscriptionExpense(e: ExpenseEntry): boolean {
  if (e.category === "Assinatura") return true;
  const lower = e.description.toLowerCase();
  // O(m) with pre-built constants — no allocation per call
  for (const k of SUBSCRIPTION_KEYWORDS) {
    if (lower.includes(k)) return true;
  }
  return false;
}

function detectSubscriptions(expenses: ExpenseEntry[]): Array<{ name: string; monthlyAmount: number }> {
  const amounts: Record<string, number[]> = {};

  for (const e of expenses) {
    if (!isSubscriptionExpense(e)) continue;
    (amounts[e.description] ??= []).push(e.amount);
  }

  return Object.entries(amounts)
    .map(([name, vals]) => ({ name, monthlyAmount: vals.reduce((s, v) => s + v, 0) / vals.length }))
    .filter((s) => s.monthlyAmount > 0)
    .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = { critical: 0, warning: 1, positive: 2, info: 3 };

// ─── Main generator ───────────────────────────────────────────────────────────

export function generateInsights(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  bills: Bill[],
  installmentPayments: InstallmentPayment[]
): FinancialInsight[] {
  const insights: FinancialInsight[] = [];

  // Single `now` for all calculations — prevents midnight boundary issues
  const now = new Date();
  const monthKey = getMonthKey(now);

  const currentMonthExp = monthTotal(expenses, monthKey);
  const avgExp = avgMonthlyExpense(expenses);
  const currentMonthInc = income
    .filter((e) => e.received_at.startsWith(monthKey))
    .reduce((s, e) => s + e.amount, 0);
  const avgInc = getAvgMonthlyIncome(income);

  // ── 1. Spending spike vs 3-month average ──────────────────────────────────────
  if (avgExp > 0 && currentMonthExp > avgExp * 1.2) {
    const pct = Math.round(((currentMonthExp - avgExp) / avgExp) * 100);
    insights.push({
      id: "spending-spike",
      severity: pct > 50 ? "critical" : "warning",
      category: "spending",
      title: "Gastos acima da média",
      message: `Seus gastos este mês estão ${pct}% acima da média dos últimos 3 meses`,
      value: currentMonthExp,
      icon: "📈",
    });
  }

  // ── 2. Top expense category ────────────────────────────────────────────────────
  const top = topSpendCategory(expenses, monthKey);
  if (top && currentMonthInc > 0) {
    const pct = Math.round((top.amount / currentMonthInc) * 100);
    if (pct > 20) {
      insights.push({
        id: "top-category",
        severity: pct > 40 ? "warning" : "info",
        category: "spending",
        title: `${top.category} é seu maior gasto`,
        message: `${top.category} consumiu ${pct}% da sua renda este mês`,
        value: top.amount,
        icon: "🏷️",
      });
    }
  }

  // ── 3. Subscriptions annual cost ──────────────────────────────────────────────
  const subs = detectSubscriptions(expenses);
  if (subs.length >= 2) {
    const totalMonthly = subs.reduce((s, sub) => s + sub.monthlyAmount, 0);
    const totalAnnual = totalMonthly * 12;
    insights.push({
      id: "subscriptions",
      severity: avgInc > 0 && totalMonthly > avgInc * 0.1 ? "warning" : "info",
      category: "subscriptions",
      title: `${subs.length} assinaturas detectadas`,
      message: `Assinaturas somam ${formatCurrency(totalAnnual)}/ano — revise as que não usa`,
      value: totalAnnual,
      icon: "🔁",
    });
  }

  // ── 4. Overdue bills ──────────────────────────────────────────────────────────
  const overdueBills = bills.filter((b) => {
    if (b.status === "paid") return false;
    const due = new Date(b.due_date + "T00:00:00");
    return due < now;
  });
  if (overdueBills.length > 0) {
    const totalOverdue = overdueBills.reduce((s, b) => s + b.amount, 0);
    insights.push({
      id: "overdue-bills",
      severity: "critical",
      category: "bills",
      title: `${overdueBills.length} conta${overdueBills.length > 1 ? "s" : ""} em atraso`,
      message: `${formatCurrency(totalOverdue)} em contas vencidas — juros crescendo a cada dia`,
      value: totalOverdue,
      icon: "🚨",
    });
  }

  // ── 5. High installment load (next 30 days, future only) ──────────────────────
  const todayTs = now.getTime();
  const in30Ts = todayTs + 30 * 86400000;
  const instLoad30 = installmentPayments
    .filter((ip) => {
      if (isInstallmentPaid(getEffectiveInstallmentStatus(ip))) return false;
      const dueTs = new Date(ip.due_date + "T00:00:00").getTime();
      return dueTs >= todayTs && dueTs <= in30Ts;
    })
    .reduce((s, ip) => s + ip.amount, 0);

  if (avgInc > 0 && instLoad30 / avgInc > 0.3) {
    const pct = Math.round((instLoad30 / avgInc) * 100);
    insights.push({
      id: "installment-load",
      severity: pct > 50 ? "critical" : "warning",
      category: "installments",
      title: "Alto comprometimento em parcelas",
      message: `${pct}% da renda média comprometida em parcelamentos nos próximos 30 dias`,
      value: instLoad30,
      icon: "💳",
    });
  }

  // ── 6. Income growth vs last month ────────────────────────────────────────────
  const lastMonthKey = getMonthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const lastMonthInc = income
    .filter((e) => e.received_at.startsWith(lastMonthKey))
    .reduce((s, e) => s + e.amount, 0);
  if (lastMonthInc > 0 && currentMonthInc > lastMonthInc * 1.1) {
    const pct = Math.round(((currentMonthInc - lastMonthInc) / lastMonthInc) * 100);
    insights.push({
      id: "income-growth",
      severity: "positive",
      category: "income",
      title: "Renda cresceu este mês",
      message: `Renda subiu ${pct}% em relação ao mês anterior — bom momento para investir a diferença`,
      value: currentMonthInc,
      icon: "🚀",
    });
  }

  // ── 7. Low income alert (only after mid-month to avoid false positives) ────────
  if (avgInc > 0 && currentMonthInc < avgInc * 0.7 && now.getDate() > 15) {
    const dropPct = Math.round(((avgInc - currentMonthInc) / avgInc) * 100);
    insights.push({
      id: "low-income",
      severity: "warning",
      category: "income",
      title: "Renda abaixo da média",
      message: `Renda ${dropPct}% abaixo da sua média — revise os compromissos deste mês`,
      icon: "⚠️",
    });
  }

  // ── 8. Healthy surplus — positive reinforcement ────────────────────────────────
  if (currentMonthInc > 0 && currentMonthExp < currentMonthInc * 0.6) {
    const surplus = currentMonthInc - currentMonthExp;
    const savingsRate = Math.round((surplus / currentMonthInc) * 100);
    insights.push({
      id: "healthy-surplus",
      severity: "positive",
      category: "savings",
      title: "Taxa de poupança elevada",
      message: `Guardando ${savingsRate}% da renda — ${formatCurrency(surplus)} disponíveis para investir`,
      value: surplus,
      icon: "💰",
    });
  }

  return insights
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    .slice(0, 6);
}

// Keep SUBSCRIPTION_KEYWORDS_SET exported in case callers need it
export { SUBSCRIPTION_KEYWORDS_SET };
