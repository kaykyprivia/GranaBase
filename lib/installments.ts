import { isOverdue } from "@/lib/utils";
import type { InstallmentPayment, InstallmentStatus } from "@/types/database";

export type EffectiveInstallmentStatus = InstallmentStatus | "overdue";

type InstallmentAmountShape = Pick<InstallmentPayment, "amount" | "status"> & {
  discountAmount?: number | null;
  discount_amount?: number | null;
  paidAmount?: number | null;
  paid_amount?: number | null;
};

export function normalizeInstallmentStatus(status: string | null | undefined): InstallmentStatus {
  if (status === "paid" || status === "paid_with_discount" || status === "pending") {
    return status;
  }

  return "pending";
}

export function isInstallmentPaid(status: string | null | undefined): boolean {
  const normalizedStatus = normalizeInstallmentStatus(status);
  return normalizedStatus === "paid" || normalizedStatus === "paid_with_discount";
}

// The check button is the "paid/unpaid" control for the whole installment.
// If the installment is already settled, clicking it should always bring it back to pending.
export function togglePaidStatus(status: string | null | undefined): InstallmentStatus {
  return normalizeInstallmentStatus(status) === "pending" ? "paid" : "pending";
}

export function toggleDiscountStatus(status: string | null | undefined): InstallmentStatus {
  return normalizeInstallmentStatus(status) === "paid_with_discount" ? "paid" : "paid_with_discount";
}

export function getEffectiveInstallmentStatus(payment: Pick<InstallmentPayment, "status" | "due_date">): EffectiveInstallmentStatus {
  const normalizedStatus = normalizeInstallmentStatus(payment.status);

  if (normalizedStatus === "pending" && isOverdue(payment.due_date)) {
    return "overdue";
  }

  return normalizedStatus;
}

export function getInstallmentStatusLabel(status: EffectiveInstallmentStatus): string {
  switch (status) {
    case "paid":
      return "Paga";
    case "paid_with_discount":
      return "Pago com desconto";
    case "overdue":
      return "Atrasada";
    default:
      return "Pendente";
  }
}

export function getInstallmentPaidAmount(payment: InstallmentAmountShape): number {
  if (!isInstallmentPaid(payment.status)) {
    return 0;
  }

  if (typeof payment.paid_amount === "number") {
    return payment.paid_amount;
  }

  if (typeof payment.paidAmount === "number") {
    return payment.paidAmount;
  }

  return payment.amount;
}

export function summarizeInstallmentPayments(
  payments: InstallmentPayment[],
  installmentCount: number,
  totalAmount: number
) {
  const paidPayments = payments.filter((payment) => isInstallmentPaid(payment.status));
  const paidCount = paidPayments.length;
  const paidAmount = roundCurrency(paidPayments.reduce((sum, payment) => sum + getInstallmentPaidAmount(payment), 0));
  const remainingCount = Math.max(installmentCount - paidCount, 0);
  const remainingAmount = Math.max(roundCurrency(totalAmount - paidAmount), 0);
  const progress = installmentCount > 0 ? (paidCount / installmentCount) * 100 : 0;
  const nextPayment = payments.find((payment) => !isInstallmentPaid(payment.status)) ?? null;

  return {
    paidCount,
    paidAmount,
    progress,
    remainingCount,
    remainingAmount,
    nextPayment,
  };
}

export function buildInstallmentStatusUpdate(
  payment: Pick<InstallmentPayment, "status" | "paid_at">,
  nextStatus: InstallmentStatus,
  now = new Date().toISOString()
) {
  const shouldBePaid = isInstallmentPaid(nextStatus);

  return {
    status: nextStatus,
    paid_at: shouldBePaid ? payment.paid_at ?? now : null,
  };
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
