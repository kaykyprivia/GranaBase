import { describe, expect, it } from "vitest";
import { calculateGoalMetrics, calculateMonthlySuggestion, summarizeGoals } from "@/lib/goals";

describe("shared goal wallet metrics", () => {
  it("uses one wallet balance for many goals without duplicating patrimonio", () => {
    const goals = [
      { target_amount: 1000, status: "active" as const },
      { target_amount: 5000, status: "active" as const },
      { target_amount: 10000, status: "active" as const },
    ];

    const [first, second, third] = goals.map((goal) => calculateGoalMetrics(goal, 100));
    const summary = summarizeGoals(goals, 100);

    expect(first.walletBalance).toBe(100);
    expect(first.progress).toBe(10);
    expect(first.remainingAmount).toBe(900);
    expect(second.progress).toBe(2);
    expect(second.remainingAmount).toBe(4900);
    expect(third.progress).toBe(1);
    expect(third.remainingAmount).toBe(9900);
    expect(summary.walletBalance).toBe(100);
  });

  it("automatically completes only goals reached by the global balance", () => {
    const completed = calculateGoalMetrics({ target_amount: 1000, status: "active" }, 1000);
    const active = calculateGoalMetrics({ target_amount: 5000, status: "active" }, 1000);

    expect(completed.status).toBe("completed");
    expect(completed.progress).toBe(100);
    expect(completed.remainingAmount).toBe(0);
    expect(active.status).toBe("active");
    expect(active.progress).toBe(20);
  });

  it("preserves a paused goal until the wallet reaches its target", () => {
    const paused = calculateGoalMetrics({ target_amount: 5000, status: "paused" }, 1000);
    const completed = calculateGoalMetrics({ target_amount: 5000, status: "paused" }, 5000);

    expect(paused.status).toBe("paused");
    expect(completed.status).toBe("completed");
  });

  it("does not display 99.6 percent as 100 before the target is reached", () => {
    const metrics = calculateGoalMetrics({ target_amount: 1000, status: "active" }, 996);

    expect(metrics.progress).toBe(99.6);
    expect(metrics.displayProgress).toBe(99);
    expect(metrics.status).toBe("active");
  });

  it("reopens a completed goal when a withdrawal drops global balance below target", () => {
    const metrics = calculateGoalMetrics({ target_amount: 1000, status: "completed" }, 900);

    expect(metrics.status).toBe("active");
    expect(metrics.remainingAmount).toBe(100);
  });

  it("calculates monthly suggestion from wallet balance, not a goal balance", () => {
    const suggestion = calculateMonthlySuggestion(
      { target_amount: 1200, status: "active", deadline: "2026-07-08" },
      600,
      new Date("2026-05-08T00:00:00")
    );

    expect(suggestion.remainingAmount).toBe(600);
    expect(suggestion.monthlyValue).toBe(300);
    expect(suggestion.status).toBe("monthly");
  });
});
