import { describe, expect, it } from "vitest";
import {
  allocateFifoLots,
  assertSameBusinessScope,
  buildInventoryAdjustmentPlan,
  calculateInventoryQuantities,
  calculatePaymentSummary,
  calculatePurchaseReceipt,
  calculateRealUnitCost,
  calculateReturnAvailability,
  calculateSaleItemFinancials,
  canTransitionPurchaseStatus,
  canTransitionSaleStatus,
  getNextInventoryAfterCancellation,
  getNextInventoryAfterDelivery,
  summarizeCogs,
  validatePaymentEvent,
} from "@/lib/business";

describe("business core financial math", () => {
  it("uses total landed cost to calculate the real unit cost", () => {
    expect(
      calculateRealUnitCost({
        quantity: 10,
        productSubtotal: 100,
        shippingCost: 20,
        additionalCosts: 10,
      })
    ).toBe(13);
  });

  it("rejects invalid purchase cost inputs", () => {
    expect(() =>
      calculateRealUnitCost({
        quantity: 0,
        productSubtotal: 100,
      })
    ).toThrow("Quantidade");

    expect(() =>
      calculateRealUnitCost({
        quantity: 10,
        productSubtotal: 100,
        shippingCost: -1,
      })
    ).toThrow("Frete");
  });

  it("calculates gross profit, net profit and margin from delivered economics", () => {
    expect(
      calculateSaleItemFinancials({
        quantity: 1,
        unitSalePrice: 25,
        cogsAmount: 5,
        platformFee: 2,
        shippingCost: 3,
      })
    ).toEqual({
      grossAmount: 25,
      finalAmount: 25,
      cogsAmount: 5,
      grossProfit: 20,
      netProfit: 15,
      marginPct: 60,
    });
  });
});

describe("business core inventory accounting", () => {
  it("separates physical, reserved and available inventory", () => {
    expect(calculateInventoryQuantities({ onHand: 10, reserved: 3, inTransit: 20 })).toEqual({
      onHand: 10,
      reserved: 3,
      available: 7,
      inTransit: 20,
    });
  });

  it("does not mask reserved stock above physical stock", () => {
    expect(() => calculateInventoryQuantities({ onHand: 1, reserved: 2 })).toThrow(
      "Estoque reservado nao pode ser maior que o estoque fisico"
    );
  });

  it("allocates sales using FIFO and ignores quantities already reserved", () => {
    const allocations = allocateFifoLots(
      [
        {
          id: "lot-b",
          receivedAt: "2026-09-10T10:00:00.000Z",
          remainingQuantity: 5,
          unitCost: 15,
        },
        {
          id: "lot-a",
          receivedAt: "2026-09-08T10:00:00.000Z",
          remainingQuantity: 5,
          unitCost: 10,
        },
        {
          id: "lot-c",
          receivedAt: "2026-09-11T10:00:00.000Z",
          remainingQuantity: 4,
          reservedQuantity: 4,
          unitCost: 20,
        },
      ],
      7
    );

    expect(allocations).toEqual([
      { lotId: "lot-a", quantity: 5, unitCost: 10, totalCost: 50 },
      { lotId: "lot-b", quantity: 2, unitCost: 15, totalCost: 30 },
    ]);
    expect(summarizeCogs(allocations)).toBe(80);
  });

  it("blocks FIFO allocation when another transaction already reserved the last unit", () => {
    expect(() =>
      allocateFifoLots(
        [
          {
            id: "lot-last",
            receivedAt: "2026-09-08T10:00:00.000Z",
            remainingQuantity: 1,
            reservedQuantity: 1,
            unitCost: 10,
          },
        ],
        1
      )
    ).toThrow("Estoque insuficiente");
  });

  it("rejects invalid FIFO lots before calculating CMV", () => {
    expect(() =>
      allocateFifoLots(
        [
          {
            id: "lot-invalid",
            receivedAt: "invalid-date",
            remainingQuantity: 1,
            unitCost: 10,
          },
        ],
        1
      )
    ).toThrow("Data de recebimento");

    expect(() =>
      allocateFifoLots(
        [
          {
            id: "lot-a",
            receivedAt: "2026-09-08T10:00:00.000Z",
            remainingQuantity: 1,
            unitCost: 10,
          },
          {
            id: "lot-a",
            receivedAt: "2026-09-09T10:00:00.000Z",
            remainingQuantity: 1,
            unitCost: 10,
          },
        ],
        1
      )
    ).toThrow("Lote duplicado");
  });

  it("keeps physical stock during reservation and only lowers it on delivery", () => {
    const reserved = calculateInventoryQuantities({ onHand: 10, reserved: 2 });
    const delivered = getNextInventoryAfterDelivery({
      onHand: reserved.onHand,
      reserved: reserved.reserved,
      deliveredQuantity: 2,
    });

    expect(reserved).toEqual({ onHand: 10, reserved: 2, available: 8, inTransit: 0 });
    expect(delivered).toEqual({ onHand: 8, reserved: 0, available: 8, inTransit: 0 });
  });

  it("releases reserved stock on cancellation without touching physical stock", () => {
    expect(getNextInventoryAfterCancellation({ onHand: 10, reserved: 2, cancelledQuantity: 2 })).toEqual({
      onHand: 10,
      reserved: 0,
      available: 10,
      inTransit: 0,
    });
  });

  it("blocks delivery and cancellation above the reserved quantity", () => {
    expect(() => getNextInventoryAfterDelivery({ onHand: 2, reserved: 1, deliveredQuantity: 2 })).toThrow(
      "Entrega maior"
    );
    expect(() => getNextInventoryAfterCancellation({ onHand: 2, reserved: 1, cancelledQuantity: 2 })).toThrow(
      "Cancelamento maior"
    );
  });
});

describe("business core purchases and receipts", () => {
  it("derives partial and full purchase receipt status", () => {
    expect(
      calculatePurchaseReceipt({
        quantityOrdered: 10,
        quantityReceived: 0,
        incomingQuantity: 6,
      })
    ).toEqual({
      quantityReceived: 6,
      remainingQuantity: 4,
      status: "PARTIALLY_RECEIVED",
    });

    expect(
      calculatePurchaseReceipt({
        quantityOrdered: 10,
        quantityReceived: 6,
        incomingQuantity: 4,
      })
    ).toEqual({
      quantityReceived: 10,
      remainingQuantity: 0,
      status: "RECEIVED",
    });
  });

  it("blocks excessive or duplicated purchase receipts", () => {
    expect(() =>
      calculatePurchaseReceipt({
        quantityOrdered: 10,
        quantityReceived: 10,
        incomingQuantity: 1,
      })
    ).toThrow("Recebimento maior");
  });
});

describe("business core payments", () => {
  it("derives pending, partial and paid status from payment totals", () => {
    expect(calculatePaymentSummary({ saleTotal: 100 }).status).toBe("PENDING");
    expect(calculatePaymentSummary({ saleTotal: 100, paidAmount: 50 }).status).toBe("PARTIALLY_PAID");
    expect(calculatePaymentSummary({ saleTotal: 100, paidAmount: 100 }).status).toBe("PAID");
  });

  it("supports refunds without allowing refund or payment excess", () => {
    expect(
      validatePaymentEvent({
        saleTotal: 100,
        paidAmount: 50,
        amount: 50,
        type: "PAID",
      }).status
    ).toBe("PAID");

    expect(
      validatePaymentEvent({
        saleTotal: 100,
        paidAmount: 100,
        refundedAmount: 50,
        amount: 50,
        type: "REFUNDED",
      }).status
    ).toBe("REFUNDED");

    expect(() =>
      validatePaymentEvent({
        saleTotal: 100,
        paidAmount: 100,
        amount: 1,
        type: "PAID",
      })
    ).toThrow("Pagamento acumulado");

    expect(() =>
      validatePaymentEvent({
        saleTotal: 100,
        paidAmount: 20,
        amount: 30,
        type: "REFUNDED",
      })
    ).toThrow("Reembolso maior");
  });
});

describe("business core returns and adjustments", () => {
  it("tracks partial and total return availability", () => {
    expect(
      calculateReturnAvailability({
        soldQuantity: 7,
        alreadyReturnedQuantity: 2,
        requestedReturnQuantity: 3,
      })
    ).toBe(2);

    expect(() =>
      calculateReturnAvailability({
        soldQuantity: 7,
        alreadyReturnedQuantity: 6,
        requestedReturnQuantity: 2,
      })
    ).toThrow("Devolucao maior");
  });

  it("builds adjustment plans with explicit movement direction", () => {
    expect(
      buildInventoryAdjustmentPlan({
        quantityDelta: 5,
        movementType: "ADJUSTMENT_IN",
        availableQuantity: 0,
        unitCost: 12,
      })
    ).toEqual({
      movementType: "ADJUSTMENT_IN",
      quantityDelta: 5,
      unitCost: 12,
      totalCost: 60,
    });

    expect(() =>
      buildInventoryAdjustmentPlan({
        quantityDelta: -2,
        movementType: "ADJUSTMENT_IN",
        availableQuantity: 10,
      })
    ).toThrow("Ajuste negativo");

    expect(() =>
      buildInventoryAdjustmentPlan({
        quantityDelta: -11,
        movementType: "LOSS",
        availableQuantity: 10,
      })
    ).toThrow("estoque disponivel negativo");
  });
});

describe("business core security invariants", () => {
  it("rejects entities outside the current business scope", () => {
    expect(() =>
      assertSameBusinessScope(
        { userId: "user-1", workspaceId: "workspace-1" },
        [
          { id: "sale-1", userId: "user-1", workspaceId: "workspace-1" },
          { id: "lot-1", userId: "user-1", workspaceId: "workspace-2" },
        ]
      )
    ).toThrow("outro workspace");

    expect(() =>
      assertSameBusinessScope(
        { userId: "user-1", workspaceId: "workspace-1" },
        [{ id: "customer-1", userId: "user-2", workspaceId: "workspace-1" }]
      )
    ).toThrow("outro usuario");
  });
});

describe("business core state machines", () => {
  it("keeps purchase status transitions explicit", () => {
    expect(canTransitionPurchaseStatus("DRAFT", "PURCHASED")).toBe(true);
    expect(canTransitionPurchaseStatus("RECEIVED", "CANCELLED")).toBe(false);
  });

  it("keeps sale status transitions independent from payment status", () => {
    expect(canTransitionSaleStatus("DRAFT", "RESERVED")).toBe(true);
    expect(canTransitionSaleStatus("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransitionSaleStatus("DELIVERED", "RETURNED")).toBe(true);
  });
});
