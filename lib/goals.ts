import type { FinancialGoal } from "@/types/database";

export type GoalMonthlySuggestionStatus = "no_deadline" | "completed" | "expired" | "immediate" | "monthly";
export type GoalRuntimeStatus = FinancialGoal["status"];

export interface GoalMonthlySuggestion {
  remainingAmount: number;
  monthsLeft: number;
  monthlyValue: number;
  status: GoalMonthlySuggestionStatus;
}

export interface GoalMetrics {
  targetAmount: number;
  walletBalance: number;
  progress: number;
  displayProgress: number;
  remainingAmount: number;
  status: GoalRuntimeStatus;
  isCompleted: boolean;
}

export interface GoalSummary {
  target: number;
  walletBalance: number;
  completed: number;
  active: number;
  paused: number;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function roundMoney(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 100);
}

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

export function calculateGoalMetrics(
  goal: Pick<FinancialGoal, "target_amount" | "status">,
  walletBalance: number
): GoalMetrics {
  const targetAmount = roundMoney(Math.max(goal.target_amount, 0));
  const safeWalletBalance = roundMoney(Math.max(walletBalance, 0));
  const rawProgress = targetAmount > 0 ? (safeWalletBalance / targetAmount) * 100 : 0;
  const progress = clampPercent(rawProgress);
  const remainingAmount = roundMoney(Math.max(targetAmount - safeWalletBalance, 0));
  const isCompleted = targetAmount > 0 && safeWalletBalance >= targetAmount;
  const status: GoalRuntimeStatus = isCompleted ? "completed" : goal.status === "paused" ? "paused" : "active";

  return {
    targetAmount,
    walletBalance: safeWalletBalance,
    progress,
    displayProgress: Math.floor(progress),
    remainingAmount,
    status,
    isCompleted,
  };
}

export function summarizeGoals(
  goals: Array<Pick<FinancialGoal, "target_amount" | "status">>,
  walletBalance: number
): GoalSummary {
  return goals.reduce(
    (summary, goal) => {
      const metrics = calculateGoalMetrics(goal, walletBalance);
      summary.target = roundMoney(summary.target + metrics.targetAmount);

      if (metrics.status === "completed") {
        summary.completed += 1;
      }

      if (metrics.status === "active") {
        summary.active += 1;
      }

      if (metrics.status === "paused") {
        summary.paused += 1;
      }

      return summary;
    },
    { target: 0, walletBalance: roundMoney(Math.max(walletBalance, 0)), completed: 0, active: 0, paused: 0 }
  );
}

export function calculateMonthlySuggestion(
  goal: Pick<FinancialGoal, "target_amount" | "deadline" | "status">,
  walletBalance: number,
  now = new Date()
): GoalMonthlySuggestion {
  const metrics = calculateGoalMetrics(goal, walletBalance);
  const remainingAmount = metrics.remainingAmount;

  if (remainingAmount <= 0 || metrics.status === "completed") {
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
      monthlyValue: roundMoney(remainingAmount),
      status: "immediate",
    };
  }

  const monthsLeft = getMonthsLeft(today, deadline);
  const monthlyValue = roundMoney(remainingAmount / monthsLeft);

  return {
    remainingAmount,
    monthsLeft,
    monthlyValue,
    status: "monthly",
  };
}
