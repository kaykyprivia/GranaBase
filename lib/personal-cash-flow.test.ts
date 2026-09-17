import { describe, expect, it } from "vitest";
import {
  buildMonthlyPersonalCashFlow,
  filterPersonalCashFlowEvents,
  summarizePersonalCashFlow,
  type PersonalCashFlowEvent,
} from "@/lib/personal-cash-flow";

const events: PersonalCashFlowEvent[] = [
  { id: "income-1", direction: "income", date: "2026-07-10", amount: 1000, description: "Julho", category: "Salario", source: "income" },
  { id: "expense-1", direction: "expense", date: "2026-08-05", amount: 250.5, description: "Agosto", category: "Conta", source: "bill" },
  { id: "income-2", direction: "income", date: "2026-09-01", amount: 500.25, description: "Setembro", category: "Freela", source: "income" },
  { id: "expense-2", direction: "expense", date: "2026-09-12", amount: 100, description: "Setembro", category: "Parcela", source: "installment" },
];

describe("personal cash flow", () => {
  it("summarizes realized income, expenses and balance", () => {
    expect(summarizePersonalCashFlow(events)).toEqual({
      income: 1500.25,
      expenses: 350.5,
      balance: 1149.75,
      eventCount: 4,
    });
  });

  it("filters complete calendar-month windows", () => {
    const now = new Date(2026, 8, 17);

    expect(filterPersonalCashFlowEvents(events, "month", now).map((event) => event.id)).toEqual([
      "income-2",
      "expense-2",
    ]);
    expect(filterPersonalCashFlowEvents(events, "3m", now)).toHaveLength(4);
  });

  it("builds ordered monthly totals", () => {
    expect(buildMonthlyPersonalCashFlow(events)).toEqual([
      { month: "2026-07", income: 1000, expenses: 0, balance: 1000 },
      { month: "2026-08", income: 0, expenses: 250.5, balance: -250.5 },
      { month: "2026-09", income: 500.25, expenses: 100, balance: 400.25 },
    ]);
  });
});
