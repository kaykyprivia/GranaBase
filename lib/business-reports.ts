import { BUSINESS_EXPENSE_CATEGORY_META } from "@/lib/business-expenses";
import { calculateSaleFinancials } from "@/lib/business-sales";

import type {
  BusinessExpense,
  BusinessPayment,
  BusinessProduct,
  BusinessSale,
  BusinessSaleItem,
  BusinessSaleReturn,
  BusinessSaleReturnItem,
  BusinessSaleOrderStatus,
} from "@/types/database";

export type BusinessReportsPeriod =
  | "month"
  | "3m"
  | "6m"
  | "12m"
  | "all";

export const BUSINESS_REPORT_PERIOD_OPTIONS: Array<{
  value: BusinessReportsPeriod;
  label: string;
}> = [
  { value: "month", label: "Este mês" },
  { value: "3m", label: "3 meses" },
  { value: "6m", label: "6 meses" },
  { value: "12m", label: "12 meses" },
  { value: "all", label: "Tudo" },
];

export type BusinessReportsDataset = {
  sales: BusinessSale[];
  saleItems: BusinessSaleItem[];
  payments: BusinessPayment[];
  returns: BusinessSaleReturn[];
  returnItems: BusinessSaleReturnItem[];
  expenses: BusinessExpense[];
  products: BusinessProduct[];
};

export type BusinessReportsSummary = {
  revenue: number;
  saleProfit: number;
  expenses: number;
  result: number;
  margin: number;
  salesCount: number;
  ticket: number;
  received: number;
  receivable: number;
};

export type BusinessReportsSeriesPoint = {
  key: string;
  label: string;
  revenue: number;
  profit: number;
  expenses: number;
  result: number;
};

export type BusinessExpenseCategoryRow = {
  category: string;
  label: string;
  value: number;
};

export type BusinessProductReportRow = {
  productId: string;
  name: string;
  units: number;
  revenue: number;
  profit: number;
};

export type BusinessReportsAnalytics = {
  summary: BusinessReportsSummary;
  series: BusinessReportsSeriesPoint[];
  expensesByCategory: BusinessExpenseCategoryRow[];
  topByRevenue: BusinessProductReportRow[];
  topByProfit: BusinessProductReportRow[];
};

type DateRange = {
  start: string;
  end: string;
};

const REALIZED_STATUSES = new Set<BusinessSaleOrderStatus>([
  "DELIVERED",
  "RETURNED",
]);

export function getBusinessReportsDateRange(
  period: BusinessReportsPeriod,
  today = new Date()
): DateRange | null {
  if (period === "all") {
    return null;
  }

  const end = toDateValue(today);

  if (period === "month") {
    return {
      start: `${today.getFullYear()}-${String(
        today.getMonth() + 1
      ).padStart(2, "0")}-01`,
      end,
    };
  }

  const months =
    period === "3m" ? 3 : period === "6m" ? 6 : 12;

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

export function buildBusinessReportsAnalytics(
  dataset: BusinessReportsDataset,
  period: BusinessReportsPeriod,
  today = new Date()
): BusinessReportsAnalytics {
  const range = getBusinessReportsDateRange(period, today);

  const salesById = new Map(
    dataset.sales.map((sale) => [sale.id, sale])
  );

  const itemsBySaleId = groupBy(
    dataset.saleItems,
    (item) => item.sale_id
  );

  const returnsBySaleId = groupBy(
    dataset.returns,
    (row) => row.sale_id
  );

  const returnItemsBySaleItemId = groupBy(
    dataset.returnItems,
    (row) => row.sale_item_id
  );

  const productsById = new Map(
    dataset.products.map((product) => [
      product.id,
      product,
    ])
  );

  const periodSales = dataset.sales.filter(
    (sale) =>
      sale.order_status !== "CANCELLED" &&
      isDateInRange(sale.sale_date, range)
  );

  const realizedSales = periodSales.filter((sale) =>
    REALIZED_STATUSES.has(sale.order_status)
  );

  const periodExpenses = dataset.expenses.filter((expense) =>
    isDateInRange(expense.spent_at, range)
  );

  let revenue = 0;
  let saleProfit = 0;

  for (const sale of realizedSales) {
    const financials = getSaleFinancials(
      sale.id,
      itemsBySaleId,
      returnsBySaleId,
      returnItemsBySaleItemId
    );

    revenue += financials.revenue;
    saleProfit += financials.profit;
  }

  const operatingExpenses = periodExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0
  );

  const result = saleProfit - operatingExpenses;

  const margin =
    revenue > 0 ? (result / revenue) * 100 : 0;

  const ticket =
    realizedSales.length > 0
      ? revenue / realizedSales.length
      : 0;

  const received = dataset.payments
    .filter(
      (payment) =>
        payment.paid_at &&
        isDateInRange(payment.paid_at, range)
    )
    .reduce((sum, payment) => {
      if (payment.status === "PAID") {
        return sum + Number(payment.amount || 0);
      }

      if (payment.status === "REFUNDED") {
        return sum - Number(payment.amount || 0);
      }

      return sum;
    }, 0);

  const periodSaleIds = new Set(
    periodSales.map((sale) => sale.id)
  );

  const salesNetValue = periodSales.reduce(
    (sum, sale) =>
      sum +
      getSaleFinancials(
        sale.id,
        itemsBySaleId,
        returnsBySaleId,
        returnItemsBySaleItemId
      ).revenue,
    0
  );

  const paidAgainstPeriodSales = dataset.payments
    .filter((payment) =>
      periodSaleIds.has(payment.sale_id)
    )
    .reduce((sum, payment) => {
      if (payment.status === "PAID") {
        return sum + Number(payment.amount || 0);
      }

      if (payment.status === "REFUNDED") {
        return sum - Number(payment.amount || 0);
      }

      return sum;
    }, 0);

  const receivable = Math.max(
    salesNetValue - paidAgainstPeriodSales,
    0
  );

  const summary: BusinessReportsSummary = {
    revenue: roundMoney(revenue),
    saleProfit: roundMoney(saleProfit),
    expenses: roundMoney(operatingExpenses),
    result: roundMoney(result),
    margin,
    salesCount: realizedSales.length,
    ticket: roundMoney(ticket),
    received: roundMoney(received),
    receivable: roundMoney(receivable),
  };

  const series = buildSeries({
    period,
    today,
    range,
    realizedSales,
    expenses: periodExpenses,
    itemsBySaleId,
    returnsBySaleId,
    returnItemsBySaleItemId,
  });

  const expensesByCategory =
    buildExpenseCategories(periodExpenses);

  const productRows = buildProductRows({
    realizedSales,
    itemsBySaleId,
    returnItemsBySaleItemId,
    productsById,
  });

  const topByRevenue = [...productRows]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const topByProfit = [...productRows]
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  void salesById;

  return {
    summary,
    series,
    expensesByCategory,
    topByRevenue,
    topByProfit,
  };
}

function getSaleFinancials(
  saleId: string,
  itemsBySaleId: Map<string, BusinessSaleItem[]>,
  returnsBySaleId: Map<string, BusinessSaleReturn[]>,
  returnItemsBySaleItemId: Map<
    string,
    BusinessSaleReturnItem[]
  >
) {
  const items = itemsBySaleId.get(saleId) ?? [];
  const saleReturns = returnsBySaleId.get(saleId) ?? [];

  const returnItems = items.flatMap(
    (item) =>
      returnItemsBySaleItemId.get(item.id) ?? []
  );

  const financials = calculateSaleFinancials({
    items,
    returns: saleReturns,
    returnItems,
  });

  return {
    revenue: financials.netRevenue,
    profit: financials.netProfit,
  };
}

function buildExpenseCategories(
  expenses: BusinessExpense[]
): BusinessExpenseCategoryRow[] {
  const totals = new Map<string, number>();

  for (const expense of expenses) {
    totals.set(
      expense.category,
      (totals.get(expense.category) ?? 0) +
        Number(expense.amount || 0)
    );
  }

  return [...totals.entries()]
    .map(([category, value]) => ({
      category,
      label:
        BUSINESS_EXPENSE_CATEGORY_META[
          category as BusinessExpense["category"]
        ]?.label ?? category,
      value: roundMoney(value),
    }))
    .sort((a, b) => b.value - a.value);
}

function buildProductRows(input: {
  realizedSales: BusinessSale[];
  itemsBySaleId: Map<string, BusinessSaleItem[]>;
  returnItemsBySaleItemId: Map<
    string,
    BusinessSaleReturnItem[]
  >;
  productsById: Map<string, BusinessProduct>;
}): BusinessProductReportRow[] {
  const rows = new Map<
    string,
    BusinessProductReportRow
  >();

  for (const sale of input.realizedSales) {
    const items =
      input.itemsBySaleId.get(sale.id) ?? [];

    for (const item of items) {
      if (item.quantity <= 0) continue;

      const returnedQuantity = Math.min(
        item.quantity,
        (
          input.returnItemsBySaleItemId.get(item.id) ??
          []
        ).reduce(
          (sum, row) =>
            sum + Number(row.quantity || 0),
          0
        )
      );

      const netQuantity = Math.max(
        item.quantity - returnedQuantity,
        0
      );

      if (netQuantity <= 0) continue;

      const ratio = netQuantity / item.quantity;

      const product =
        input.productsById.get(item.product_id);

      const current =
        rows.get(item.product_id) ?? {
          productId: item.product_id,
          name: product?.name ?? "Produto",
          units: 0,
          revenue: 0,
          profit: 0,
        };

      current.units += netQuantity;
      current.revenue +=
        Number(item.final_amount || 0) * ratio;
      current.profit +=
        Number(item.net_profit || 0) * ratio;

      rows.set(item.product_id, current);
    }
  }

  return [...rows.values()].map((row) => ({
    ...row,
    revenue: roundMoney(row.revenue),
    profit: roundMoney(row.profit),
  }));
}

function buildSeries(input: {
  period: BusinessReportsPeriod;
  today: Date;
  range: DateRange | null;
  realizedSales: BusinessSale[];
  expenses: BusinessExpense[];
  itemsBySaleId: Map<string, BusinessSaleItem[]>;
  returnsBySaleId: Map<string, BusinessSaleReturn[]>;
  returnItemsBySaleItemId: Map<
    string,
    BusinessSaleReturnItem[]
  >;
}): BusinessReportsSeriesPoint[] {
  const rows = new Map<
    string,
    BusinessReportsSeriesPoint
  >();

  if (input.period === "month" && input.range) {
    const cursor = parseDate(input.range.start);
    const end = parseDate(input.range.end);

    while (cursor <= end) {
      const key = toDateValue(cursor);

      rows.set(key, {
        key,
        label: `${String(cursor.getDate()).padStart(
          2,
          "0"
        )}/${String(cursor.getMonth() + 1).padStart(
          2,
          "0"
        )}`,
        revenue: 0,
        profit: 0,
        expenses: 0,
        result: 0,
      });

      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (input.range) {
    const cursor = parseDate(
      `${input.range.start.slice(0, 7)}-01`
    );

    const end = parseDate(
      `${input.range.end.slice(0, 7)}-01`
    );

    while (cursor <= end) {
      const key = toMonthValue(cursor);

      rows.set(key, {
        key,
        label: formatMonthLabel(key),
        revenue: 0,
        profit: 0,
        expenses: 0,
        result: 0,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  const getKey = (date: string) =>
    input.period === "month"
      ? date.slice(0, 10)
      : date.slice(0, 7);

  const ensureRow = (key: string) => {
    if (rows.has(key)) {
      return rows.get(key)!;
    }

    const row: BusinessReportsSeriesPoint = {
      key,
      label:
        input.period === "month"
          ? formatDayLabel(key)
          : formatMonthLabel(key),
      revenue: 0,
      profit: 0,
      expenses: 0,
      result: 0,
    };

    rows.set(key, row);

    return row;
  };

  for (const sale of input.realizedSales) {
    const key = getKey(sale.sale_date);
    const row = ensureRow(key);

    const financials = getSaleFinancials(
      sale.id,
      input.itemsBySaleId,
      input.returnsBySaleId,
      input.returnItemsBySaleItemId
    );

    row.revenue += financials.revenue;
    row.profit += financials.profit;
  }

  for (const expense of input.expenses) {
    const key = getKey(expense.spent_at);
    const row = ensureRow(key);

    row.expenses += Number(expense.amount || 0);
  }

  if (rows.size === 0) {
    const key =
      input.period === "month"
        ? toDateValue(input.today)
        : toMonthValue(input.today);

    ensureRow(key);
  }

  return [...rows.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((row) => ({
      ...row,
      revenue: roundMoney(row.revenue),
      profit: roundMoney(row.profit),
      expenses: roundMoney(row.expenses),
      result: roundMoney(
        row.profit - row.expenses
      ),
    }));
}

function groupBy<T>(
  rows: T[],
  getKey: (row: T) => string
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = getKey(row);
    const current = grouped.get(key) ?? [];

    current.push(row);
    grouped.set(key, current);
  }

  return grouped;
}

function isDateInRange(
  value: string,
  range: DateRange | null
) {
  if (!range) return true;

  const date = value.slice(0, 10);

  return date >= range.start && date <= range.end;
}

function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatDayLabel(value: string) {
  const [, month, day] = value.split("-");

  return `${day}/${month}`;
}

function formatMonthLabel(value: string) {
  const date = new Date(`${value}-15T12:00:00`);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
  })
    .format(date)
    .replace(".", "");
}

function toDateValue(date: Date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function toMonthValue(date: Date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}