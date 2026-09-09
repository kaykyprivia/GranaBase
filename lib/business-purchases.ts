import type { BusinessPurchaseOrderStatus } from "@/types/database";
import { roundCurrency } from "@/lib/business";

export type PurchaseStatusTone = "default" | "profit" | "warning" | "expense" | "secondary";

export type PurchaseStatusMeta = {
  label: string;
  tone: PurchaseStatusTone;
  description: string;
};

export const PURCHASE_STATUS_META: Record<BusinessPurchaseOrderStatus, PurchaseStatusMeta> = {
  DRAFT: {
    label: "Rascunho",
    tone: "secondary",
    description: "Compra ainda em preparação.",
  },
  PURCHASED: {
    label: "Comprado",
    tone: "default",
    description: "Pedido registrado e aguardando chegada.",
  },
  IN_TRANSIT: {
    label: "Em transporte",
    tone: "warning",
    description: "Pedido a caminho.",
  },
  PARTIALLY_RECEIVED: {
    label: "Recebido parcialmente",
    tone: "warning",
    description: "Parte da compra já entrou no estoque.",
  },
  RECEIVED: {
    label: "Recebido",
    tone: "profit",
    description: "Compra recebida por completo.",
  },
  CANCELLED: {
    label: "Cancelado",
    tone: "expense",
    description: "Compra cancelada sem exclusão do histórico.",
  },
};

export type PurchaseFormDraft = {
  productId?: string;
  productName?: string;
  productSku?: string;
  suggestedSalePrice?: number;
  minimumStock?: number;
  quantity: number;
  productSubtotal: number;
  shippingCost?: number;
  additionalCosts?: number;
  purchaseDate: string;
  expectedArrivalDate?: string;
  origin?: string;
  notes?: string;
};

export type PurchaseFormErrors = Partial<Record<keyof PurchaseFormDraft | "product", string>>;

export type PurchasePreview = {
  productSubtotal: number;
  shippingCost: number;
  additionalCosts: number;
  totalCost: number;
  unitPurchaseCost: number;
  realUnitCost: number;
};

export type PurchaseReceiptState = {
  ordered: number;
  received: number;
  remaining: number;
  progress: number;
};

export type DateRangePreset = "month" | "30d" | "year" | "custom";

export function getPurchaseStatusMeta(status: BusinessPurchaseOrderStatus): PurchaseStatusMeta {
  return PURCHASE_STATUS_META[status];
}

export function calculatePurchasePreview(input: {
  quantity: number;
  productSubtotal: number;
  shippingCost?: number;
  additionalCosts?: number;
}): PurchasePreview {
  const quantity = Number.isFinite(input.quantity) ? input.quantity : 0;
  const productSubtotal = normalizeMoney(input.productSubtotal);
  const shippingCost = normalizeMoney(input.shippingCost ?? 0);
  const additionalCosts = normalizeMoney(input.additionalCosts ?? 0);
  const totalCost = roundCurrency(productSubtotal + shippingCost + additionalCosts);

  return {
    productSubtotal,
    shippingCost,
    additionalCosts,
    totalCost,
    unitPurchaseCost: quantity > 0 ? productSubtotal / quantity : 0,
    realUnitCost: quantity > 0 ? roundCurrency(totalCost / quantity) : 0,
  };
}

export function validatePurchaseForm(input: PurchaseFormDraft, mode: "existing" | "new"): PurchaseFormErrors {
  const errors: PurchaseFormErrors = {};

  if (mode === "existing" && !input.productId) {
    errors.product = "Selecione um produto.";
  }

  if (mode === "new" && !input.productName?.trim()) {
    errors.productName = "Informe o nome do produto.";
  }

  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    errors.quantity = "Informe uma quantidade inteira maior que zero.";
  }

  if (!Number.isFinite(input.productSubtotal) || input.productSubtotal <= 0) {
    errors.productSubtotal = "Informe o valor da mercadoria.";
  }

  if ((input.shippingCost ?? 0) < 0) {
    errors.shippingCost = "Frete não pode ser negativo.";
  }

  if ((input.additionalCosts ?? 0) < 0) {
    errors.additionalCosts = "Outros custos não podem ser negativos.";
  }

  if (!input.purchaseDate) {
    errors.purchaseDate = "Informe a data da compra.";
  }

  if ((input.suggestedSalePrice ?? 0) < 0) {
    errors.suggestedSalePrice = "Preço sugerido não pode ser negativo.";
  }

  if (!Number.isInteger(input.minimumStock ?? 0) || (input.minimumStock ?? 0) < 0) {
    errors.minimumStock = "Estoque mínimo deve ser inteiro e não negativo.";
  }

  return errors;
}

export function getPurchaseReceiptState(input: {
  quantityOrdered: number;
  quantityReceived: number;
}): PurchaseReceiptState {
  const ordered = Math.max(0, input.quantityOrdered);
  const received = Math.min(Math.max(0, input.quantityReceived), ordered);
  const remaining = Math.max(ordered - received, 0);

  return {
    ordered,
    received,
    remaining,
    progress: ordered > 0 ? Math.round((received / ordered) * 100) : 0,
  };
}

export function validateReceiveQuantity(input: {
  status: BusinessPurchaseOrderStatus;
  quantityOrdered: number;
  quantityReceived: number;
  incomingQuantity: number;
}): string | null {
  if (!canReceivePurchase(input.status, input.quantityOrdered, input.quantityReceived)) {
    return "Esta compra não permite novo recebimento.";
  }

  if (!Number.isInteger(input.incomingQuantity) || input.incomingQuantity <= 0) {
    return "Informe uma quantidade inteira maior que zero.";
  }

  const { remaining } = getPurchaseReceiptState(input);
  if (input.incomingQuantity > remaining) {
    return "Quantidade maior que o saldo pendente.";
  }

  return null;
}

export function canReceivePurchase(
  status: BusinessPurchaseOrderStatus,
  quantityOrdered: number,
  quantityReceived: number
): boolean {
  if (!["PURCHASED", "IN_TRANSIT", "PARTIALLY_RECEIVED"].includes(status)) {
    return false;
  }

  return getPurchaseReceiptState({ quantityOrdered, quantityReceived }).remaining > 0;
}

export function canCancelPurchase(status: BusinessPurchaseOrderStatus, quantityReceived: number): boolean {
  return status !== "CANCELLED" && status !== "RECEIVED" && quantityReceived === 0;
}

export function canEditPurchase(status: BusinessPurchaseOrderStatus, quantityReceived: number): boolean {
  return ["DRAFT", "PURCHASED", "IN_TRANSIT"].includes(status) && quantityReceived === 0;
}

export function getDateRange(
  preset: DateRangePreset,
  today = new Date(),
  customStart?: string,
  customEnd?: string
): { start: string; end: string } | null {
  if (preset === "custom") {
    return customStart && customEnd ? { start: customStart, end: customEnd } : null;
  }

  const end = toDateInputValue(today);
  if (preset === "30d") {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { start: toDateInputValue(start), end };
  }

  if (preset === "year") {
    return { start: `${today.getFullYear()}-01-01`, end };
  }

  return {
    start: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`,
    end,
  };
}

export function makeBusinessIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function makeBusinessStableIdempotencyKey(prefix: string, parts: unknown[]): string {
  return `${prefix}-${hashString(JSON.stringify(parts))}`;
}

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return value < 0 ? value : 0;
  }

  return roundCurrency(value);
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}
