import type { BusinessPurchaseOrderPaymentStatus, BusinessPurchaseOrderStatus, BusinessPurchasePaymentStatus } from "@/types/database";
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

export type PurchaseReceiptState = {
  ordered: number;
  received: number;
  remaining: number;
  progress: number;
};


export type PurchaseItemMode = "existing" | "new";

export type PurchaseItemDraft = {
  key: string;
  mode: PurchaseItemMode;
  productId?: string;
  productName?: string;
  productSku?: string;
  suggestedSalePrice?: number;
  minimumStock?: number;
  quantity: number;
  productSubtotal: number;
};

export type MultiPurchaseDraft = {
  items: PurchaseItemDraft[];
  shippingCost?: number;
  additionalCosts?: number;
  purchaseDate: string;
  expectedArrivalDate?: string;
  origin?: string;
  notes?: string;
};

export type PurchaseItemDraftErrors = {
  product?: string;
  productName?: string;
  productSku?: string;
  suggestedSalePrice?: string;
  minimumStock?: string;
  quantity?: string;
  productSubtotal?: string;
};

export type MultiPurchaseFormErrors = {
  items?: string;
  shippingCost?: string;
  additionalCosts?: string;
  purchaseDate?: string;
  expectedArrivalDate?: string;
  itemErrors: Record<string, PurchaseItemDraftErrors>;
};

export type MultiPurchaseItemPreview = {
  key: string;
  quantity: number;
  productSubtotal: number;
  unitPurchaseCost: number;
  allocatedExtraCost: number;
  realUnitCost: number;
};

export type MultiPurchasePreview = {
  itemCount: number;
  totalQuantity: number;
  productSubtotal: number;
  shippingCost: number;
  additionalCosts: number;
  totalCost: number;
  items: MultiPurchaseItemPreview[];
};

export function createPurchaseItemDraft(
  mode: PurchaseItemMode = "existing"
): PurchaseItemDraft {
  return {
    key:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    mode,
    productId: "",
    productName: "",
    productSku: "",
    suggestedSalePrice: 0,
    minimumStock: 0,
    quantity: 1,
    productSubtotal: 0,
  };
}

export function calculateMultiPurchasePreview(
  input: MultiPurchaseDraft
): MultiPurchasePreview {
  const shippingCost = normalizeMoney(input.shippingCost ?? 0);
  const additionalCosts = normalizeMoney(input.additionalCosts ?? 0);
  const extraTotal = roundCurrency(shippingCost + additionalCosts);

  const normalizedItems = input.items.map((item) => ({
    ...item,
    quantity:
      Number.isFinite(item.quantity) && item.quantity > 0
        ? item.quantity
        : 0,
    productSubtotal: normalizeMoney(item.productSubtotal),
  }));

  const productSubtotal = roundCurrency(
    normalizedItems.reduce(
      (sum, item) => sum + item.productSubtotal,
      0
    )
  );

  const totalQuantity = normalizedItems.reduce(
    (sum, item) => sum + item.quantity,
    0
  );

  let allocatedSoFar = 0;

  const items = normalizedItems.map((item, index) => {
    let allocatedExtraCost = 0;

    if (index === normalizedItems.length - 1) {
      allocatedExtraCost = roundCurrency(
        extraTotal - allocatedSoFar
      );
    } else if (extraTotal > 0 && productSubtotal > 0) {
      allocatedExtraCost = roundCurrency(
        (extraTotal * item.productSubtotal) /
          productSubtotal
      );
    } else if (extraTotal > 0 && totalQuantity > 0) {
      allocatedExtraCost = roundCurrency(
        (extraTotal * item.quantity) /
          totalQuantity
      );
    }

    allocatedSoFar = roundCurrency(
      allocatedSoFar + allocatedExtraCost
    );

    const unitPurchaseCost =
      item.quantity > 0
        ? item.productSubtotal / item.quantity
        : 0;

    const realUnitCost =
      item.quantity > 0
        ? roundCurrency(
            (item.productSubtotal +
              allocatedExtraCost) /
              item.quantity
          )
        : 0;

    return {
      key: item.key,
      quantity: item.quantity,
      productSubtotal: item.productSubtotal,
      unitPurchaseCost,
      allocatedExtraCost,
      realUnitCost,
    };
  });

  return {
    itemCount: normalizedItems.length,
    totalQuantity,
    productSubtotal,
    shippingCost,
    additionalCosts,
    totalCost: roundCurrency(
      productSubtotal + extraTotal
    ),
    items,
  };
}

export function validateMultiPurchaseForm(
  input: MultiPurchaseDraft
): MultiPurchaseFormErrors {
  const errors: MultiPurchaseFormErrors = {
    itemErrors: {},
  };

  if (!Array.isArray(input.items) || input.items.length === 0) {
    errors.items = "Adicione pelo menos um produto à compra.";
    return errors;
  }

  const existingProductIds = new Set<string>();
  const newSkus = new Set<string>();

  for (const item of input.items) {
    const itemErrors: PurchaseItemDraftErrors = {};

    if (item.mode === "existing") {
      if (!item.productId) {
        itemErrors.product = "Selecione um produto.";
      } else if (existingProductIds.has(item.productId)) {
        itemErrors.product =
          "Este produto já foi adicionado à compra.";
      } else {
        existingProductIds.add(item.productId);
      }
    } else {
      if (!item.productName?.trim()) {
        itemErrors.productName =
          "Informe o nome do produto.";
      }

      const sku = item.productSku?.trim().toLowerCase();
      if (sku) {
        if (newSkus.has(sku)) {
          itemErrors.productSku =
            "Este SKU já foi usado em outro item.";
        } else {
          newSkus.add(sku);
        }
      }

      if (
        (item.suggestedSalePrice ?? 0) < 0
      ) {
        itemErrors.suggestedSalePrice =
          "Preço sugerido não pode ser negativo.";
      }

      if (
        !Number.isInteger(item.minimumStock ?? 0) ||
        (item.minimumStock ?? 0) < 0
      ) {
        itemErrors.minimumStock =
          "Estoque mínimo deve ser inteiro e não negativo.";
      }
    }

    if (
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      itemErrors.quantity =
        "Informe uma quantidade inteira maior que zero.";
    }

    if (
      !Number.isFinite(item.productSubtotal) ||
      item.productSubtotal <= 0
    ) {
      itemErrors.productSubtotal =
        "Informe o valor da mercadoria.";
    }

    if (Object.keys(itemErrors).length > 0) {
      errors.itemErrors[item.key] = itemErrors;
    }
  }

  if ((input.shippingCost ?? 0) < 0) {
    errors.shippingCost =
      "Frete não pode ser negativo.";
  }

  if ((input.additionalCosts ?? 0) < 0) {
    errors.additionalCosts =
      "Outros custos não podem ser negativos.";
  }

  if (!input.purchaseDate) {
    errors.purchaseDate =
      "Informe a data da compra.";
  }

  if (
    input.expectedArrivalDate &&
    input.purchaseDate &&
    input.expectedArrivalDate < input.purchaseDate
  ) {
    errors.expectedArrivalDate =
      "A chegada não pode ser anterior à compra.";
  }

  return errors;
}

export function hasMultiPurchaseErrors(
  errors: MultiPurchaseFormErrors
): boolean {
  return Boolean(
    errors.items ||
      errors.shippingCost ||
      errors.additionalCosts ||
      errors.purchaseDate ||
      errors.expectedArrivalDate ||
      Object.keys(errors.itemErrors).length > 0
  );
}

export function buildPurchaseMultiRpcItems(
  draft: MultiPurchaseDraft
): Array<Record<string, string | number | null>> {
  const preview = calculateMultiPurchasePreview(draft);
  const previewByKey = new Map(
    preview.items.map((item) => [item.key, item])
  );

  return draft.items.map<Record<string, string | number | null>>((item) => {
    const itemPreview = previewByKey.get(item.key);

    if (!itemPreview) {
      throw new Error(
        "Não foi possível calcular o item da compra."
      );
    }

    if (item.mode === "existing") {
      return {
        product_id: item.productId ?? null,
        product_name: null,
        product_sku: null,
        default_sale_price: null,
        minimum_stock: null,
        quantity: item.quantity,
        unit_purchase_cost:
          itemPreview.unitPurchaseCost,
      };
    }

    return {
      product_id: null,
      product_name: item.productName?.trim() ?? "",
      product_sku: item.productSku?.trim() || null,
      default_sale_price:
        item.suggestedSalePrice || null,
      minimum_stock: item.minimumStock ?? 0,
      quantity: item.quantity,
      unit_purchase_cost:
        itemPreview.unitPurchaseCost,
    };
  });
}
export type DateRangePreset = "month" | "30d" | "year" | "custom";

export function getPurchaseStatusMeta(status: BusinessPurchaseOrderStatus): PurchaseStatusMeta {
  return PURCHASE_STATUS_META[status];
}

export type PurchasePaymentSummary = {
  totalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  netPaidAmount: number;
  remainingAmount: number;
  refundableAmount: number;
  status: BusinessPurchaseOrderPaymentStatus;
};

export function calculatePurchasePaymentSummary(input: {
  totalAmount: number;
  payments: Array<{ amount: number; status: BusinessPurchasePaymentStatus }>;
}): PurchasePaymentSummary {
  const totalAmount = roundCurrency(Math.max(0, input.totalAmount));
  const paidAmount = roundCurrency(
    input.payments
      .filter((payment) => payment.status === "PAID")
      .reduce((sum, payment) => sum + payment.amount, 0)
  );
  const refundedAmount = roundCurrency(
    input.payments
      .filter((payment) => payment.status === "REFUNDED")
      .reduce((sum, payment) => sum + payment.amount, 0)
  );
  const netPaidAmount = roundCurrency(paidAmount - refundedAmount);
  const remainingAmount = Math.max(roundCurrency(totalAmount - netPaidAmount), 0);
  const refundableAmount = Math.max(netPaidAmount, 0);

  let status: BusinessPurchaseOrderPaymentStatus = "PENDING";
  if (refundedAmount > 0 && netPaidAmount <= 0) {
    status = "REFUNDED";
  } else if (netPaidAmount <= 0) {
    status = "PENDING";
  } else if (netPaidAmount < totalAmount) {
    status = "PARTIALLY_PAID";
  } else {
    status = "PAID";
  }

  return {
    totalAmount,
    paidAmount,
    refundedAmount,
    netPaidAmount,
    remainingAmount,
    refundableAmount,
    status,
  };
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
