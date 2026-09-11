import type {
  BusinessExpense,
  BusinessExpenseCategory,
} from "@/types/database";

export const BUSINESS_EXPENSE_CATEGORIES = [
  "gasolina",
  "embalagem",
  "anuncios",
  "entrega",
  "manutencao",
  "taxas",
  "outras",
] as const satisfies readonly BusinessExpenseCategory[];

export const BUSINESS_EXPENSE_CATEGORY_META: Record<
  BusinessExpenseCategory,
  { label: string }
> = {
  gasolina: { label: "Gasolina" },
  embalagem: { label: "Embalagem" },
  anuncios: { label: "Anúncios" },
  entrega: { label: "Entrega" },
  manutencao: { label: "Manutenção" },
  taxas: { label: "Taxas" },
  outras: { label: "Outras" },
};

export type BusinessExpensePeriod =
  | "month"
  | "30d"
  | "year"
  | "all";

export const BUSINESS_EXPENSE_PERIOD_OPTIONS: Array<{
  value: BusinessExpensePeriod;
  label: string;
}> = [
  { value: "month", label: "Este mês" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "year", label: "Este ano" },
  { value: "all", label: "Todo o histórico" },
];

export type BusinessExpenseDraft = {
  description: string;
  category: BusinessExpenseCategory;
  amount: number;
  spentAt: string;
  notes: string;
};

export type BusinessExpenseErrors = Partial<
  Record<keyof BusinessExpenseDraft, string>
>;

export type BusinessExpenseSummary = {
  count: number;
  total: number;
  average: number;
  topCategory: BusinessExpenseCategory | null;
  topCategoryAmount: number;
};

export function validateBusinessExpenseDraft(
  input: BusinessExpenseDraft
): BusinessExpenseErrors {
  const errors: BusinessExpenseErrors = {};

  if (!input.description.trim()) {
    errors.description = "Informe a descrição da despesa.";
  }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.amount = "Informe um valor maior que zero.";
  }

  if (!input.spentAt) {
    errors.spentAt = "Informe a data da despesa.";
  }

  return errors;
}

export function hasBusinessExpenseErrors(
  errors: BusinessExpenseErrors
): boolean {
  return Object.values(errors).some(Boolean);
}

export function getBusinessExpenseDateRange(
  period: BusinessExpensePeriod,
  today = new Date()
): { start: string; end: string } | null {
  if (period === "all") {
    return null;
  }

  const end = toDateValue(today);

  if (period === "30d") {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 29);

    return {
      start: toDateValue(startDate),
      end,
    };
  }

  if (period === "year") {
    return {
      start: `${today.getFullYear()}-01-01`,
      end,
    };
  }

  return {
    start: `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, "0")}-01`,
    end,
  };
}

export function filterBusinessExpenses(
  expenses: BusinessExpense[],
  filters: {
    search: string;
    category: BusinessExpenseCategory | "all";
    period: BusinessExpensePeriod;
    today?: Date;
  }
): BusinessExpense[] {
  const normalizedSearch = filters.search
    .trim()
    .toLowerCase();

  const range = getBusinessExpenseDateRange(
    filters.period,
    filters.today
  );

  return expenses.filter((expense) => {
    const matchCategory =
      filters.category === "all" ||
      expense.category === filters.category;

    const matchDate =
      !range ||
      (expense.spent_at >= range.start &&
        expense.spent_at <= range.end);

    const searchable = [
      expense.description,
      expense.notes,
      BUSINESS_EXPENSE_CATEGORY_META[expense.category].label,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchSearch =
      !normalizedSearch ||
      searchable.includes(normalizedSearch);

    return matchCategory && matchDate && matchSearch;
  });
}

export function summarizeBusinessExpenses(
  expenses: BusinessExpense[]
): BusinessExpenseSummary {
  const totalsByCategory = new Map<
    BusinessExpenseCategory,
    number
  >();

  let total = 0;

  for (const expense of expenses) {
    const amount = Number(expense.amount) || 0;

    total += amount;

    totalsByCategory.set(
      expense.category,
      (totalsByCategory.get(expense.category) ?? 0) +
        amount
    );
  }

  let topCategory: BusinessExpenseCategory | null = null;
  let topCategoryAmount = 0;

  for (const category of BUSINESS_EXPENSE_CATEGORIES) {
    const amount = totalsByCategory.get(category) ?? 0;

    if (amount > topCategoryAmount) {
      topCategory = category;
      topCategoryAmount = amount;
    }
  }

  return {
    count: expenses.length,
    total,
    average:
      expenses.length > 0 ? total / expenses.length : 0,
    topCategory,
    topCategoryAmount,
  };
}

function toDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )}`;
}