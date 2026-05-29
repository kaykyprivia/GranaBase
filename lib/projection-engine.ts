import type { Bill, ExpenseEntry, IncomeEntry, InstallmentPayment } from "@/types/database";
import { getEffectiveInstallmentStatus, isInstallmentPaid } from "@/lib/installments";

export type PressureLevel = "healthy" | "attention" | "critical";
export type DayRisk = "safe" | "warning" | "critical";
export type ConfidenceLabel = "Alta" | "Média" | "Baixa";

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface RecurringIncomePattern {
  id: string;
  label: string;
  estimatedAmount: number;     // median of historical occurrences
  expectedDayOfMonth: number;  // most common day of month it appears
  confidence: number;          // 0.0 – 1.0
  confidenceLabel: ConfidenceLabel;
  occurrences: number;         // count of past occurrences
  minAmount: number;
  maxAmount: number;
}

export interface ProjectedEvent {
  id: string;
  title: string;
  amount: number;
  type: "income" | "bill" | "installment";
  isOverdue?: boolean;
  isProjected?: boolean;       // true for projected (future) recurring income
  confidence?: number;         // 0.0 – 1.0, only for projected income
}

export interface ProjectionDay {
  date: string;
  dateLabel: string;
  dayNumber: number;
  events: ProjectedEvent[];
  totalIn: number;             // projected income events
  totalOut: number;            // bill + installment events
  balance: number;             // running balance after events
  risk: DayRisk;
  isToday: boolean;
  isFuture: boolean;
}

export interface RadarDimension {
  label: string;
  score: number;               // 0–100
  fullLabel: string;
}

export interface FinancialProjection {
  // Snapshot
  currentBalance: number;
  walletBalance: number;
  totalPatrimony: number;

  // Monthly
  monthIncome: number;
  monthExpenses: number;

  // Obligations (3 horizons)
  committedThisMonth: number;
  committedNext30Days: number;
  committedTotal: number;
  pendingBillsAmount: number;
  pendingInstallmentsAmount: number;

  // Free money
  freeMoneyReal: number;

  // Pressure (rolling 30 days)
  pressureScore: number;
  pressureLevel: PressureLevel;
  committedPercent: number;    // alias

  // Averages & projections
  avgMonthlyIncome: number;
  projectedIncomeNext30: number;   // from recurring patterns
  surplusProjected: number;        // projectedIncomeNext30 - committedNext30Days
  nextRiskDate: string | null;

  // Data
  days: ProjectionDay[];
  radar: RadarDimension[];
  recurringIncome: RecurringIncomePattern[];
}

export interface ProjectionInput {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  bills: Bill[];
  installmentPayments: InstallmentPayment[];
  walletBalance: number;
  /** Pre-computed all-time balance (totalIncome - totalExpenses) to avoid re-scan */
  currentBalance?: number;
}

// ─── Shared pure utilities ────────────────────────────────────────────────────

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats a local Date as "YYYY-MM-DD" — always local timezone to match stored date strings. */
export function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getMonthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Clamp a number to [0, 100]. */
function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// ─── Average income (last N complete months, never current) ──────────────────

/**
 * Returns average monthly income from the last `monthsBack` COMPLETE months.
 * Excludes current month to avoid partial-month distortion.
 */
export function getAvgMonthlyIncome(income: IncomeEntry[], monthsBack = 3): number {
  const now = new Date();
  let total = 0;
  let counted = 0;

  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = getMonthKey(d);
    const sum = income.filter((e) => e.received_at.startsWith(key)).reduce((s, e) => s + e.amount, 0);
    if (sum > 0) { total += sum; counted++; }
  }

  if (counted === 0) {
    const key = getMonthKey(now);
    return income.filter((e) => e.received_at.startsWith(key)).reduce((s, e) => s + e.amount, 0);
  }

  return total / counted;
}

// ─── Obligation predicates ────────────────────────────────────────────────────

function isPendingBill(b: Bill): boolean { return b.status !== "paid"; }

function isPendingInstallment(ip: InstallmentPayment): boolean {
  return !isInstallmentPaid(getEffectiveInstallmentStatus(ip));
}

// ─── Recurring income detection ────────────────────────────────────────────────

/**
 * Analyzes historical income entries to detect recurring income patterns.
 * A pattern requires:
 *   - Same description, appearing in ≥3 distinct calendar months
 *   - Reasonably consistent amount (CV < 0.5) and day-of-month (>50% same day)
 *   - Composite confidence ≥ 0.5
 *
 * This enables the projection engine to show expected future income in the timeline,
 * making pressure scores and surplus projections far more accurate for salaried users.
 */
export function detectRecurringIncome(
  income: IncomeEntry[],
  monthsBack = 6
): RecurringIncomePattern[] {
  if (income.length < 3) return [];

  const now = new Date();
  const cutoffKey = getMonthKey(new Date(now.getFullYear(), now.getMonth() - monthsBack, 1));

  // Only analyze recent history
  const recent = income.filter((e) => e.received_at.slice(0, 7) >= cutoffKey);
  if (recent.length < 3) return [];

  // Group by normalized description
  const byDesc: Record<string, IncomeEntry[]> = {};
  for (const e of recent) {
    const key = e.description.toLowerCase().trim();
    (byDesc[key] ??= []).push(e);
  }

  const patterns: RecurringIncomePattern[] = [];

  for (const [, entries] of Object.entries(byDesc)) {
    if (entries.length < 3) continue;

    // Must appear in ≥3 distinct calendar months
    const distinctMonths = new Set(entries.map((e) => e.received_at.slice(0, 7)));
    if (distinctMonths.size < 3) continue;

    const amounts = entries.map((e) => e.amount).sort((a, b) => a - b);
    const medianAmount = amounts[Math.floor(amounts.length / 2)];
    const avgAmount = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const minAmount = amounts[0];
    const maxAmount = amounts[amounts.length - 1];

    // Amount consistency: lower CV → more consistent
    const variance = amounts.reduce((s, v) => s + (v - avgAmount) ** 2, 0) / amounts.length;
    const cv = avgAmount > 0 ? Math.sqrt(variance) / avgAmount : 1;
    const amountConsistency = Math.max(0, 1 - Math.min(cv, 1));

    // Day-of-month consistency
    const days = entries.map((e) => parseInt(e.received_at.slice(8, 10)));
    const dayFreq: Record<number, number> = {};
    for (const d of days) { dayFreq[d] = (dayFreq[d] ?? 0) + 1; }
    const [modeDay, modeDayCount] = Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0];
    const dayConsistency = modeDayCount / days.length;

    // Recurrence regularity: appeared in N of possible M months
    const recurrenceScore = Math.min(entries.length / monthsBack, 1);

    // Composite confidence (weighted)
    const confidence = amountConsistency * 0.4 + dayConsistency * 0.35 + recurrenceScore * 0.25;

    if (confidence < 0.5) continue;

    patterns.push({
      id: `recurring-${entries[0].description.toLowerCase().replace(/\W+/g, "-")}`,
      label: entries[0].description,
      estimatedAmount: medianAmount,
      expectedDayOfMonth: parseInt(modeDay),
      confidence,
      confidenceLabel: confidence >= 0.8 ? "Alta" : confidence >= 0.65 ? "Média" : "Baixa",
      occurrences: entries.length,
      minAmount,
      maxAmount,
    });
  }

  // Sort by amount descending; limit to top 5 patterns
  return patterns.sort((a, b) => b.estimatedAmount - a.estimatedAmount).slice(0, 5);
}

// ─── Daily projection ─────────────────────────────────────────────────────────

function formatDayLabel(date: Date, index: number): string {
  if (index === 0) return "Hoje";
  if (index === 1) return "Amanhã";
  const M = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${date.getDate()} ${M[date.getMonth()]}`;
}

/**
 * Returns the last valid day of the given month (handles Feb, 30-day months, etc.)
 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function buildDailyProjection(
  startingBalance: number,
  bills: Bill[],
  installments: InstallmentPayment[],
  recurringPatterns: RecurringIncomePattern[],
  daysCount = 30
): ProjectionDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = dateToStr(today);

  // Pre-index bills and installments by date for O(1) per-day lookup
  const billsByDate: Record<string, Bill[]> = {};
  const instByDate: Record<string, InstallmentPayment[]> = {};
  for (const b of bills) {
    if (!isPendingBill(b)) continue;
    (billsByDate[b.due_date] ??= []).push(b);
  }
  for (const ip of installments) {
    if (!isPendingInstallment(ip)) continue;
    (instByDate[ip.due_date] ??= []).push(ip);
  }

  // Collect all overdue obligations for day 0
  const overdueBills = bills.filter((b) => isPendingBill(b) && b.due_date < todayStr);
  const overdueInst = installments.filter((ip) => isPendingInstallment(ip) && ip.due_date < todayStr);

  const result: ProjectionDay[] = [];
  let running = startingBalance;

  for (let i = 0; i < daysCount; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = dateToStr(date);
    const dayOfMonth = date.getDate();

    const events: ProjectedEvent[] = [];

    if (i === 0) {
      // Day 0: include ALL overdue (past-due) obligations — they're immediate cash needs
      for (const b of overdueBills) {
        events.push({ id: b.id, title: b.name, amount: b.amount, type: "bill", isOverdue: true });
      }
      for (const ip of overdueInst) {
        events.push({ id: ip.id, title: `Parcela ${ip.installment_number}`, amount: ip.amount, type: "installment", isOverdue: true });
      }
      // Also include bills/installments due TODAY
      for (const b of (billsByDate[dateStr] ?? [])) {
        events.push({ id: b.id, title: b.name, amount: b.amount, type: "bill" });
      }
      for (const ip of (instByDate[dateStr] ?? [])) {
        events.push({ id: ip.id, title: `Parcela ${ip.installment_number}`, amount: ip.amount, type: "installment" });
      }
    } else {
      // Future days: exact date match
      for (const b of (billsByDate[dateStr] ?? [])) {
        events.push({ id: b.id, title: b.name, amount: b.amount, type: "bill" });
      }
      for (const ip of (instByDate[dateStr] ?? [])) {
        events.push({ id: ip.id, title: `Parcela ${ip.installment_number}`, amount: ip.amount, type: "installment" });
      }

      // Projected recurring income
      const lastDay = lastDayOfMonth(date.getFullYear(), date.getMonth());
      for (const pattern of recurringPatterns) {
        const expectedDay = Math.min(pattern.expectedDayOfMonth, lastDay); // handles Feb, 30-day months
        const diff = Math.abs(dayOfMonth - expectedDay);
        // Match within ±1 day to handle weekends/payment delays
        if (diff <= 1) {
          events.push({
            id: `proj-${pattern.id}-${dateStr}`,
            title: pattern.label,
            amount: pattern.estimatedAmount,
            type: "income",
            isProjected: true,
            confidence: pattern.confidence,
          });
        }
      }
    }

    const totalOut = events.filter((e) => e.type !== "income").reduce((s, e) => s + e.amount, 0);
    const totalIn  = events.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
    running = running - totalOut + totalIn;

    // Warning threshold: only meaningful if starting balance is positive.
    // If negative from the start, every future day is already "critical territory".
    const warningThreshold = startingBalance > 0 ? startingBalance * 0.15 : Infinity;
    const risk: DayRisk =
      running < 0 ? "critical" :
      running < warningThreshold ? "warning" :
      "safe";

    result.push({
      date: dateStr,
      dateLabel: formatDayLabel(date, i),
      dayNumber: dayOfMonth,
      events,
      totalIn,
      totalOut,
      balance: running,
      risk,
      isToday: i === 0,
      isFuture: i > 0,
    });
  }

  return result;
}

// ─── Adaptive Radar ────────────────────────────────────────────────────────────


/**
 * Computes the 5-dimension financial health radar.
 *
 * Key design decisions:
 * - "Controle" uses expense/income RATIO (not category names) → works for any income level
 * - "Estabilidade" uses only COMPLETED months → no partial-month distortion
 * - "Liquidez" uses 3× coverage of next-30-day obligations → realistic safety margin
 * - "Crédito" uses 30-day installment load → actionable, not scary lifetime debt
 * - "Crescimento" uses 1-year income as patrimony target → progressive milestone
 */
function computeRadar(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  installmentPayments: InstallmentPayment[],
  walletBalance: number,
  currentBalance: number,
  committedNext30Days: number,
  avgMonthlyIncome: number,
  monthIncome: number,
  monthExpenses: number
): RadarDimension[] {
  const now = new Date();

  // ── 1. Estabilidade ─────────────────────────────────────────────────────────
  // CV of last 3 COMPLETE months only. Never includes current partial month.
  const completedTotals = [1, 2, 3].map((i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return income.filter((e) => e.received_at.startsWith(getMonthKey(d))).reduce((s, e) => s + e.amount, 0);
  });
  const mean3 = completedTotals.reduce((s, v) => s + v, 0) / 3;
  const cv = mean3 > 0
    ? Math.sqrt(completedTotals.reduce((s, v) => s + (v - mean3) ** 2, 0) / 3) / mean3
    : 1;
  const stabilityScore = clamp(Math.round((1 - Math.min(cv, 1)) * 100));

  // ── 2. Liquidez ─────────────────────────────────────────────────────────────
  // Current balance coverage ratio vs next-30-day obligations.
  // Score 100 when balance ≥ 3× obligations (safe margin).
  const liquidityRatio =
    committedNext30Days > 0
      ? currentBalance / committedNext30Days
      : currentBalance > 0 ? 3 : 0;
  const liquidityScore = clamp(Math.round(Math.min(liquidityRatio / 3, 1) * 100));

  // ── 3. Controle de Gastos ────────────────────────────────────────────────────
  // ADAPTIVE: uses expense/income ratio — works for any income level.
  // Also gives partial credit based on discretionary % for granularity.
  const monthExpTrimmed = monthExpenses;
  const expenseRatio = monthIncome > 0 ? monthExpTrimmed / monthIncome : 1;

  // Piecewise scoring: 0–50% → 95–80, 50–70% → 80–55, 70–90% → 55–20, 90%+ → 20–0
  let controlScore: number;
  if (expenseRatio <= 0.5)       controlScore = clamp(Math.round(95 - expenseRatio / 0.5 * 15));
  else if (expenseRatio <= 0.7)  controlScore = clamp(Math.round(80 - (expenseRatio - 0.5) / 0.2 * 25));
  else if (expenseRatio <= 0.9)  controlScore = clamp(Math.round(55 - (expenseRatio - 0.7) / 0.2 * 35));
  else                           controlScore = clamp(Math.round(Math.max(0, 20 - (expenseRatio - 0.9) / 0.1 * 20)));

  // Bonus: if user has data but no income this month yet, don't crush the score
  if (monthIncome === 0 && monthExpenses === 0) controlScore = 50; // neutral

  // ── 4. Dependência de Crédito ─────────────────────────────────────────────────
  // Installment load (next 30 days, future only) vs avg monthly income.
  const nowTs = now.getTime();
  const in30Ts = nowTs + 30 * 86400000;
  const instLoad30 = installmentPayments
    .filter((ip) => {
      if (!isPendingInstallment(ip)) return false;
      const dueTs = new Date(ip.due_date + "T00:00:00").getTime();
      return dueTs >= nowTs && dueTs <= in30Ts;
    })
    .reduce((s, ip) => s + ip.amount, 0);
  const creditRatio = avgMonthlyIncome > 0 ? instLoad30 / avgMonthlyIncome : 0;
  const creditScore = clamp(Math.round((1 - Math.min(creditRatio, 1)) * 100));

  // ── 5. Crescimento Patrimonial ────────────────────────────────────────────────
  // Wallet vs 1 year of average income. Progressive milestone (not all-or-nothing).
  const annualIncome = avgMonthlyIncome * 12;
  const growthScore = annualIncome > 0
    ? clamp(Math.round(Math.min(walletBalance / annualIncome, 1) * 100))
    : walletBalance > 0 ? 50 : 0;

  return [
    { label: "Estabilidade", fullLabel: "Estabilidade de Renda",   score: stabilityScore },
    { label: "Liquidez",     fullLabel: "Liquidez Financeira",      score: liquidityScore },
    { label: "Controle",     fullLabel: "Controle de Gastos",       score: controlScore   },
    { label: "Crédito",      fullLabel: "Dependência de Crédito",   score: creditScore    },
    { label: "Crescimento",  fullLabel: "Crescimento Patrimonial",  score: growthScore    },
  ];
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildProjection(input: ProjectionInput): FinancialProjection {
  const { income, expenses, bills, installmentPayments, walletBalance } = input;

  // Single `now` for ALL calculations — prevents midnight boundary race conditions
  const now = new Date();
  now.setSeconds(0, 0);

  const monthKey    = getMonthKey(now);
  const todayStr    = dateToStr(now);
  const startOfMonthStr = `${monthKey}-01`;
  const endOfMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const endOfMonthStr = dateToStr(endOfMonth);
  const in30        = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
  const in30Str     = dateToStr(in30);

  // ── Balance ───────────────────────────────────────────────────────────────────
  // Use pre-computed balance if provided (from separate lightweight query in provider)
  // otherwise compute from loaded income/expenses
  const currentBalance = input.currentBalance ??
    (income.reduce((s, e) => s + e.amount, 0) - expenses.reduce((s, e) => s + e.amount, 0));

  // ── Monthly ───────────────────────────────────────────────────────────────────
  const monthIncome  = income.filter((e) => e.received_at.startsWith(monthKey)).reduce((s, e) => s + e.amount, 0);
  const monthExpenses = expenses.filter((e) => e.spent_at.startsWith(monthKey)).reduce((s, e) => s + e.amount, 0);

  // ── Obligations ───────────────────────────────────────────────────────────────
  // committedThisMonth: bills from entire current month + installments from today
  const thisMonthBills = bills
    .filter((b) => isPendingBill(b) && b.due_date >= startOfMonthStr && b.due_date <= endOfMonthStr)
    .reduce((s, b) => s + b.amount, 0);
  const thisMonthInst = installmentPayments
    .filter((ip) => isPendingInstallment(ip) && ip.due_date >= todayStr && ip.due_date <= endOfMonthStr)
    .reduce((s, ip) => s + ip.amount, 0);
  const committedThisMonth = thisMonthBills + thisMonthInst;

  // committedNext30Days: rolling 30-day window (for pressure score)
  const next30Bills = bills
    .filter((b) => isPendingBill(b) && b.due_date >= todayStr && b.due_date <= in30Str)
    .reduce((s, b) => s + b.amount, 0);
  const next30Inst = installmentPayments
    .filter((ip) => isPendingInstallment(ip) && ip.due_date >= todayStr && ip.due_date <= in30Str)
    .reduce((s, ip) => s + ip.amount, 0);
  const committedNext30Days = next30Bills + next30Inst;

  // committedTotal: ALL pending obligations, any horizon
  const totalPendingBills = bills.filter(isPendingBill).reduce((s, b) => s + b.amount, 0);
  const totalPendingInst  = installmentPayments.filter(isPendingInstallment).reduce((s, ip) => s + ip.amount, 0);
  const committedTotal = totalPendingBills + totalPendingInst;

  // ── Averages ──────────────────────────────────────────────────────────────────
  const avgMonthlyIncome = getAvgMonthlyIncome(income);

  // ── Recurring income detection ────────────────────────────────────────────────
  const recurringIncome = detectRecurringIncome(income, 6);

  // Projected income in next 30 days from recurring patterns
  const projectedIncomeNext30 = recurringIncome.reduce((sum, pattern) => {
    const expectedDay = Math.min(pattern.expectedDayOfMonth, 31);
    // Check if expected day falls within next 30 days
    for (let i = 1; i <= 30; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const clamped = Math.min(expectedDay, lastDay);
      if (Math.abs(d.getDate() - clamped) <= 1) {
        return sum + pattern.estimatedAmount;
      }
    }
    return sum;
  }, 0);

  // ── Pressure ─────────────────────────────────────────────────────────────────
  // Use max(avgMonthlyIncome, projectedIncomeNext30) to avoid false pressure
  // when user has confirmed recurring income coming soon
  const incomeBase = Math.max(avgMonthlyIncome, projectedIncomeNext30 > 0 ? projectedIncomeNext30 : 0);
  const pressureScore = clamp(
    incomeBase > 0 ? Math.round((committedNext30Days / incomeBase) * 100) : 0
  );
  const pressureLevel: PressureLevel =
    pressureScore < 40 ? "healthy" : pressureScore < 70 ? "attention" : "critical";

  // ── Free money ────────────────────────────────────────────────────────────────
  const freeMoneyReal = monthIncome - monthExpenses - committedThisMonth;

  // ── Surplus projection ────────────────────────────────────────────────────────
  // Use projected income when available; fallback to historical average
  const incomeProjection = projectedIncomeNext30 > 0 ? projectedIncomeNext30 : avgMonthlyIncome;
  const surplusProjected = incomeProjection - committedNext30Days;

  // ── Timeline ─────────────────────────────────────────────────────────────────
  const days = buildDailyProjection(currentBalance, bills, installmentPayments, recurringIncome, 30);
  const nextRiskDate = days.find((d) => d.risk === "critical" && d.isFuture)?.date ?? null;

  // ── Radar ─────────────────────────────────────────────────────────────────────
  const radar = computeRadar(
    income, expenses, installmentPayments, walletBalance,
    currentBalance, committedNext30Days, avgMonthlyIncome,
    monthIncome, monthExpenses
  );

  return {
    currentBalance,
    walletBalance,
    totalPatrimony: currentBalance + walletBalance,

    monthIncome,
    monthExpenses,

    committedThisMonth,
    committedNext30Days,
    committedTotal,
    pendingBillsAmount: totalPendingBills,
    pendingInstallmentsAmount: totalPendingInst,

    freeMoneyReal,

    pressureScore,
    pressureLevel,
    committedPercent: pressureScore,

    avgMonthlyIncome,
    projectedIncomeNext30,
    surplusProjected,
    nextRiskDate,

    days,
    radar,
    recurringIncome,
  };
}

// ─── Contextual message ───────────────────────────────────────────────────────

export function getContextualMessage(p: FinancialProjection): string {
  if (p.nextRiskDate) {
    const d = new Date(p.nextRiskDate + "T00:00:00");
    const M = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
    return `Atenção: saldo projetado negativo dia ${d.getDate()} de ${M[d.getMonth()]}`;
  }
  if (p.pressureLevel === "critical") {
    return `${p.pressureScore}% da renda dos próximos 30 dias está comprometida`;
  }
  if (p.pressureLevel === "attention") {
    const ratio = p.monthIncome > 0 ? (p.monthExpenses / p.monthIncome) * 100 : 0;
    return ratio > 80
      ? "Gastos consumindo quase toda a renda este mês — atenção"
      : "Fluxo apertado — monitore as obrigações dos próximos dias";
  }
  if (p.freeMoneyReal > 0) {
    return "Mês saudável — você tem sobra real para investir ou reservar";
  }
  return "Acompanhe seu fluxo com atenção nos próximos dias";
}
