export type BusinessCashFlowPeriod =
  | "today"
  | "7d"
  | "month"
  | "3m"
  | "6m"
  | "12m"
  | "all";

export const BUSINESS_CASH_FLOW_PERIOD_OPTIONS: Array<{
  value: BusinessCashFlowPeriod;
  label: string;
}> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "month", label: "Este mês" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
  { value: "all", label: "Tudo" },
];

export type BusinessCashFlowDirection =
  | "INFLOW"
  | "OUTFLOW";

export type BusinessCashFlowCategory =
  | "SALE_PAYMENT"
  | "SALE_REFUND"
  | "PURCHASE_PAYMENT"
  | "PURCHASE_REFUND"
  | "EXPENSE"
  | "PLATFORM_FEE"
  | "SALE_ADDITIONAL_COST"
  | "LEGACY_SHIPPING_COST"
  | "DELIVERY_COST";

export type BusinessCashFlowSummary = {
  opening_balance: number;
  inflows: number;
  outflows: number;
  net_cash_flow: number;
  closing_balance: number;
  event_count: number;
};

export type BusinessCashFlowDailyPoint = {
  date: string;
  inflows: number;
  outflows: number;
  net: number;
  balance: number;
};

export type BusinessCashFlowCategoryRow = {
  category: BusinessCashFlowCategory | string;
  direction: BusinessCashFlowDirection;
  amount: number;
  events: number;
};

export type BusinessCashFlowTransaction = {
  id: string;
  date: string;
  occurred_at: string;
  direction: BusinessCashFlowDirection;
  category: BusinessCashFlowCategory | string;
  amount: number;
  signed_amount: number;
  title: string;
  source_type: string;
  source_id: string;
  reference_id: string;
  payment_method: string | null;
};

export type BusinessCashFlowData = {
  period: {
    start_date: string | null;
    end_date: string | null;
  };
  summary: BusinessCashFlowSummary;
  daily: BusinessCashFlowDailyPoint[];
  categories: BusinessCashFlowCategoryRow[];
  transactions: BusinessCashFlowTransaction[];
};

export const EMPTY_BUSINESS_CASH_FLOW: BusinessCashFlowData = {
  period: {
    start_date: null,
    end_date: null,
  },
  summary: {
    opening_balance: 0,
    inflows: 0,
    outflows: 0,
    net_cash_flow: 0,
    closing_balance: 0,
    event_count: 0,
  },
  daily: [],
  categories: [],
  transactions: [],
};

export const BUSINESS_CASH_FLOW_CATEGORY_LABELS: Record<
  string,
  string
> = {
  SALE_PAYMENT: "Recebimentos de vendas",
  SALE_REFUND: "Reembolsos de vendas",
  PURCHASE_PAYMENT: "Pagamentos de compras",
  PURCHASE_REFUND: "Estornos de compras",
  EXPENSE: "Despesas operacionais",
  PLATFORM_FEE: "Taxas das vendas",
  SALE_ADDITIONAL_COST: "Custos adicionais das vendas",
  LEGACY_SHIPPING_COST: "Fretes legados",
  DELIVERY_COST: "Custos de entrega",
};

type DateRange = {
  start: string;
  end: string;
};

export function getBusinessCashFlowDateRange(
  period: BusinessCashFlowPeriod,
  today = new Date()
): DateRange | null {
  if (period === "all") {
    return null;
  }

  const end = toDateValue(today);

  if (period === "today") {
    return {
      start: end,
      end,
    };
  }

  if (period === "7d") {
    const startDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 6
    );

    return {
      start: toDateValue(startDate),
      end,
    };
  }

  if (period === "month") {
    return {
      start: `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-01`,
      end,
    };
  }

  const months =
    period === "3m"
      ? 3
      : period === "6m"
        ? 6
        : 12;

  const startDate = new Date(
    today.getFullYear(),
    today.getMonth() - (months - 1),
    1
  );

  return {
    start: toDateValue(startDate),
    end,
  };
}

export function getBusinessCashFlowCategoryLabel(
  category: string
): string {
  return (
    BUSINESS_CASH_FLOW_CATEGORY_LABELS[category] ??
    category
  );
}

function toDateValue(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
