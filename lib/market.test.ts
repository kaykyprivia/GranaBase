import { describe, expect, it } from "vitest";
import { annualizeDailyRate, calculateCdb100CdiReturn } from "@/lib/market";

describe("market calculations", () => {
  it("annualizes a daily CDI rate using 252 business days", () => {
    expect(annualizeDailyRate(0.052)).toBeCloseTo(14, 0);
  });

  it("calculates CDB 100% CDI daily, monthly and annual gross returns", () => {
    const result = calculateCdb100CdiReturn(10000, 14);

    expect(result.principal).toBe(10000);
    expect(result.annual).toBe(1400);
    expect(result.monthly).toBeGreaterThan(100);
    expect(result.monthly).toBeLessThan(120);
    expect(result.daily).toBeGreaterThan(4);
    expect(result.daily).toBeLessThan(6);
  });

  it("never produces negative return values for invalid principal/rate inputs", () => {
    const result = calculateCdb100CdiReturn(-1000, -14);

    expect(result.principal).toBe(0);
    expect(result.daily).toBe(0);
    expect(result.monthly).toBe(0);
    expect(result.annual).toBe(0);
  });
});
