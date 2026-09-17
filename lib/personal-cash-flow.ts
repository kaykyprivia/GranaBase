export type PersonalCashFlowDirection = "income" | "expense";

export type PersonalCashFlowSource =
  | "income"
  | "receivable"
  | "expense"
  | "bill"
  | "installment"
  | "consortium";

export interface PersonalCashFlowEvent {
  id: string;
  direction: PersonalCashFlowDirection;
  date: string;
  amount: number;
  description: string;
  category: string;
  source: PersonalCashFlowSource;
}

export type PersonalCashFlowPeriod = "month" | "3m" | "6m" | "12m" | "all";

export const PERSONAL_CASH_FLOW_PERIODS: Array<{
  value: PersonalCashFlowPeriod;
  label: string;
}> = [
  { value: "month", label: "Mês atual" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
  { value: "all", label: "Todo período" },
];

const PERIOD_MONTHS: Record<Exclude<PersonalCashFlowPeriod, "all">, number> = {
  month: 1,
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

export function filterPersonalCashFlowEvents(
  events: PersonalCashFlowEvent[],
  period: PersonalCashFlowPeriod,
  now = new Date()
): PersonalCashFlowEvent[] {
  if (period === "all") return events;

  const start = new Date(now.getFullYear(), now.getMonth() - (PERIOD_MONTHS[period] - 1), 1);
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;

  return events.filter((event) => event.date >= startKey);
}

export function summarizePersonalCashFlow(events: PersonalCashFlowEvent[]) {
  const income = roundCurrency(
    events
      .filter((event) => event.direction === "income")
      .reduce((sum, event) => sum + event.amount, 0)
  );
  const expenses = roundCurrency(
    events
      .filter((event) => event.direction === "expense")
      .reduce((sum, event) => sum + event.amount, 0)
  );

  return {
    income,
    expenses,
    balance: roundCurrency(income - expenses),
    eventCount: events.length,
  };
}

export function buildMonthlyPersonalCashFlow(events: PersonalCashFlowEvent[]) {
  const months = new Map<string, { month: string; income: number; expenses: number }>();

  events.forEach((event) => {
    const month = event.date.slice(0, 7);
    const row = months.get(month) ?? { month, income: 0, expenses: 0 };
    row[event.direction === "income" ? "income" : "expenses"] += event.amount;
    months.set(month, row);
  });

  return Array.from(months.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => ({
      ...row,
      income: roundCurrency(row.income),
      expenses: roundCurrency(row.expenses),
      balance: roundCurrency(row.income - row.expenses),
    }));
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
