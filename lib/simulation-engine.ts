/**
 * Simulation Engine — GranaBase V2
 *
 * "E se…" mode: applies hypothetical financial changes to the base projection
 * and returns a new FinancialProjection showing the impact.
 *
 * Architecture: pure function, zero side effects, runs entirely client-side.
 * Takes the raw ProjectionInput from context and runs buildProjection with
 * modified data — guarantees consistency with the live projection engine.
 */

import { buildProjection } from "@/lib/projection-engine";
import type { FinancialProjection, ProjectionInput } from "@/lib/projection-engine";
import type { ExpenseEntry, IncomeEntry, InstallmentPayment } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScenarioType =
  | "new_expense"          // One-time purchase (hits current balance + free money)
  | "new_installment"      // Parcelated purchase (adds N future installment payments)
  | "income_boost"         // One-time extra income (freelance, bonus, etc.)
  | "subscription_cancel"  // Cancel recurring subscription (reduces monthly expenses)
  | "pay_bill_now"         // Pay an overdue/upcoming bill early (clears from timeline)
  | "reduce_spending";     // Commit to spending X% less in a category

export interface SimulationScenario {
  id: string;
  type: ScenarioType;
  label: string;
  amount: number;
  installments?: number;     // for new_installment: number of months
  category?: string;         // for reduce_spending
  reductionPercent?: number; // for reduce_spending (0–100)
  billId?: string;           // for pay_bill_now
}

export interface SimulationDelta {
  freeMoneyReal: number;
  pressureScore: number;
  surplusProjected: number;
  committedNext30Days: number;
  nextRiskDate: string | null;
}

export interface SimulationResult {
  simulated: FinancialProjection;
  baseline: FinancialProjection;
  delta: SimulationDelta;
  scenarios: SimulationScenario[];
  isViable: boolean;  // true if simulation doesn't create new risk days
}

// ─── Fake record factories ─────────────────────────────────────────────────────

function pad(n: number): string { return String(n).padStart(2, "0"); }

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthsFromNow(m: number, baseDay = 10): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + m, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(baseDay, lastDay);
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(day)}`;
}

function fakeExpense(id: string, amount: number, description: string, daysOffset = 0): ExpenseEntry {
  return {
    id: `sim-exp-${id}`,
    user_id: "sim",
    description,
    amount,
    category: "Simulação",
    spent_at: daysFromNow(daysOffset),
    payment_method: null,
    notes: null,
    created_at: new Date().toISOString(),
  };
}

function fakeIncome(id: string, amount: number, description: string): IncomeEntry {
  return {
    id: `sim-inc-${id}`,
    user_id: "sim",
    description,
    amount,
    category: "Simulação",
    received_at: daysFromNow(0),
    payment_method: null,
    notes: null,
    created_at: new Date().toISOString(),
  };
}

function fakeInstallmentPayments(
  id: string,
  totalAmount: number,
  installments: number,
  description: string,
  startDay = 10
): InstallmentPayment[] {
  const perInstallment = totalAmount / installments;
  return Array.from({ length: installments }, (_, i) => ({
    id: `sim-inst-${id}-${i + 1}`,
    user_id: "sim",
    installment_id: `sim-grp-${id}`,
    installment_number: i + 1,
    due_date: monthsFromNow(i + 1, startDay),
    amount: Math.round(perInstallment * 100) / 100,
    status: "pending" as const,
    paid_at: null,
    discount_amount: null,
    paid_amount: null,
    created_at: new Date().toISOString(),
  }));
}

// ─── Apply scenarios to input ─────────────────────────────────────────────────

function applyScenarios(
  base: ProjectionInput,
  scenarios: SimulationScenario[]
): ProjectionInput {
  let income           = [...base.income];
  let expenses         = [...base.expenses];
  let bills            = [...base.bills];
  let installmentPayments = [...base.installmentPayments];

  for (const s of scenarios) {
    switch (s.type) {
      case "new_expense":
        expenses = [...expenses, fakeExpense(s.id, s.amount, s.label)];
        break;

      case "new_installment": {
        const n = Math.max(1, s.installments ?? 1);
        const payments = fakeInstallmentPayments(s.id, s.amount, n, s.label);
        installmentPayments = [...installmentPayments, ...payments];
        break;
      }

      case "income_boost":
        income = [...income, fakeIncome(s.id, s.amount, s.label)];
        break;

      case "subscription_cancel":
        // Remove future expense entries matching the label (monthly recurrences)
        // In simulation: reduce the last 3 months of matching expenses
        // We can't remove future ones (they don't exist as entries), but we can
        // show the positive impact by adding a virtual income entry
        income = [...income, fakeIncome(s.id, s.amount * 12, `Economia: ${s.label}`)];
        break;

      case "pay_bill_now":
        // Mark the target bill as paid in the simulated set
        if (s.billId) {
          bills = bills.map((b) =>
            b.id === s.billId ? { ...b, status: "paid" as const } : b
          );
        }
        break;

      case "reduce_spending": {
        // Reduce recent expenses in the given category by reductionPercent
        const pct = (s.reductionPercent ?? 20) / 100;
        expenses = expenses.map((e) =>
          e.category === s.category
            ? { ...e, amount: e.amount * (1 - pct) }
            : e
        );
        break;
      }
    }
  }

  return {
    income,
    expenses,
    bills,
    installmentPayments,
    walletBalance: base.walletBalance,
    currentBalance: base.currentBalance,
  };
}

// ─── Main simulation function ─────────────────────────────────────────────────

export function runSimulation(
  baseInput: ProjectionInput,
  scenarios: SimulationScenario[]
): SimulationResult {
  if (scenarios.length === 0) {
    const baseline = buildProjection(baseInput);
    return {
      simulated: baseline,
      baseline,
      delta: { freeMoneyReal: 0, pressureScore: 0, surplusProjected: 0, committedNext30Days: 0, nextRiskDate: null },
      scenarios: [],
      isViable: true,
    };
  }

  const baseline   = buildProjection(baseInput);
  const modified   = applyScenarios(baseInput, scenarios);
  const simulated  = buildProjection(modified);

  const newRiskDays = simulated.days.filter(
    (d) => d.risk === "critical" && d.isFuture &&
      !baseline.days.find((bd) => bd.date === d.date && bd.risk === "critical")
  );

  return {
    simulated,
    baseline,
    delta: {
      freeMoneyReal:       simulated.freeMoneyReal - baseline.freeMoneyReal,
      pressureScore:       simulated.pressureScore - baseline.pressureScore,
      surplusProjected:    simulated.surplusProjected - baseline.surplusProjected,
      committedNext30Days: simulated.committedNext30Days - baseline.committedNext30Days,
      nextRiskDate:        simulated.nextRiskDate,
    },
    scenarios,
    isViable: newRiskDays.length === 0,
  };
}

// ─── Preset scenarios ─────────────────────────────────────────────────────────

/** Quick presets for common "E se..." questions. */
export const PRESET_SCENARIOS: Array<{
  id: string;
  label: string;
  description: string;
  scenario: Omit<SimulationScenario, "id">;
}> = [
  {
    id: "p-iphone",
    label: "Comprar um iPhone",
    description: "12x de R$ 450",
    scenario: { type: "new_installment", label: "iPhone", amount: 5400, installments: 12 },
  },
  {
    id: "p-trip",
    label: "Viagem planejada",
    description: "Gasto único de R$ 3.000",
    scenario: { type: "new_expense", label: "Viagem", amount: 3000 },
  },
  {
    id: "p-salary-bonus",
    label: "Bônus / Freela extra",
    description: "Entrada extra de R$ 2.000",
    scenario: { type: "income_boost", label: "Bônus", amount: 2000 },
  },
  {
    id: "p-cancel-sub",
    label: "Cancelar streaming",
    description: "Economia de R$ 50/mês",
    scenario: { type: "subscription_cancel", label: "Streaming", amount: 50 },
  },
];
