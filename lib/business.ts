export type PurchaseOrderStatus =
  | "DRAFT"
  | "PURCHASED"
  | "IN_TRANSIT"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export type SaleOrderStatus =
  | "DRAFT"
  | "RESERVED"
  | "SEPARATED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "RETURNED";

export type SalePaymentStatus = "PENDING" | "PARTIALLY_PAID" | "PAID" | "REFUNDED";
export type SaleAllocationStatus = "RESERVED" | "RELEASED" | "CONSUMED" | "RETURNED";
export type InventoryMovementType =
  | "PURCHASE_RECEIPT"
  | "SALE_OUT"
  | "CUSTOMER_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "LOSS"
  | "DAMAGED";

export type BusinessScope = {
  userId: string;
  workspaceId: string;
};

export type ScopedEntity = Partial<BusinessScope> & {
  id: string;
};

export type InventoryLotForAllocation = Partial<BusinessScope> & {
  id: string;
  receivedAt: string;
  remainingQuantity: number;
  reservedQuantity?: number;
  unitCost: number;
};

export type FifoAllocation = {
  lotId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
};

export type SaleItemFinancialInput = {
  quantity: number;
  unitSalePrice: number;
  discountAmount?: number;
  platformFee?: number;
  shippingCost?: number;
  additionalCosts?: number;
  cogsAmount: number;
};

export type SaleItemFinancials = {
  grossAmount: number;
  finalAmount: number;
  cogsAmount: number;
  grossProfit: number;
  netProfit: number;
  marginPct: number | null;
};

export type InventoryQuantitiesInput = {
  onHand: number;
  reserved: number;
  inTransit?: number;
};

export type InventoryQuantities = {
  onHand: number;
  reserved: number;
  available: number;
  inTransit: number;
};

export type PurchaseReceiptInput = {
  quantityOrdered: number;
  quantityReceived: number;
  incomingQuantity: number;
};

export type PurchaseReceiptResult = {
  quantityReceived: number;
  remainingQuantity: number;
  status: Extract<PurchaseOrderStatus, "PARTIALLY_RECEIVED" | "RECEIVED">;
};

export type PaymentSummaryInput = {
  saleTotal: number;
  paidAmount?: number;
  refundedAmount?: number;
};

export type PaymentSummary = {
  saleTotal: number;
  paidAmount: number;
  refundedAmount: number;
  netPaidAmount: number;
  remainingAmount: number;
  refundableAmount: number;
  status: SalePaymentStatus;
};

export type InventoryAdjustmentPlan = {
  movementType: InventoryMovementType;
  quantityDelta: number;
  unitCost: number;
  totalCost: number;
};

const PURCHASE_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ["PURCHASED", "CANCELLED"],
  PURCHASED: ["IN_TRANSIT", "RECEIVED", "PARTIALLY_RECEIVED", "CANCELLED"],
  IN_TRANSIT: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED"],
  RECEIVED: [],
  CANCELLED: [],
};

const SALE_TRANSITIONS: Record<SaleOrderStatus, SaleOrderStatus[]> = {
  DRAFT: ["RESERVED", "CANCELLED"],
  RESERVED: ["SEPARATED", "SHIPPED", "DELIVERED", "CANCELLED"],
  SEPARATED: ["SHIPPED", "DELIVERED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateRealUnitCost(input: {
  quantity: number;
  productSubtotal: number;
  shippingCost?: number;
  additionalCosts?: number;
}): number {
  assertPositiveInteger(input.quantity, "Quantidade");
  assertNonNegativeFinite(input.productSubtotal, "Subtotal dos produtos");
  assertNonNegativeFinite(input.shippingCost ?? 0, "Frete");
  assertNonNegativeFinite(input.additionalCosts ?? 0, "Custos adicionais");

  const totalCost =
    input.productSubtotal +
    (input.shippingCost ?? 0) +
    (input.additionalCosts ?? 0);

  if (totalCost < 0) {
    throw new Error("Custo total nao pode ser negativo");
  }

  return roundCurrency(totalCost / input.quantity);
}

export function calculateInventoryQuantities(input: InventoryQuantitiesInput): InventoryQuantities {
  if (input.onHand < 0 || input.reserved < 0 || (input.inTransit ?? 0) < 0) {
    throw new Error("Quantidades de estoque nao podem ser negativas");
  }

  if (input.reserved > input.onHand) {
    throw new Error("Estoque reservado nao pode ser maior que o estoque fisico");
  }

  return {
    onHand: input.onHand,
    reserved: input.reserved,
    available: input.onHand - input.reserved,
    inTransit: input.inTransit ?? 0,
  };
}

export function allocateFifoLots(
  lots: InventoryLotForAllocation[],
  requestedQuantity: number
): FifoAllocation[] {
  assertPositiveInteger(requestedQuantity, "Quantidade solicitada");
  const seenLotIds = new Set<string>();

  for (const lot of lots) {
    if (seenLotIds.has(lot.id)) {
      throw new Error("Lote duplicado na alocacao FIFO");
    }
    seenLotIds.add(lot.id);

    if (!Number.isFinite(new Date(lot.receivedAt).getTime())) {
      throw new Error("Data de recebimento do lote invalida");
    }
    if (lot.remainingQuantity < 0 || (lot.reservedQuantity ?? 0) < 0) {
      throw new Error("Quantidade de lote nao pode ser negativa");
    }
    if ((lot.reservedQuantity ?? 0) > lot.remainingQuantity) {
      throw new Error("Reserva do lote nao pode ser maior que o saldo");
    }
    assertNonNegativeFinite(lot.unitCost, "Custo unitario do lote");
  }

  const allocations: FifoAllocation[] = [];
  let remaining = requestedQuantity;

  const sortedLots = [...lots].sort((first, second) => {
    const dateDelta = new Date(first.receivedAt).getTime() - new Date(second.receivedAt).getTime();
    return dateDelta === 0 ? first.id.localeCompare(second.id) : dateDelta;
  });

  for (const lot of sortedLots) {
    if (remaining <= 0) {
      break;
    }

    const available = lot.remainingQuantity - (lot.reservedQuantity ?? 0);

    if (available <= 0) {
      continue;
    }

    const quantity = Math.min(remaining, available);
    allocations.push({
      lotId: lot.id,
      quantity,
      unitCost: lot.unitCost,
      totalCost: roundCurrency(quantity * lot.unitCost),
    });
    remaining -= quantity;
  }

  if (remaining > 0) {
    throw new Error("Estoque insuficiente para atender a quantidade solicitada");
  }

  return allocations;
}

export function summarizeCogs(allocations: FifoAllocation[]): number {
  return roundCurrency(allocations.reduce((sum, allocation) => sum + allocation.totalCost, 0));
}

export function calculateSaleItemFinancials(input: SaleItemFinancialInput): SaleItemFinancials {
  assertPositiveInteger(input.quantity, "Quantidade");

  const grossAmount = roundCurrency(input.quantity * input.unitSalePrice);
  const discountAmount = input.discountAmount ?? 0;
  const platformFee = input.platformFee ?? 0;
  const shippingCost = input.shippingCost ?? 0;
  const additionalCosts = input.additionalCosts ?? 0;

  if ([input.unitSalePrice, discountAmount, platformFee, shippingCost, additionalCosts, input.cogsAmount].some((value) => value < 0)) {
    throw new Error("Valores financeiros nao podem ser negativos");
  }

  if (discountAmount > grossAmount) {
    throw new Error("Desconto nao pode ser maior que o valor bruto");
  }

  const finalAmount = roundCurrency(grossAmount - discountAmount);
  const cogsAmount = roundCurrency(input.cogsAmount);
  const grossProfit = roundCurrency(finalAmount - cogsAmount);
  const netProfit = roundCurrency(grossProfit - platformFee - shippingCost - additionalCosts);

  return {
    grossAmount,
    finalAmount,
    cogsAmount,
    grossProfit,
    netProfit,
    marginPct: finalAmount > 0 ? roundCurrency((netProfit / finalAmount) * 100) : null,
  };
}

export function calculatePurchaseReceipt(input: PurchaseReceiptInput): PurchaseReceiptResult {
  assertPositiveInteger(input.quantityOrdered, "Quantidade comprada");

  if (input.quantityReceived < 0 || input.quantityReceived > input.quantityOrdered) {
    throw new Error("Quantidade ja recebida invalida");
  }
  assertPositiveInteger(input.incomingQuantity, "Quantidade recebida");

  const nextReceived = input.quantityReceived + input.incomingQuantity;
  if (nextReceived > input.quantityOrdered) {
    throw new Error("Recebimento maior que a quantidade pendente");
  }

  const remainingQuantity = input.quantityOrdered - nextReceived;
  return {
    quantityReceived: nextReceived,
    remainingQuantity,
    status: remainingQuantity === 0 ? "RECEIVED" : "PARTIALLY_RECEIVED",
  };
}

export function calculatePaymentSummary(input: PaymentSummaryInput): PaymentSummary {
  assertNonNegativeFinite(input.saleTotal, "Total da venda");
  assertNonNegativeFinite(input.paidAmount ?? 0, "Valor pago");
  assertNonNegativeFinite(input.refundedAmount ?? 0, "Valor reembolsado");

  const paidAmount = roundCurrency(input.paidAmount ?? 0);
  const refundedAmount = roundCurrency(input.refundedAmount ?? 0);

  if (refundedAmount > paidAmount) {
    throw new Error("Reembolso nao pode ser maior que o total pago");
  }

  const netPaidAmount = roundCurrency(paidAmount - refundedAmount);
  const remainingAmount = roundCurrency(Math.max(input.saleTotal - netPaidAmount, 0));
  const refundableAmount = netPaidAmount;

  let status: SalePaymentStatus = "PENDING";
  if (refundedAmount > 0 && netPaidAmount === 0) {
    status = "REFUNDED";
  } else if (netPaidAmount >= input.saleTotal && input.saleTotal > 0) {
    status = "PAID";
  } else if (netPaidAmount > 0) {
    status = "PARTIALLY_PAID";
  }

  return {
    saleTotal: roundCurrency(input.saleTotal),
    paidAmount,
    refundedAmount,
    netPaidAmount,
    remainingAmount,
    refundableAmount,
    status,
  };
}

export function validatePaymentEvent(input: PaymentSummaryInput & {
  amount: number;
  type: Extract<SalePaymentStatus, "PAID" | "REFUNDED">;
}): PaymentSummary {
  assertNonNegativeFinite(input.amount, "Valor do pagamento");
  if (input.amount <= 0) {
    throw new Error("Valor do pagamento deve ser positivo");
  }

  const summary = calculatePaymentSummary(input);

  if (input.type === "PAID" && roundCurrency(summary.netPaidAmount + input.amount) > summary.saleTotal) {
    throw new Error("Pagamento acumulado maior que o valor devido");
  }

  if (input.type === "REFUNDED" && input.amount > summary.refundableAmount) {
    throw new Error("Reembolso maior que o valor disponivel");
  }

  return calculatePaymentSummary({
    saleTotal: input.saleTotal,
    paidAmount: input.type === "PAID" ? (input.paidAmount ?? 0) + input.amount : input.paidAmount,
    refundedAmount: input.type === "REFUNDED" ? (input.refundedAmount ?? 0) + input.amount : input.refundedAmount,
  });
}

export function calculateReturnAvailability(input: {
  soldQuantity: number;
  alreadyReturnedQuantity?: number;
  requestedReturnQuantity: number;
}): number {
  assertPositiveInteger(input.soldQuantity, "Quantidade vendida");
  assertPositiveInteger(input.requestedReturnQuantity, "Quantidade devolvida");

  const alreadyReturnedQuantity = input.alreadyReturnedQuantity ?? 0;
  if (alreadyReturnedQuantity < 0 || alreadyReturnedQuantity > input.soldQuantity) {
    throw new Error("Quantidade ja devolvida invalida");
  }

  const availableToReturn = input.soldQuantity - alreadyReturnedQuantity;
  if (input.requestedReturnQuantity > availableToReturn) {
    throw new Error("Devolucao maior que a quantidade disponivel");
  }

  return availableToReturn - input.requestedReturnQuantity;
}

export function buildInventoryAdjustmentPlan(input: {
  quantityDelta: number;
  movementType: InventoryMovementType;
  availableQuantity: number;
  unitCost?: number;
}): InventoryAdjustmentPlan {
  if (!Number.isInteger(input.quantityDelta) || input.quantityDelta === 0) {
    throw new Error("Ajuste precisa ter quantidade inteira diferente de zero");
  }
  if (input.availableQuantity < 0) {
    throw new Error("Estoque disponivel nao pode ser negativo");
  }

  const unitCost = input.unitCost ?? 0;
  assertNonNegativeFinite(unitCost, "Custo unitario");

  if (input.quantityDelta > 0 && input.movementType !== "ADJUSTMENT_IN") {
    throw new Error("Ajuste positivo precisa ser ADJUSTMENT_IN");
  }

  if (input.quantityDelta < 0 && !["ADJUSTMENT_OUT", "LOSS", "DAMAGED"].includes(input.movementType)) {
    throw new Error("Ajuste negativo precisa ser ADJUSTMENT_OUT, LOSS ou DAMAGED");
  }

  if (input.quantityDelta < 0 && Math.abs(input.quantityDelta) > input.availableQuantity) {
    throw new Error("Ajuste deixaria estoque disponivel negativo");
  }

  return {
    movementType: input.movementType,
    quantityDelta: input.quantityDelta,
    unitCost,
    totalCost: roundCurrency(Math.abs(input.quantityDelta) * unitCost),
  };
}

export function assertSameBusinessScope(scope: BusinessScope, entities: ScopedEntity[]): void {
  for (const entity of entities) {
    if (entity.userId !== undefined && entity.userId !== scope.userId) {
      throw new Error("Entidade pertence a outro usuario");
    }
    if (entity.workspaceId !== undefined && entity.workspaceId !== scope.workspaceId) {
      throw new Error("Entidade pertence a outro workspace");
    }
  }
}

export function canTransitionPurchaseStatus(from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean {
  return PURCHASE_TRANSITIONS[from].includes(to);
}

export function canTransitionSaleStatus(from: SaleOrderStatus, to: SaleOrderStatus): boolean {
  return SALE_TRANSITIONS[from].includes(to);
}

export function getNextInventoryAfterDelivery(input: {
  onHand: number;
  reserved: number;
  deliveredQuantity: number;
}): InventoryQuantities {
  assertPositiveInteger(input.deliveredQuantity, "Quantidade entregue");

  if (input.deliveredQuantity > input.onHand || input.deliveredQuantity > input.reserved) {
    throw new Error("Entrega maior que o estoque fisico ou reservado");
  }

  return calculateInventoryQuantities({
    onHand: input.onHand - input.deliveredQuantity,
    reserved: input.reserved - input.deliveredQuantity,
  });
}

export function getNextInventoryAfterCancellation(input: {
  onHand: number;
  reserved: number;
  cancelledQuantity: number;
}): InventoryQuantities {
  assertPositiveInteger(input.cancelledQuantity, "Quantidade cancelada");

  if (input.cancelledQuantity > input.reserved) {
    throw new Error("Cancelamento maior que o estoque reservado");
  }

  return calculateInventoryQuantities({
    onHand: input.onHand,
    reserved: input.reserved - input.cancelledQuantity,
  });
}

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} deve ser um inteiro positivo`);
  }
}

function assertNonNegativeFinite(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} deve ser um numero finito maior ou igual a zero`);
  }
}
