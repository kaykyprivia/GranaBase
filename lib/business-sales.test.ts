import { describe, expect, it } from "vitest";
import {
  calculatePaymentSummary,
  calculateSalePreview,
  canCancelSale,
  canReturnSale,
  getNextSaleAdvanceAction,
  getSalesDateRange,
  hasSaleFormErrors,
  validateSaleForm,
  type SaleFormDraft,
  type SaleFormItem,
} from "@/lib/business-sales";

const saleItem: SaleFormItem = {
  productId: "product-1",
  productName: "Suporte Celular",
  available: 10,
  averageUnitCost: 12,
  quantity: 2,
  unitSalePrice: 25,
  discountAmount: 0,
  platformFee: 0,
  shippingCost: 0,
  additionalCosts: 0,
};

function draft(overrides: Partial<SaleFormDraft> = {}): SaleFormDraft {
  return {
    saleDate: "2026-09-09",
    items: [saleItem],
    ...overrides,
  };
}

describe("business sales UI helpers", () => {
  it("calculates preview totals without treating them as official backend results", () => {
    const preview = calculateSalePreview([
      { ...saleItem, quantity: 2, unitSalePrice: 25, discountAmount: 0 },
      {
        ...saleItem,
        productId: "product-2",
        productName: "Fone Bluetooth",
        averageUnitCost: 18,
        quantity: 1,
        unitSalePrice: 40,
        platformFee: 3,
        shippingCost: 5,
      },
    ]);

    expect(preview).toMatchObject({
      subtotal: 90,
      totalAmount: 90,
      estimatedCogs: 42,
      estimatedGrossProfit: 48,
      estimatedNetProfit: 40,
      estimatedMarginPct: 44.44,
      belowCost: false,
    });
  });

  it("supports discounts, fees and loss warnings", () => {
    const preview = calculateSalePreview([
      {
        ...saleItem,
        quantity: 1,
        unitSalePrice: 10,
        discountAmount: 2,
        platformFee: 1,
      },
    ]);

    expect(preview.totalAmount).toBe(8);
    expect(preview.estimatedNetProfit).toBe(-5);
    expect(preview.belowCost).toBe(true);
  });

  it("validates multi-item quantity against aggregated available stock", () => {
    const errors = validateSaleForm(draft({
      items: [
        { ...saleItem, quantity: 6 },
        { ...saleItem, quantity: 5 },
      ],
    }));

    expect(errors.itemErrors[0].quantity).toBe("Quantidade acima do estoque disponivel.");
    expect(errors.itemErrors[1].quantity).toBe("Quantidade acima do estoque disponivel.");
    expect(hasSaleFormErrors(errors)).toBe(true);
  });

  it("blocks invalid discounts and mixed customer modes", () => {
    const errors = validateSaleForm(draft({
      customerId: "customer-1",
      quickCustomerName: "Cliente novo",
      items: [{ ...saleItem, unitSalePrice: 10, discountAmount: 30 }],
    }));

    expect(errors.customer).toBe("Selecione um cliente existente ou cadastre um novo, nao os dois.");
    expect(errors.itemErrors[0].discountAmount).toBe("Desconto deve ficar entre zero e o subtotal.");
  });

  it("derives payment status and remaining values from paid and refunded events", () => {
    expect(calculatePaymentSummary({ totalAmount: 100, payments: [] }).status).toBe("PENDING");
    expect(calculatePaymentSummary({ totalAmount: 100, payments: [{ amount: 40, status: "PAID" }] })).toMatchObject({
      status: "PARTIALLY_PAID",
      remainingAmount: 60,
      refundableAmount: 40,
    });
    expect(calculatePaymentSummary({ totalAmount: 100, payments: [{ amount: 100, status: "PAID" }] }).status).toBe("PAID");
    expect(calculatePaymentSummary({
      totalAmount: 100,
      payments: [
        { amount: 100, status: "PAID" },
        { amount: 100, status: "REFUNDED" },
      ],
    }).status).toBe("REFUNDED");
  });

  it("keeps operational actions sequential and independent from payment", () => {
    expect(getNextSaleAdvanceAction("RESERVED")).toEqual({ nextStatus: "SEPARATED", label: "Marcar como separado" });
    expect(getNextSaleAdvanceAction("SEPARATED")).toEqual({ nextStatus: "SHIPPED", label: "Marcar como enviado" });
    expect(getNextSaleAdvanceAction("SHIPPED")).toEqual({ nextStatus: "DELIVERED", label: "Marcar como entregue" });
    expect(getNextSaleAdvanceAction("DELIVERED")).toBeNull();
    expect(canCancelSale("SHIPPED")).toBe(true);
    expect(canCancelSale("DELIVERED")).toBe(false);
    expect(canReturnSale("DELIVERED")).toBe(true);
  });

  it("builds date ranges for sales filters", () => {
    const today = new Date("2026-09-09T12:00:00Z");

    expect(getSalesDateRange("today", today)).toEqual({ start: "2026-09-09", end: "2026-09-09" });
    expect(getSalesDateRange("30d", today)).toEqual({ start: "2026-08-11", end: "2026-09-09" });
    expect(getSalesDateRange("year", today)).toEqual({ start: "2026-01-01", end: "2026-09-09" });
  });
});
