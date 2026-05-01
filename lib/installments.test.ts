import { describe, expect, it } from "vitest";
import {
  buildInstallmentStatusUpdate,
  getEffectiveInstallmentStatus,
  isInstallmentPaid,
  summarizeInstallmentPayments,
  toggleDiscountStatus,
  togglePaidStatus,
} from "@/lib/installments";
import type { InstallmentPayment } from "@/types/database";

function makePayment(overrides: Partial<InstallmentPayment> = {}): InstallmentPayment {
  return {
    id: "payment-1",
    user_id: "user-1",
    installment_id: "installment-1",
    installment_number: 1,
    due_date: "2026-06-04",
    amount: 100,
    status: "pending",
    paid_at: null,
    created_at: "2026-04-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("installment status helpers", () => {
  it("treats paid with discount as paid", () => {
    expect(isInstallmentPaid("paid")).toBe(true);
    expect(isInstallmentPaid("paid_with_discount")).toBe(true);
    expect(isInstallmentPaid("pending")).toBe(false);
  });

  it("toggles the check button back to pending from any paid state", () => {
    expect(togglePaidStatus("pending")).toBe("paid");
    expect(togglePaidStatus("paid")).toBe("pending");
    expect(togglePaidStatus("paid_with_discount")).toBe("pending");
  });

  it("toggles the discount button between paid and paid_with_discount", () => {
    expect(toggleDiscountStatus("pending")).toBe("paid_with_discount");
    expect(toggleDiscountStatus("paid")).toBe("paid_with_discount");
    expect(toggleDiscountStatus("paid_with_discount")).toBe("paid");
  });

  it("keeps overdue as a derived state for pending installments only", () => {
    expect(getEffectiveInstallmentStatus(makePayment({ due_date: "2020-01-01", status: "pending" }))).toBe("overdue");
    expect(getEffectiveInstallmentStatus(makePayment({ due_date: "2020-01-01", status: "paid_with_discount" }))).toBe("paid_with_discount");
  });

  it("builds paid_at transitions without losing an existing settlement date", () => {
    const now = "2026-04-30T12:00:00.000Z";

    expect(buildInstallmentStatusUpdate(makePayment(), "paid", now)).toEqual({
      status: "paid",
      paid_at: now,
    });

    expect(buildInstallmentStatusUpdate(makePayment({ status: "paid", paid_at: now }), "pending", now)).toEqual({
      status: "pending",
      paid_at: null,
    });

    expect(buildInstallmentStatusUpdate(makePayment({ status: "paid", paid_at: now }), "paid_with_discount", "2026-05-01T09:00:00.000Z")).toEqual({
      status: "paid_with_discount",
      paid_at: now,
    });
  });

  it("recalculates paid, remaining and progress using discounted payments as settled", () => {
    const discountedPayment = {
      ...makePayment({
        id: "payment-2",
        installment_number: 2,
        status: "paid_with_discount",
      }),
      paid_amount: 80,
    } as InstallmentPayment & { paid_amount: number };

    const summary = summarizeInstallmentPayments(
      [
        makePayment({ status: "paid" }),
        discountedPayment,
        makePayment({
          id: "payment-3",
          installment_number: 3,
          due_date: "2026-08-04",
        }),
      ] as InstallmentPayment[],
      3,
      300
    );

    expect(summary.paidCount).toBe(2);
    expect(summary.paidAmount).toBe(180);
    expect(summary.remainingCount).toBe(1);
    expect(summary.remainingAmount).toBe(120);
    expect(summary.progress).toBeCloseTo(66.666, 2);
    expect(summary.nextPayment?.id).toBe("payment-3");
  });
});
