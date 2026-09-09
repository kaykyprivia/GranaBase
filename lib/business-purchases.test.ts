import { describe, expect, it } from "vitest";
import {
  calculatePurchasePreview,
  canCancelPurchase,
  canEditPurchase,
  canReceivePurchase,
  getDateRange,
  getPurchaseReceiptState,
  getPurchaseStatusMeta,
  makeBusinessStableIdempotencyKey,
  validatePurchaseForm,
  validateReceiveQuantity,
} from "@/lib/business-purchases";

describe("business purchase UI helpers", () => {
  it("maps purchase statuses to friendly labels", () => {
    expect(getPurchaseStatusMeta("PURCHASED")).toMatchObject({ label: "Comprado", tone: "default" });
    expect(getPurchaseStatusMeta("PARTIALLY_RECEIVED")).toMatchObject({
      label: "Recebido parcialmente",
      tone: "warning",
    });
    expect(getPurchaseStatusMeta("RECEIVED")).toMatchObject({ label: "Recebido", tone: "profit" });
    expect(getPurchaseStatusMeta("CANCELLED")).toMatchObject({ label: "Cancelado", tone: "expense" });
  });

  it("calculates the visual landed-cost preview without persisting it", () => {
    expect(
      calculatePurchasePreview({
        quantity: 10,
        productSubtotal: 100,
        shippingCost: 20,
        additionalCosts: 0,
      })
    ).toEqual({
      productSubtotal: 100,
      shippingCost: 20,
      additionalCosts: 0,
      totalCost: 120,
      unitPurchaseCost: 10,
      realUnitCost: 12,
    });
  });

  it("validates purchase forms for existing and inline products", () => {
    expect(
      validatePurchaseForm(
        {
          quantity: 10,
          productSubtotal: 100,
          purchaseDate: "2026-09-08",
        },
        "existing"
      )
    ).toHaveProperty("product");

    expect(
      validatePurchaseForm(
        {
          productName: "Suporte Celular",
          quantity: 10,
          productSubtotal: 100,
          shippingCost: 20,
          minimumStock: 0,
          purchaseDate: "2026-09-08",
        },
        "new"
      )
    ).toEqual({});
  });

  it("derives receipt progress and blocks invalid receives", () => {
    expect(getPurchaseReceiptState({ quantityOrdered: 10, quantityReceived: 6 })).toEqual({
      ordered: 10,
      received: 6,
      remaining: 4,
      progress: 60,
    });

    expect(validateReceiveQuantity({
      status: "PARTIALLY_RECEIVED",
      quantityOrdered: 10,
      quantityReceived: 6,
      incomingQuantity: 4,
    })).toBeNull();

    expect(validateReceiveQuantity({
      status: "PARTIALLY_RECEIVED",
      quantityOrdered: 10,
      quantityReceived: 6,
      incomingQuantity: 5,
    })).toBe("Quantidade maior que o saldo pendente.");

    expect(canReceivePurchase("DRAFT", 10, 0)).toBe(false);
    expect(canReceivePurchase("RECEIVED", 10, 10)).toBe(false);
  });

  it("only exposes cancellation before any receipt", () => {
    expect(canCancelPurchase("PURCHASED", 0)).toBe(true);
    expect(canCancelPurchase("PARTIALLY_RECEIVED", 1)).toBe(false);
    expect(canCancelPurchase("RECEIVED", 10)).toBe(false);
    expect(canCancelPurchase("CANCELLED", 0)).toBe(false);
  });

  it("only exposes editing before any receipt", () => {
    expect(canEditPurchase("PURCHASED", 0)).toBe(true);
    expect(canEditPurchase("IN_TRANSIT", 0)).toBe(true);
    expect(canEditPurchase("PARTIALLY_RECEIVED", 1)).toBe(false);
    expect(canEditPurchase("RECEIVED", 10)).toBe(false);
    expect(canEditPurchase("CANCELLED", 0)).toBe(false);
  });

  it("builds stable date ranges for purchase filters", () => {
    const today = new Date("2026-09-08T12:00:00.000Z");
    expect(getDateRange("month", today)).toEqual({ start: "2026-09-01", end: "2026-09-08" });
    expect(getDateRange("30d", today)).toEqual({ start: "2026-08-10", end: "2026-09-08" });
    expect(getDateRange("year", today)).toEqual({ start: "2026-01-01", end: "2026-09-08" });
    expect(getDateRange("custom", today, "2026-09-01", "2026-09-12")).toEqual({
      start: "2026-09-01",
      end: "2026-09-12",
    });
  });

  it("generates stable operation keys for the same retry payload", () => {
    const payload = ["session-1", "workspace-1", "product-1", 3, 100, 7.5];
    expect(makeBusinessStableIdempotencyKey("purchase-create", payload)).toBe(
      makeBusinessStableIdempotencyKey("purchase-create", payload)
    );
    expect(makeBusinessStableIdempotencyKey("purchase-create", payload)).not.toBe(
      makeBusinessStableIdempotencyKey("purchase-create", [...payload, "changed"])
    );
  });
});
