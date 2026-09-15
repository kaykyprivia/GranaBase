import { describe, expect, it } from "vitest";

import {
  buildBusinessReportsAnalytics,
  getBusinessReportsDateRange,
} from "./business-reports";

import type {
  BusinessExpense,
  BusinessPayment,
  BusinessProduct,
  BusinessSale,
  BusinessSaleItem,
  BusinessSaleReturn,
  BusinessSaleReturnItem,
} from "@/types/database";

const today = new Date(2026, 8, 11, 12, 0, 0);

function makeSale(
  overrides: Partial<BusinessSale> = {}
): BusinessSale {
  return {
    id: "sale-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    customer_id: null,
    order_status: "DELIVERED",
    payment_status: "PAID",
    sales_channel: "UNSPECIFIED",
    delivery_method: "UNSPECIFIED",
    delivery_fee: 0,
    delivery_cost: 0,
    sale_date: "2026-09-10T12:00:00.000Z",
    delivered_at: "2026-09-10T13:00:00.000Z",
    notes: null,
    created_at: "2026-09-10T12:00:00.000Z",
    updated_at: "2026-09-10T13:00:00.000Z",
    ...overrides,
    sale_number: overrides.sale_number ?? 1,
  };
}

function makeItem(
  overrides: Partial<BusinessSaleItem> = {}
): BusinessSaleItem {
  return {
    id: "item-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    sale_id: "sale-1",
    product_id: "product-1",
    quantity: 2,
    unit_sale_price: 100,
    gross_amount: 200,
    discount_amount: 0,
    final_amount: 200,
    platform_fee: 0,
    shipping_cost: 0,
    additional_costs: 0,
    cogs_amount: 100,
    gross_profit: 100,
    net_profit: 80,
    margin_pct: 40,
    created_at: "2026-09-10T12:00:00.000Z",
    updated_at: "2026-09-10T13:00:00.000Z",
    ...overrides,
  };
}

function makePayment(
  overrides: Partial<BusinessPayment> = {}
): BusinessPayment {
  return {
    id: "payment-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    sale_id: "sale-1",
    amount: 200,
    payment_method: "pix",
    status: "PAID",
    paid_at: "2026-09-10T14:00:00.000Z",
    notes: null,
    created_at: "2026-09-10T14:00:00.000Z",
    updated_at: "2026-09-10T14:00:00.000Z",
    ...overrides,
  };
}

function makeExpense(
  overrides: Partial<BusinessExpense> = {}
): BusinessExpense {
  return {
    id: "expense-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    description: "Gasolina",
    category: "gasolina",
    amount: 20,
    spent_at: "2026-09-10",
    notes: null,
    created_at: "2026-09-10T10:00:00.000Z",
    updated_at: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

function makeReturn(
  overrides: Partial<BusinessSaleReturn> = {}
): BusinessSaleReturn {
  return {
    id: "return-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    sale_id: "sale-1",
    refund_amount: 100,
    notes: null,
    created_at: "2026-09-11T10:00:00.000Z",
    ...overrides,
  };
}

function makeReturnItem(
  overrides: Partial<BusinessSaleReturnItem> = {}
): BusinessSaleReturnItem {
  return {
    id: "return-item-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    return_id: "return-1",
    sale_item_id: "item-1",
    product_id: "product-1",
    quantity: 1,
    restockable: true,
    created_at: "2026-09-11T10:00:00.000Z",
    ...overrides,
  };
}

function makeProduct(
  overrides: Partial<BusinessProduct> = {}
): BusinessProduct {
  return {
    id: "product-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    name: "Produto teste",
    sku: null,
    category_id: null,
    barcode: null,
    image_url: null,
    default_sale_price: 100,
    minimum_stock: 0,
    active: true,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("business reports", () => {
  it("calcula corretamente o intervalo de 3 meses", () => {
    expect(
      getBusinessReportsDateRange("3m", today)
    ).toEqual({
      start: "2026-07-01",
      end: "2026-09-11",
    });
  });

  it("ignora vendas canceladas no faturamento", () => {
    const analytics = buildBusinessReportsAnalytics(
      {
        sales: [
          makeSale(),
          makeSale({
            id: "sale-cancelled",
            order_status: "CANCELLED",
          }),
        ],
        saleItems: [
          makeItem(),
          makeItem({
            id: "item-cancelled",
            sale_id: "sale-cancelled",
            final_amount: 500,
            net_profit: 300,
          }),
        ],
        payments: [],
        returns: [],
        returnItems: [],
        expenses: [],
        products: [makeProduct()],
      },
      "month",
      today
    );

    expect(analytics.summary.revenue).toBe(200);
    expect(analytics.summary.salesCount).toBe(1);
  });

  it("ajusta devolucao, CMV recuperado e despesas", () => {
    const analytics = buildBusinessReportsAnalytics(
      {
        sales: [
          makeSale({
            order_status: "RETURNED",
          }),
        ],
        saleItems: [makeItem()],
        payments: [
          makePayment(),
          makePayment({
            id: "payment-refund",
            amount: 100,
            status: "REFUNDED",
            paid_at: "2026-09-11T10:00:00.000Z",
          }),
        ],
        returns: [makeReturn()],
        returnItems: [makeReturnItem()],
        expenses: [makeExpense()],
        products: [makeProduct()],
      },
      "month",
      today
    );

    expect(analytics.summary.revenue).toBe(100);
    expect(analytics.summary.saleProfit).toBe(30);
    expect(analytics.summary.expenses).toBe(20);
    expect(analytics.summary.result).toBe(10);
    expect(analytics.summary.margin).toBe(10);
    expect(analytics.summary.received).toBe(100);
    expect(analytics.summary.receivable).toBe(0);
  });

  it("calcula ticket medio apenas das vendas realizadas", () => {
    const analytics = buildBusinessReportsAnalytics(
      {
        sales: [
          makeSale(),
          makeSale({
            id: "sale-open",
            order_status: "RESERVED",
          }),
        ],
        saleItems: [
          makeItem(),
          makeItem({
            id: "item-open",
            sale_id: "sale-open",
            final_amount: 100,
          }),
        ],
        payments: [],
        returns: [],
        returnItems: [],
        expenses: [],
        products: [makeProduct()],
      },
      "month",
      today
    );

    expect(analytics.summary.salesCount).toBe(1);
    expect(analytics.summary.ticket).toBe(200);
  });

  it("monta ranking de produtos descontando itens devolvidos", () => {
    const analytics = buildBusinessReportsAnalytics(
      {
        sales: [
          makeSale({
            order_status: "RETURNED",
          }),
        ],
        saleItems: [makeItem()],
        payments: [],
        returns: [makeReturn()],
        returnItems: [makeReturnItem()],
        expenses: [],
        products: [makeProduct()],
      },
      "month",
      today
    );

    expect(analytics.topByRevenue[0]).toMatchObject({
      productId: "product-1",
      units: 1,
      revenue: 100,
      profit: 40,
    });
  });

  it("agrupa despesas por categoria", () => {
    const analytics = buildBusinessReportsAnalytics(
      {
        sales: [],
        saleItems: [],
        payments: [],
        returns: [],
        returnItems: [],
        expenses: [
          makeExpense({
            id: "expense-1",
            category: "gasolina",
            amount: 30,
          }),
          makeExpense({
            id: "expense-2",
            category: "gasolina",
            amount: 20,
          }),
          makeExpense({
            id: "expense-3",
            category: "taxas",
            amount: 10,
          }),
        ],
        products: [],
      },
      "month",
      today
    );

    expect(
      analytics.expensesByCategory[0]
    ).toMatchObject({
      category: "gasolina",
      value: 50,
    });
  });
});
