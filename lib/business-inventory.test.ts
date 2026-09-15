import { describe, expect, it } from "vitest";
import {
  filterInventoryItems,
  getInventoryIntelligenceMeta,
  getInventoryStatusTags,
  getMovementMeta,
  getMovementSign,
  getPotentialProfit,
  getSignedAdjustmentQuantity,
  isDuplicateProductCategory,
  normalizeProductCategoryName,
  sortInventoryItems,
  summarizeInventory,
  validateInventoryAdjustment,
  validateProductMetadata,
  type InventoryIntelligenceItem,
  type InventoryItem,
} from "@/lib/business-inventory";

const baseItem: InventoryItem = {
  product_id: "product-0001",
  user_id: "user-1",
  workspace_id: "workspace-1",
  name: "Suporte Celular",
  sku: "SUP-001",
  category_id: null,
  category_name: null,
  barcode: null,
  image_url: null,
  default_sale_price: 25,
  minimum_stock: 5,
  on_hand: 10,
  reserved: 2,
  available: 8,
  in_transit: 4,
  inventory_value: 120,
  average_unit_cost: 12,
  estimated_profit: 130,
  active: true,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-02T10:00:00Z",
  last_movement_at: "2026-09-08T10:00:00Z",
  total_purchased: 14,
  total_received: 10,
  total_sold: 0,
};

function item(overrides: Partial<InventoryItem>): InventoryItem {
  return { ...baseItem, ...overrides };
}

function intelligenceItem(
  overrides: Partial<InventoryIntelligenceItem>
): InventoryIntelligenceItem {
  return {
    ...baseItem,
    gross_sold_window: 12,
    customer_returns_window: 0,
    net_outflow_window: 12,
    last_sale_at: "2026-09-12T10:00:00Z",
    observation_days: 30,
    average_daily_outflow: 0.4,
    coverage_days: 20,
    projected_coverage_days: 30,
    target_stock: 12,
    days_since_last_sale: 2,
    suggested_reorder_quantity: 4,
    intelligence_status: "attention",
    ...overrides,
  };
}

describe("business inventory summary", () => {
  it("summarizes stock, capital, low stock and in-transit units from inventory rows", () => {
    const summary = summarizeInventory([
      baseItem,
      item({ product_id: "product-2", on_hand: 0, available: 0, reserved: 0, in_transit: 6, inventory_value: 0, minimum_stock: 0 }),
      item({ product_id: "product-3", on_hand: 2, available: 2, reserved: 0, in_transit: 0, inventory_value: 30, minimum_stock: 3 }),
    ]);

    expect(summary).toEqual({
      inventoryValue: 150,
      productsInStock: 2,
      availableUnits: 10,
      lowStockProducts: 1,
      inTransitUnits: 10,
    });
  });

  it("does not flag low stock when minimum stock is not configured", () => {
    expect(getInventoryStatusTags(item({ available: 0, minimum_stock: 0 })).map((status) => status.label)).not.toContain("Estoque baixo");
  });

  it("supports combined status tags for reserved and in-transit products", () => {
    expect(getInventoryStatusTags(baseItem).map((status) => status.label)).toEqual(["Em estoque", "Reservado", "A caminho"]);
  });

  it("keeps products without stock searchable by history identifiers", () => {
    const empty = item({ product_id: "abc12345-9999", name: "Fone", sku: null, on_hand: 0, available: 0, reserved: 0, in_transit: 0 });

    expect(getInventoryStatusTags(empty).map((status) => status.label)).toContain("Sem estoque");
    expect(filterInventoryItems([empty], "empty", "abc12345")).toHaveLength(1);
  });

  it("filters by available, reserved, in-transit and low stock", () => {
    const reserved = item({ product_id: "reserved", reserved: 1, in_transit: 0 });
    const incoming = item({ product_id: "incoming", on_hand: 0, available: 0, reserved: 0, in_transit: 20, minimum_stock: 0 });
    const low = item({ product_id: "low", on_hand: 4, available: 4, reserved: 0, in_transit: 0, minimum_stock: 5 });

    expect(filterInventoryItems([reserved, incoming, low], "available", "")).toHaveLength(2);
    expect(filterInventoryItems([reserved, incoming, low], "reserved", "")).toEqual([reserved]);
    expect(filterInventoryItems([reserved, incoming, low], "in_transit", "")).toEqual([incoming]);
    expect(filterInventoryItems([reserved, incoming, low], "low", "")).toEqual([low]);
  });

  it("keeps uncategorized products valid and filters by category", () => {
    const electronics = item({
      product_id: "phone",
      name: "Celular",
      category_id: "category-electronics",
      category_name: "Eletronicos",
    });
    const home = item({
      product_id: "pan",
      name: "Panela",
      category_id: "category-home",
      category_name: "Casa",
    });
    const uncategorized = item({
      product_id: "misc",
      name: "Produto solto",
      category_id: null,
      category_name: null,
    });

    expect(filterInventoryItems([electronics, home, uncategorized], "all", "", "category-electronics")).toEqual([electronics]);
    expect(filterInventoryItems([electronics, home, uncategorized], "all", "", "uncategorized")).toEqual([uncategorized]);
    expect(filterInventoryItems([electronics], "all", "eletronicos")).toEqual([electronics]);
  });

  it("sorts by stock, capital, cost and recent movement", () => {
    const older = item({ product_id: "older", name: "A", available: 1, inventory_value: 10, average_unit_cost: 10, last_movement_at: "2026-09-01T10:00:00Z" });
    const newer = item({ product_id: "newer", name: "B", available: 8, inventory_value: 90, average_unit_cost: 20, last_movement_at: "2026-09-09T10:00:00Z" });

    expect(sortInventoryItems([older, newer], "stock_desc")[0]).toBe(newer);
    expect(sortInventoryItems([older, newer], "stock_asc")[0]).toBe(older);
    expect(sortInventoryItems([older, newer], "capital_desc")[0]).toBe(newer);
    expect(sortInventoryItems([older, newer], "cost_desc")[0]).toBe(newer);
    expect(sortInventoryItems([older, newer], "recent")[0]).toBe(newer);
  });

  it("calculates potential profit without treating it as realized profit", () => {
    expect(getPotentialProfit({ defaultSalePrice: 25, averageUnitCost: 10 })).toEqual({
      profitPerUnit: 15,
      marginPct: 60,
    });
    expect(getPotentialProfit({ defaultSalePrice: null, averageUnitCost: 10 })).toEqual({
      profitPerUnit: null,
      marginPct: null,
    });
  });
});

describe("business inventory intelligence", () => {
  const urgent = intelligenceItem({
    product_id: "urgent",
    name: "Urgente",
    coverage_days: 3,
    projected_coverage_days: 5,
    average_daily_outflow: 2,
    suggested_reorder_quantity: 10,
    intelligence_status: "reorder_now",
  });

  const steady = intelligenceItem({
    product_id: "steady",
    name: "Estável",
    coverage_days: 20,
    projected_coverage_days: 25,
    average_daily_outflow: 0.5,
    suggested_reorder_quantity: 2,
    intelligence_status: "attention",
  });

  const stagnant = intelligenceItem({
    product_id: "stagnant",
    name: "Sem Giro",
    coverage_days: null,
    projected_coverage_days: null,
    average_daily_outflow: 0,
    suggested_reorder_quantity: 0,
    intelligence_status: "no_recent_turnover",
  });

  it("filters products that need replenishment or have no recent turnover", () => {
    expect(
      filterInventoryItems([urgent, steady, stagnant], "reorder", "")
    ).toEqual([urgent, steady]);

    expect(
      filterInventoryItems(
        [urgent, steady, stagnant],
        "no_recent_turnover",
        ""
      )
    ).toEqual([stagnant]);
  });

  it("sorts intelligence by coverage, velocity and suggested replenishment", () => {
    const items = [steady, stagnant, urgent];

    expect(sortInventoryItems(items, "coverage_asc")).toEqual([
      urgent,
      steady,
      stagnant,
    ]);

    expect(sortInventoryItems(items, "velocity_desc")[0]).toBe(urgent);
    expect(sortInventoryItems(items, "reorder_desc")[0]).toBe(urgent);
  });

  it("maps actionable intelligence statuses to consistent labels and tones", () => {
    expect(getInventoryIntelligenceMeta("reorder_now")).toEqual({
      label: "Repor agora",
      tone: "expense",
    });

    expect(getInventoryIntelligenceMeta("no_recent_turnover")).toEqual({
      label: "Sem giro recente",
      tone: "secondary",
    });

    expect(getInventoryIntelligenceMeta("healthy")).toEqual({
      label: "Estoque saudável",
      tone: "profit",
    });
  });
});

describe("business inventory adjustments", () => {
  it("validates entry adjustments with positive quantity and required unit cost", () => {
    expect(validateInventoryAdjustment({
      productId: "product-1",
      direction: "in",
      movementType: "ADJUSTMENT_IN",
      quantity: 5,
      reason: "Contagem física",
      unitCost: 12,
      availableQuantity: 0,
    })).toEqual({});
    expect(getSignedAdjustmentQuantity({ direction: "in", quantity: 5 })).toBe(5);
  });

  it("blocks entry adjustments without cost", () => {
    expect(validateInventoryAdjustment({
      productId: "product-1",
      direction: "in",
      movementType: "ADJUSTMENT_IN",
      quantity: 5,
      reason: "Entrada extraordinária",
      unitCost: 0,
      availableQuantity: 0,
    }).unitCost).toBe("Informe o custo real unitário da entrada.");
  });

  it("validates output, loss and damaged adjustments", () => {
    for (const movementType of ["ADJUSTMENT_OUT", "LOSS", "DAMAGED"] as const) {
      expect(validateInventoryAdjustment({
        productId: "product-1",
        direction: "out",
        movementType,
        quantity: 2,
        reason: "Conferência",
        availableQuantity: 5,
      })).toEqual({});
    }
    expect(getSignedAdjustmentQuantity({ direction: "out", quantity: 2 })).toBe(-2);
  });

  it("blocks zero, missing reason and excessive output", () => {
    const errors = validateInventoryAdjustment({
      productId: "product-1",
      direction: "out",
      movementType: "DAMAGED",
      quantity: 0,
      reason: "",
      availableQuantity: 0,
    });

    expect(errors.quantity).toBe("Informe uma quantidade inteira maior que zero.");
    expect(errors.reason).toBe("Informe o motivo do ajuste.");
  });

  it("maps movement history labels and signs", () => {
    expect(getMovementMeta("PURCHASE_RECEIPT").label).toBe("Entrada por compra");
    expect(getMovementMeta("SALE_OUT").label).toBe("Saída por venda");
    expect(getMovementMeta("CUSTOMER_RETURN").label).toBe("Devolução de cliente");
    expect(getMovementMeta("DAMAGED").label).toBe("Avaria");
    expect(getMovementSign(10)).toBe("+");
    expect(getMovementSign(-2)).toBe("-");
  });

  it("validates product metadata without exposing derived inventory fields", () => {
    expect(validateProductMetadata({
      name: "Produto",
      sku: "SKU-1",
      defaultSalePrice: 30,
      minimumStock: 3,
      active: true,
    })).toEqual({});
    expect(validateProductMetadata({
      name: "",
      defaultSalePrice: -1,
      minimumStock: -1,
      active: true,
    })).toEqual({
      name: "Informe o nome do produto.",
      defaultSalePrice: "Preço de venda não pode ser negativo.",
      minimumStock: "Estoque mínimo deve ser inteiro e não negativo.",
    });
  });

  it("normalizes category names for duplicate checks in the same workspace", () => {
    expect(normalizeProductCategoryName("  Eletronicos   e Acessorios ")).toBe("eletronicos e acessorios");
    expect(
      isDuplicateProductCategory(
        [{ id: "category-1", name: "Eletronicos" }],
        "  ELETRONICOS "
      )
    ).toBe(true);
    expect(
      isDuplicateProductCategory(
        [{ id: "category-1", name: "Casa" }],
        "Cozinha"
      )
    ).toBe(false);
  });
});
