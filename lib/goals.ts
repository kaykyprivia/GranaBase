import type { FinancialGoal } from "@/types/database";

export type GoalMonthlySuggestionStatus = "no_deadline" | "completed" | "expired" | "immediate" | "monthly";

export interface GoalMonthlySuggestion {
  remainingAmount: number;
  monthsLeft: number;
  monthlyValue: number;
  status: GoalMonthlySuggestionStatus;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function normalizeDate(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getMonthsLeft(from: Date, to: Date) {
  const yearDiff = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  return Math.max(yearDiff * 12 + monthDiff, 1);
}

export function calculateMonthlySuggestion(
  goal: Pick<FinancialGoal, "target_amount" | "current_amount" | "deadline" | "status">,
  now = new Date()
): GoalMonthlySuggestion {
  const remainingAmount = Math.max(goal.target_amount - goal.current_amount, 0);

  if (remainingAmount <= 0 || goal.status === "completed") {
    return {
      remainingAmount: 0,
      monthsLeft: 0,
      monthlyValue: 0,
      status: "completed",
    };
  }

  if (!goal.deadline) {
    return {
      remainingAmount,
      monthsLeft: 0,
      monthlyValue: 0,
      status: "no_deadline",
    };
  }

  const today = normalizeDate(now);
  const deadline = normalizeDate(new Date(`${goal.deadline}T00:00:00`));

  if (deadline < today) {
    return {
      remainingAmount,
      monthsLeft: 0,
      monthlyValue: 0,
      status: "expired",
    };
  }

  const daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / DAY_IN_MS);

  if (daysLeft < 30) {
    return {
      remainingAmount,
      monthsLeft: 1,
      monthlyValue: Math.round(remainingAmount * 100) / 100,
      status: "immediate",
    };
  }

  const monthsLeft = getMonthsLeft(today, deadline);
  const monthlyValue = Math.round((remainingAmount / monthsLeft) * 100) / 100;

  return {
    remainingAmount,
    monthsLeft,
    monthlyValue,
    status: "monthly",
  };
}
