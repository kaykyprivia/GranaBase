import type {
  BusinessInventorySummary,
  BusinessPaymentStatus,
  BusinessSaleItem,
  BusinessSaleOrderStatus,
  BusinessSalePaymentStatus,
  BusinessSalesChannel,
  BusinessSaleReturn,
  BusinessSaleReturnItem,
} from "@/types/database";
import { roundCurrency } from "@/lib/business";

export type SaleStatusTone = "default" | "profit" | "warning" | "expense" | "secondary";
export type SaleListFilter = "all" | "open" | BusinessSaleOrderStatus;
export type SalePaymentFilter = "all" | BusinessSalePaymentStatus;
export type SaleChannelFilter = "all" | BusinessSalesChannel;
export type SalesDateRangePreset = "today" | "month" | "30d" | "year" | "custom";

export type SaleStatusMeta = {
  label: string;
  tone: SaleStatusTone;
  description: string;
};

export type SalePaymentStatusMeta = SaleStatusMeta;

export type SaleFormItem = {
  productId: string;
  productName: string;
  available: number;
  averageUnitCost: number;
  quantity: number;
  unitSalePrice: number;
  discountAmount?: number;
  platformFee?: number;
  additionalCosts?: number;
};

export type SaleFormDraft = {
  customerId?: string;
  quickCustomerName?: string;
  quickCustomerWhatsapp?: string;
  saleDate: string;
  salesChannel: BusinessSalesChannel;
  deliveryFee: number;
  deliveryCost: number;
  notes?: string;
  items: SaleFormItem[];
};

export type SaleFormErrors = {
  customer?: string;
  saleDate?: string;
  deliveryFee?: string;
  deliveryCost?: string;
  items?: string;
  itemErrors: Array<Partial<Record<keyof SaleFormItem, string>>>;
};

export type SaleItemPreview = {
  productId: string;
  productName: string;
  quantity: number;
  grossAmount: number;
  discountAmount: number;
  finalAmount: number;
  platformFee: number;
  additionalCosts: number;
  estimatedCogs: number;
  estimatedGrossProfit: number;
  estimatedNetProfit: number;
  estimatedMarginPct: number | null;
  belowCost: boolean;
};

export type SalePreview = {
  subtotal: number;
  discountAmount: number;
  feesAmount: number;
  deliveryFee: number;
  deliveryCost: number;
  additionalCosts: number;
  totalAmount: number;
  estimatedCogs: number;
  estimatedGrossProfit: number;
  estimatedNetProfit: number;
  estimatedMarginPct: number | null;
  belowCost: boolean;
  items: SaleItemPreview[];
};

export type PaymentSummary = {
  totalAmount: number;
  paidAmount: number;
  refundedAmount: number;
  netPaidAmount: number;
  remainingAmount: number;
  refundableAmount: number;
  status: BusinessSalePaymentStatus;
};

export type SaleAdvanceAction = {
  nextStatus: Extract<BusinessSaleOrderStatus, "SEPARATED" | "SHIPPED" | "DELIVERED">;
  label: string;
};

export const SALE_STATUS_META: Record<BusinessSaleOrderStatus, SaleStatusMeta> = {
  DRAFT: {
    label: "Rascunho",
    tone: "secondary",
    description: "Venda criada sem reserva ativa.",
  },
  RESERVED: {
    label: "Reservada",
    tone: "default",
    description: "Estoque reservado aguardando separacao.",
  },
  SEPARATED: {
    label: "Separada",
    tone: "warning",
    description: "Pedido separado e pronto para envio ou retirada.",
  },
  SHIPPED: {
    label: "Enviada",
    tone: "warning",
    description: "Pedido enviado ou retirado e aguardando entrega.",
  },
  DELIVERED: {
    label: "Entregue",
    tone: "profit",
    description: "Estoque baixado e resultado oficial registrado.",
  },
  CANCELLED: {
    label: "Cancelada",
    tone: "expense",
    description: "Venda cancelada com reservas liberadas.",
  },
  RETURNED: {
    label: "Devolvida",
    tone: "expense",
    description: "Venda com devolucao total registrada.",
  },
};

export const PAYMENT_STATUS_META: Record<BusinessSalePaymentStatus, SalePaymentStatusMeta> = {
  PENDING: {
    label: "Pendente",
    tone: "warning",
    description: "Nenhum pagamento confirmado.",
  },
  PARTIALLY_PAID: {
    label: "Parcial",
    tone: "default",
    description: "Parte do total ja foi paga.",
  },
  PAID: {
    label: "Pago",
    tone: "profit",
    description: "Pagamento quitado.",
  },
  REFUNDED: {
    label: "Reembolsado",
    tone: "expense",
    description: "Pagamentos devolvidos ao cliente.",
  },
};

export const SALE_FILTER_OPTIONS: Array<{ value: SaleListFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "open", label: "Em andamento" },
  { value: "RESERVED", label: "Reservadas" },
  { value: "SEPARATED", label: "Separadas" },
  { value: "SHIPPED", label: "Enviadas" },
  { value: "DELIVERED", label: "Entregues" },
  { value: "CANCELLED", label: "Canceladas" },
  { value: "RETURNED", label: "Devolvidas" },
];

export const SALE_PAYMENT_FILTER_OPTIONS: Array<{ value: SalePaymentFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "PENDING", label: "Pendente" },
  { value: "PARTIALLY_PAID", label: "Parcial" },
  { value: "PAID", label: "Pago" },
  { value: "REFUNDED", label: "Reembolsado" },
];

export const SALE_CHANNEL_OPTIONS: Array<{ value: BusinessSalesChannel; label: string }> = [
  { value: "UNSPECIFIED", label: "Não informado" },
  { value: "IN_PERSON", label: "Presencial" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK_MARKETPLACE", label: "Facebook Marketplace" },
  { value: "SHOPEE", label: "Shopee" },
  { value: "MERCADO_LIVRE", label: "Mercado Livre" },
  { value: "WEBSITE", label: "Site próprio" },
  { value: "OTHER", label: "Outro" },
];

export function getSaleChannelLabel(channel: BusinessSalesChannel): string {
  return SALE_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? "Não informado";
}

export const SALE_PERIOD_OPTIONS: Array<{ value: SalesDateRangePreset; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "month", label: "Este mes" },
  { value: "30d", label: "Ultimos 30 dias" },
  { value: "year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

export function calculateSalePreview(items: SaleFormItem[], deliveryFee = 0, deliveryCost = 0): SalePreview {
  const itemPreviews = items.map(calculateSaleItemPreview);
  const normalizedDeliveryFee = normalizeMoney(deliveryFee);
  const normalizedDeliveryCost = normalizeMoney(deliveryCost);
  const subtotal = sumMoney(itemPreviews.map((item) => item.grossAmount));
  const discountAmount = sumMoney(itemPreviews.map((item) => item.discountAmount));
  const feesAmount = sumMoney(itemPreviews.map((item) => item.platformFee));
  const additionalCosts = sumMoney(itemPreviews.map((item) => item.additionalCosts));
  const productRevenue = sumMoney(itemPreviews.map((item) => item.finalAmount));
  const totalAmount = roundCurrency(productRevenue + normalizedDeliveryFee);
  const estimatedCogs = sumMoney(itemPreviews.map((item) => item.estimatedCogs));
  const estimatedGrossProfit = roundCurrency(totalAmount - estimatedCogs);
  const estimatedNetProfit = roundCurrency(estimatedGrossProfit - feesAmount - additionalCosts - normalizedDeliveryCost);

  return {
    subtotal,
    discountAmount,
    feesAmount,
    deliveryFee: normalizedDeliveryFee,
    deliveryCost: normalizedDeliveryCost,
    additionalCosts,
    totalAmount,
    estimatedCogs,
    estimatedGrossProfit,
    estimatedNetProfit,
    estimatedMarginPct: totalAmount > 0 ? roundCurrency((estimatedNetProfit / totalAmount) * 100) : null,
    belowCost: estimatedNetProfit < 0,
    items: itemPreviews,
  };
}

export function validateSaleForm(draft: SaleFormDraft): SaleFormErrors {
  const errors: SaleFormErrors = { itemErrors: [] };

  if (!draft.saleDate) {
    errors.saleDate = "Informe a data da venda.";
  }

  if (!Number.isFinite(draft.deliveryFee) || draft.deliveryFee < 0) {
    errors.deliveryFee = "Taxa de entrega não pode ser negativa.";
  }

  if (!Number.isFinite(draft.deliveryCost) || draft.deliveryCost < 0) {
    errors.deliveryCost = "Custo de entrega não pode ser negativo.";
  }

  if (draft.customerId && draft.quickCustomerName?.trim()) {
    errors.customer = "Selecione um cliente existente ou cadastre um novo, nao os dois.";
  }

  if (draft.items.length === 0) {
    errors.items = "Adicione ao menos um produto.";
  }

  const quantityByProduct = new Map<string, number>();

  draft.items.forEach((item, index) => {
    const itemErrors: Partial<Record<keyof SaleFormItem, string>> = {};
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);

    if (!item.productId) {
      itemErrors.productId = "Selecione um produto.";
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      itemErrors.quantity = "Use uma quantidade inteira maior que zero.";
    }
    if (!Number.isFinite(item.unitSalePrice) || item.unitSalePrice < 0) {
      itemErrors.unitSalePrice = "Informe um preco valido.";
    }

    const grossAmount = roundCurrency(Math.max(item.quantity, 0) * Math.max(item.unitSalePrice, 0));
    if ((item.discountAmount ?? 0) < 0 || (item.discountAmount ?? 0) > grossAmount) {
      itemErrors.discountAmount = "Desconto deve ficar entre zero e o subtotal.";
    }
    if ((item.platformFee ?? 0) < 0) {
      itemErrors.platformFee = "Taxa nao pode ser negativa.";
    }
    if ((item.additionalCosts ?? 0) < 0) {
      itemErrors.additionalCosts = "Outros custos nao podem ser negativos.";
    }

    errors.itemErrors[index] = itemErrors;
  });

  draft.items.forEach((item, index) => {
    const totalForProduct = quantityByProduct.get(item.productId) ?? item.quantity;
    if (item.productId && totalForProduct > item.available) {
      errors.itemErrors[index] = {
        ...errors.itemErrors[index],
        quantity: "Quantidade acima do estoque disponivel.",
      };
    }
  });

  return errors;
}

export function hasSaleFormErrors(errors: SaleFormErrors): boolean {
  return Boolean(
    errors.customer ||
    errors.saleDate ||
    errors.deliveryFee ||
    errors.deliveryCost ||
    errors.items ||
    errors.itemErrors.some((item) => Object.keys(item).length > 0)
  );
}

export type SaleFinancialSummary = {
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  baseProfit: number;
  recoveredCogs: number;
  netProfit: number;
};

type SaleFinancialItem = Pick<
  BusinessSaleItem,
  "id" | "quantity" | "final_amount" | "cogs_amount" | "net_profit"
>;

type SaleFinancialReturn = Pick<
  BusinessSaleReturn,
  "refund_amount"
>;

type SaleFinancialReturnItem = Pick<
  BusinessSaleReturnItem,
  "sale_item_id" | "quantity" | "restockable"
>;

export function calculateSaleFinancials(input: {
  items: SaleFinancialItem[];
  returns?: SaleFinancialReturn[];
  returnItems?: SaleFinancialReturnItem[];
  deliveryFee?: number;
  deliveryCost?: number;
}): SaleFinancialSummary {
  const returns = input.returns ?? [];
  const returnItems = input.returnItems ?? [];
  const deliveryFee = normalizeMoney(input.deliveryFee ?? 0);
  const deliveryCost = normalizeMoney(input.deliveryCost ?? 0);

  const productRevenue = sumMoney(
    input.items.map((item) => Number(item.final_amount || 0))
  );
  const grossRevenue = roundCurrency(productRevenue + deliveryFee);

  const productBaseProfit = sumMoney(
    input.items.map((item) => Number(item.net_profit || 0))
  );
  const baseProfit = roundCurrency(productBaseProfit + deliveryFee - deliveryCost);

  const refunds = sumMoney(
    returns.map((row) => Number(row.refund_amount || 0))
  );

  let recoveredCogs = 0;

  for (const item of input.items) {
    if (item.quantity <= 0) {
      continue;
    }

    const restockableQuantity = Math.min(
      item.quantity,
      returnItems
        .filter(
          (row) =>
            row.sale_item_id === item.id &&
            row.restockable
        )
        .reduce(
          (sum, row) =>
            sum + Number(row.quantity || 0),
          0
        )
    );

    const unitCogs =
      Number(item.cogs_amount || 0) /
      item.quantity;

    recoveredCogs +=
      unitCogs * restockableQuantity;
  }

  recoveredCogs = roundCurrency(recoveredCogs);

  return {
    grossRevenue,
    refunds,
    netRevenue: Math.max(
      roundCurrency(grossRevenue - refunds),
      0
    ),
    baseProfit,
    recoveredCogs,
    netProfit: roundCurrency(
      baseProfit - refunds + recoveredCogs
    ),
  };
}
export function calculatePaymentSummary(input: {
  totalAmount: number;
  payments: Array<{ amount: number; status: BusinessPaymentStatus }>;
}): PaymentSummary {
  const paidAmount = sumMoney(input.payments.filter((payment) => payment.status === "PAID").map((payment) => payment.amount));
  const refundedAmount = sumMoney(input.payments.filter((payment) => payment.status === "REFUNDED").map((payment) => payment.amount));
  const netPaidAmount = roundCurrency(paidAmount - refundedAmount);
  const remainingAmount = Math.max(roundCurrency(input.totalAmount - netPaidAmount), 0);
  const refundableAmount = Math.max(netPaidAmount, 0);

  let status: BusinessSalePaymentStatus = "PENDING";
  if (refundedAmount > 0 && netPaidAmount <= 0) {
    status = "REFUNDED";
  } else if (netPaidAmount <= 0) {
    status = "PENDING";
  } else if (netPaidAmount < input.totalAmount) {
    status = "PARTIALLY_PAID";
  } else {
    status = "PAID";
  }

  return {
    totalAmount: roundCurrency(input.totalAmount),
    paidAmount,
    refundedAmount,
    netPaidAmount,
    remainingAmount,
    refundableAmount,
    status,
  };
}

export function getSalesDateRange(
  preset: SalesDateRangePreset,
  today = new Date(),
  customStart?: string,
  customEnd?: string
): { start: string; end: string } | null {
  if (preset === "custom") {
    return customStart && customEnd ? { start: customStart, end: customEnd } : null;
  }

  const end = toDateInputValue(today);
  if (preset === "today") {
    return { start: end, end };
  }
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

export function canCancelSale(status: BusinessSaleOrderStatus): boolean {
  return ["DRAFT", "RESERVED", "SEPARATED", "SHIPPED"].includes(status);
}

export function canReturnSale(status: BusinessSaleOrderStatus): boolean {
  return status === "DELIVERED" || status === "RETURNED";
}

export function getNextSaleAdvanceAction(status: BusinessSaleOrderStatus): SaleAdvanceAction | null {
  if (status === "RESERVED") {
    return { nextStatus: "SEPARATED", label: "Marcar como separado" };
  }
  if (status === "SEPARATED") {
    return { nextStatus: "SHIPPED", label: "Marcar como enviado" };
  }
  if (status === "SHIPPED") {
    return { nextStatus: "DELIVERED", label: "Marcar como entregue" };
  }
  return null;
}

export function getSaleStatusMeta(status: BusinessSaleOrderStatus): SaleStatusMeta {
  return SALE_STATUS_META[status];
}

export function getSalePaymentStatusMeta(status: BusinessSalePaymentStatus): SalePaymentStatusMeta {
  return PAYMENT_STATUS_META[status];
}

export function mapInventoryToSaleItem(product: BusinessInventorySummary): SaleFormItem {
  return {
    productId: product.product_id,
    productName: product.name,
    available: product.available,
    averageUnitCost: product.average_unit_cost,
    quantity: 1,
    unitSalePrice: product.default_sale_price ?? 0,
    discountAmount: 0,
    platformFee: 0,
    additionalCosts: 0,
  };
}

export function getSaleErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("Estoque insuficiente")) {
    return "Este produto acabou de ficar sem estoque disponivel.";
  }
  if (message.includes("Pagamento acumulado") || message.includes("maior que o valor devido")) {
    return "O pagamento informado ultrapassa o saldo restante.";
  }
  if (message.includes("Reembolso maior")) {
    return "O reembolso informado ultrapassa o valor pago disponivel.";
  }
  if (message.includes("Venda precisa estar reservada")) {
    return "Esta venda precisa estar reservada para avancar.";
  }
  if (message.includes("Venda precisa estar separada")) {
    return "Esta venda precisa estar separada antes do envio.";
  }
  if (message.includes("entregue nao pode ser cancelada") || message.includes("Somente venda entregue")) {
    return "Esta venda ja foi entregue. Use o fluxo de devolucao.";
  }
  if (message.includes("Devolucao maior")) {
    return "A quantidade devolvida ultrapassa o saldo disponivel.";
  }

  return "Nao foi possivel concluir esta operacao agora.";
}

function calculateSaleItemPreview(item: SaleFormItem): SaleItemPreview {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitSalePrice = normalizeMoney(item.unitSalePrice);
  const discountAmount = normalizeMoney(item.discountAmount ?? 0);
  const platformFee = normalizeMoney(item.platformFee ?? 0);
  const additionalCosts = normalizeMoney(item.additionalCosts ?? 0);
  const grossAmount = roundCurrency(Math.max(quantity, 0) * unitSalePrice);
  const finalAmount = roundCurrency(Math.max(grossAmount - discountAmount, 0));
  const estimatedCogs = roundCurrency(Math.max(quantity, 0) * normalizeMoney(item.averageUnitCost));
  const estimatedGrossProfit = roundCurrency(finalAmount - estimatedCogs);
  const estimatedNetProfit = roundCurrency(estimatedGrossProfit - platformFee - additionalCosts);

  return {
    productId: item.productId,
    productName: item.productName,
    quantity,
    grossAmount,
    discountAmount,
    finalAmount,
    platformFee,
    additionalCosts,
    estimatedCogs,
    estimatedGrossProfit,
    estimatedNetProfit,
    estimatedMarginPct: finalAmount > 0 ? roundCurrency((estimatedNetProfit / finalAmount) * 100) : null,
    belowCost: estimatedNetProfit < 0,
  };
}

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return value < 0 ? value : 0;
  }

  return roundCurrency(value);
}

function sumMoney(values: number[]): number {
  return roundCurrency(values.reduce((sum, value) => sum + value, 0));
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
