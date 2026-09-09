import type { BusinessInventoryMovementType, BusinessInventorySummary } from "@/types/database";
import { roundCurrency } from "@/lib/business";

export type InventoryFilter = "all" | "available" | "low" | "empty" | "reserved" | "in_transit";
export type InventorySort = "name" | "stock_desc" | "stock_asc" | "capital_desc" | "cost_desc" | "recent";
export type InventoryStatusTone = "default" | "profit" | "warning" | "expense" | "secondary";
export type InventoryItem = BusinessInventorySummary;

export type InventoryStatus = {
  key: "in_stock" | "low_stock" | "empty" | "reserved" | "in_transit" | "inactive";
  label: string;
  tone: InventoryStatusTone;
};

export type InventorySummaryTotals = {
  inventoryValue: number;
  productsInStock: number;
  availableUnits: number;
  lowStockProducts: number;
  inTransitUnits: number;
};

export type MovementMeta = {
  label: string;
  tone: InventoryStatusTone;
};

export type InventoryAdjustmentForm = {
  productId?: string;
  direction: "in" | "out";
  movementType: BusinessInventoryMovementType;
  quantity: number;
  reason: string;
  unitCost?: number;
  availableQuantity: number;
};

export type InventoryAdjustmentErrors = Partial<Record<"productId" | "movementType" | "quantity" | "reason" | "unitCost", string>>;

export type ProductMetadataForm = {
  name: string;
  sku?: string | null;
  defaultSalePrice?: number | null;
  minimumStock: number;
  active: boolean;
};

export type ProductMetadataErrors = Partial<Record<"name" | "defaultSalePrice" | "minimumStock", string>>;

export const INVENTORY_FILTER_OPTIONS: Array<{ value: InventoryFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "available", label: "Disponíveis" },
  { value: "low", label: "Estoque baixo" },
  { value: "empty", label: "Sem estoque" },
  { value: "reserved", label: "Reservados" },
  { value: "in_transit", label: "A caminho" },
];

export const INVENTORY_SORT_OPTIONS: Array<{ value: InventorySort; label: string }> = [
  { value: "name", label: "Nome" },
  { value: "stock_desc", label: "Maior estoque" },
  { value: "stock_asc", label: "Menor estoque" },
  { value: "capital_desc", label: "Maior capital" },
  { value: "cost_desc", label: "Maior custo" },
  { value: "recent", label: "Mais recentes" },
];

export const MOVEMENT_META: Record<BusinessInventoryMovementType, MovementMeta> = {
  PURCHASE_RECEIPT: { label: "Entrada por compra", tone: "profit" },
  SALE_OUT: { label: "Saída por venda", tone: "expense" },
  CUSTOMER_RETURN: { label: "Devolução de cliente", tone: "profit" },
  ADJUSTMENT_IN: { label: "Ajuste de entrada", tone: "profit" },
  ADJUSTMENT_OUT: { label: "Ajuste de saída", tone: "warning" },
  LOSS: { label: "Perda", tone: "expense" },
  DAMAGED: { label: "Avaria", tone: "expense" },
};

export function summarizeInventory(items: InventoryItem[]): InventorySummaryTotals {
  return items.reduce<InventorySummaryTotals>(
    (summary, item) => {
      summary.inventoryValue = roundCurrency(summary.inventoryValue + item.inventory_value);
      if (item.on_hand > 0) summary.productsInStock += 1;
      summary.availableUnits += item.available;
      summary.inTransitUnits += item.in_transit;
      if (isLowStock(item)) summary.lowStockProducts += 1;
      return summary;
    },
    {
      inventoryValue: 0,
      productsInStock: 0,
      availableUnits: 0,
      lowStockProducts: 0,
      inTransitUnits: 0,
    }
  );
}

export function getInventoryStatusTags(item: InventoryItem): InventoryStatus[] {
  const statuses: InventoryStatus[] = [];

  if (item.available > 0) {
    statuses.push({ key: "in_stock", label: "Em estoque", tone: "profit" });
  }
  if (isLowStock(item)) {
    statuses.push({ key: "low_stock", label: "Estoque baixo", tone: "warning" });
  }
  if (item.on_hand === 0 && item.in_transit === 0) {
    statuses.push({ key: "empty", label: "Sem estoque", tone: "secondary" });
  }
  if (item.reserved > 0) {
    statuses.push({ key: "reserved", label: "Reservado", tone: "default" });
  }
  if (item.in_transit > 0) {
    statuses.push({ key: "in_transit", label: "A caminho", tone: "warning" });
  }
  if (item.active === false) {
    statuses.push({ key: "inactive", label: "Inativo", tone: "secondary" });
  }

  return statuses.length > 0 ? statuses : [{ key: "empty", label: "Sem estoque", tone: "secondary" }];
}

export function isLowStock(item: Pick<InventoryItem, "available" | "minimum_stock">): boolean {
  return item.minimum_stock > 0 && item.available <= item.minimum_stock;
}

export function filterInventoryItems(items: InventoryItem[], filter: InventoryFilter, search: string): InventoryItem[] {
  const normalizedSearch = normalizeSearch(search);

  return items.filter((item) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "available" && item.available > 0) ||
      (filter === "low" && isLowStock(item)) ||
      (filter === "empty" && item.on_hand === 0 && item.in_transit === 0) ||
      (filter === "reserved" && item.reserved > 0) ||
      (filter === "in_transit" && item.in_transit > 0);

    if (!matchesFilter) return false;
    if (!normalizedSearch) return true;

    return normalizeSearch([item.name, item.sku, item.barcode, item.product_id.slice(0, 8)].filter(Boolean).join(" ")).includes(normalizedSearch);
  });
}

export function sortInventoryItems(items: InventoryItem[], sort: InventorySort): InventoryItem[] {
  return [...items].sort((first, second) => {
    if (sort === "stock_desc") return second.available - first.available || compareNames(first, second);
    if (sort === "stock_asc") return first.available - second.available || compareNames(first, second);
    if (sort === "capital_desc") return second.inventory_value - first.inventory_value || compareNames(first, second);
    if (sort === "cost_desc") return second.average_unit_cost - first.average_unit_cost || compareNames(first, second);
    if (sort === "recent") return getRecentTimestamp(second) - getRecentTimestamp(first) || compareNames(first, second);
    return compareNames(first, second);
  });
}

export function getPotentialProfit(input: { defaultSalePrice: number | null; averageUnitCost: number }) {
  if (input.defaultSalePrice === null || input.defaultSalePrice <= 0 || input.averageUnitCost <= 0) {
    return { profitPerUnit: null, marginPct: null };
  }

  const profitPerUnit = roundCurrency(input.defaultSalePrice - input.averageUnitCost);
  return {
    profitPerUnit,
    marginPct: roundCurrency((profitPerUnit / input.defaultSalePrice) * 100),
  };
}

export function getSignedAdjustmentQuantity(input: Pick<InventoryAdjustmentForm, "direction" | "quantity">): number {
  return input.direction === "in" ? input.quantity : -input.quantity;
}

export function validateInventoryAdjustment(input: InventoryAdjustmentForm): InventoryAdjustmentErrors {
  const errors: InventoryAdjustmentErrors = {};
  const quantityDelta = getSignedAdjustmentQuantity(input);

  if (!input.productId) {
    errors.productId = "Selecione um produto.";
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    errors.quantity = "Informe uma quantidade inteira maior que zero.";
  }
  if (!input.reason.trim()) {
    errors.reason = "Informe o motivo do ajuste.";
  }
  if (quantityDelta > 0 && input.movementType !== "ADJUSTMENT_IN") {
    errors.movementType = "Entrada manual precisa ser ajuste de entrada.";
  }
  if (quantityDelta < 0 && !["ADJUSTMENT_OUT", "LOSS", "DAMAGED"].includes(input.movementType)) {
    errors.movementType = "Saída precisa ser ajuste, perda ou avaria.";
  }
  if (quantityDelta > 0 && (!input.unitCost || input.unitCost <= 0)) {
    errors.unitCost = "Informe o custo real unitário da entrada.";
  }
  if ((input.unitCost ?? 0) < 0) {
    errors.unitCost = "Custo unitário não pode ser negativo.";
  }
  if (quantityDelta < 0 && input.quantity > input.availableQuantity) {
    errors.quantity = "Quantidade maior que o estoque disponível.";
  }

  return errors;
}

export function validateProductMetadata(input: ProductMetadataForm): ProductMetadataErrors {
  const errors: ProductMetadataErrors = {};

  if (!input.name.trim()) {
    errors.name = "Informe o nome do produto.";
  }
  if ((input.defaultSalePrice ?? 0) < 0) {
    errors.defaultSalePrice = "Preço de venda não pode ser negativo.";
  }
  if (!Number.isInteger(input.minimumStock) || input.minimumStock < 0) {
    errors.minimumStock = "Estoque mínimo deve ser inteiro e não negativo.";
  }

  return errors;
}

export function getMovementMeta(type: BusinessInventoryMovementType): MovementMeta {
  return MOVEMENT_META[type];
}

export function getMovementSign(quantityDelta: number): "+" | "-" {
  return quantityDelta >= 0 ? "+" : "-";
}

function compareNames(first: InventoryItem, second: InventoryItem): number {
  return first.name.localeCompare(second.name, "pt-BR");
}

function getRecentTimestamp(item: InventoryItem): number {
  const value = item.last_movement_at ?? item.updated_at ?? item.created_at;
  return value ? new Date(value).getTime() : 0;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
