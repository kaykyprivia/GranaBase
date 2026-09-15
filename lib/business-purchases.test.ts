import { describe, expect, it } from "vitest";
import {
  buildPurchaseMultiRpcItems,
  calculateMultiPurchasePreview,
  validateMultiPurchaseForm,
  canCancelPurchase,
  canEditPurchase,
  canReceivePurchase,
  getDateRange,
  getPurchaseReceiptState,
  getPurchaseStatusMeta,
  makeBusinessStableIdempotencyKey,
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
  it("allocates shared purchase costs proportionally across multiple items", () => {
    const preview = calculateMultiPurchasePreview({
      items: [
        {
          key: "item-a",
          mode: "existing",
          productId: "product-a",
          quantity: 2,
          productSubtotal: 100,
        },
        {
          key: "item-b",
          mode: "existing",
          productId: "product-b",
          quantity: 1,
          productSubtotal: 50,
        },
      ],
      shippingCost: 10,
      additionalCosts: 5,
      purchaseDate: "2026-09-13",
    });

    expect(preview).toMatchObject({
      itemCount: 2,
      totalQuantity: 3,
      productSubtotal: 150,
      shippingCost: 10,
      additionalCosts: 5,
      totalCost: 165,
    });

    expect(preview.items[0]).toMatchObject({
      key: "item-a",
      quantity: 2,
      productSubtotal: 100,
      unitPurchaseCost: 50,
      allocatedExtraCost: 10,
      realUnitCost: 55,
    });

    expect(preview.items[1]).toMatchObject({
      key: "item-b",
      quantity: 1,
      productSubtotal: 50,
      unitPurchaseCost: 50,
      allocatedExtraCost: 5,
      realUnitCost: 55,
    });
  });

  it("keeps cent allocation deterministic and assigns the rounding remainder to the last item", () => {
    const preview = calculateMultiPurchasePreview({
      items: [
        {
          key: "item-a",
          mode: "existing",
          productId: "product-a",
          quantity: 1,
          productSubtotal: 10,
        },
        {
          key: "item-b",
          mode: "existing",
          productId: "product-b",
          quantity: 1,
          productSubtotal: 10,
        },
        {
          key: "item-c",
          mode: "existing",
          productId: "product-c",
          quantity: 1,
          productSubtotal: 10,
        },
      ],
      shippingCost: 1,
      additionalCosts: 0,
      purchaseDate: "2026-09-13",
    });

    expect(
      preview.items.map((item) => item.allocatedExtraCost)
    ).toEqual([0.33, 0.33, 0.34]);

    expect(
      preview.items.reduce(
        (sum, item) => sum + item.allocatedExtraCost,
        0
      )
    ).toBeCloseTo(1, 2);

    expect(preview.totalCost).toBe(31);
  });

  it("builds the multi-purchase RPC payload for existing and inline products", () => {
    const draft = {
      items: [
        {
          key: "existing",
          mode: "existing" as const,
          productId: "product-1",
          quantity: 3,
          productSubtotal: 100,
        },
        {
          key: "new",
          mode: "new" as const,
          productName: "Produto novo",
          productSku: "NOVO-001",
          productCategoryId: "category-1",
          suggestedSalePrice: 79.9,
          minimumStock: 4,
          quantity: 2,
          productSubtotal: 50,
        },
      ],
      shippingCost: 0,
      additionalCosts: 0,
      purchaseDate: "2026-09-13",
    };

    const payload = buildPurchaseMultiRpcItems(draft);

    expect(payload).toHaveLength(2);

    expect(payload[0]).toMatchObject({
      product_id: "product-1",
      product_name: null,
      product_sku: null,
      default_sale_price: null,
      minimum_stock: null,
      quantity: 3,
    });

    expect(payload[0].unit_purchase_cost).toBeCloseTo(
      100 / 3,
      6
    );

    expect(payload[1]).toMatchObject({
      product_id: null,
      product_name: "Produto novo",
      product_sku: "NOVO-001",
      product_category_id: "category-1",
      product_category_name: null,
      default_sale_price: 79.9,
      minimum_stock: 4,
      quantity: 2,
      unit_purchase_cost: 25,
    });
  });

  it("builds inline product category by name when no category id is selected", () => {
    const payload = buildPurchaseMultiRpcItems({
      items: [
        {
          key: "new",
          mode: "new",
          productName: "Jogo de facas",
          productSku: "",
          productCategoryId: null,
          productCategoryName: "Cozinha",
          suggestedSalePrice: 120,
          minimumStock: 2,
          quantity: 1,
          productSubtotal: 45,
        },
      ],
      shippingCost: 0,
      additionalCosts: 0,
      purchaseDate: "2026-09-13",
    });

    expect(payload[0]).toMatchObject({
      product_id: null,
      product_name: "Jogo de facas",
      product_category_id: null,
      product_category_name: "Cozinha",
    });
  });
  it("blocks the same existing product from being added twice", () => {
    const errors = validateMultiPurchaseForm({
      items: [
        {
          key: "item-a",
          mode: "existing",
          productId: "product-1",
          quantity: 1,
          productSubtotal: 10,
        },
        {
          key: "item-b",
          mode: "existing",
          productId: "product-1",
          quantity: 2,
          productSubtotal: 20,
        },
      ],
      shippingCost: 0,
      additionalCosts: 0,
      purchaseDate: "2026-09-13",
    });

    expect(errors.itemErrors["item-b"]?.product).toBe(
      "Este produto já foi adicionado à compra."
    );
  });
});
