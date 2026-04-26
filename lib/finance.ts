import type { Bill, ExpenseEntry, FinancialGoal, IncomeEntry, InstallmentPayment, Investment } from "@/types/database";
import { formatCurrency, getMonthYear, isOverdue } from "@/lib/utils";

export const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export const INCOME_CATEGORIES = ["Bico", "Freela", "Venda", "Comissao", "Pix", "Reembolso", "Outro"];
export const EXPENSE_CATEGORIES = ["Alimentacao", "Mercado", "Transporte", "Moradia", "Internet", "Lazer", "Assinatura", "Emergencia", "Outro"];
export const BILL_CATEGORIES = ["Aluguel", "Energia", "Agua", "Internet", "Telefone", "Cartao", "Emprestimo", "Seguro", "Mensalidade", "Outro"];
export const INVESTMENT_TYPES = ["Reserva", "Tesouro", "CDB", "FII", "ETF", "Acao", "Crypto", "Outro"];
export const GOAL_CATEGORIES = ["Reserva", "Quitar divida", "Viagem", "Casa", "Carro", "Estudos", "Investimento", "Outro"];
export const PAYMENT_METHODS = ["Dinheiro", "Pix", "Cartao Debito", "Cartao Credito", "Transferencia", "Outro"];

export type FinancialEventType =
  | "income"
  | "expense"
  | "bill"
  | "installment"
  | "investment"
  | "goal";

export interface FinancialEvent {
  id: string;
  date: string;
  title: string;
  amount: number;
  type: FinancialEventType;
  subtitle?: string;
  status?: string;
}

export function getMonthOptions(monthsBack = 12) {
  const options = [{ value: "all", label: "Todos os meses" }];
  const now = new Date();

  for (let index = 0; index < monthsBack; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: `${MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}` });
  }

  return options;
}

export function getEffectiveBillStatus(bill: Pick<Bill, "status" | "due_date">) {
  if (bill.status === "pending" && isOverdue(bill.due_date)) {
    return "overdue" as const;
  }

  return bill.status;
}

export function getEffectiveInstallmentStatus(payment: Pick<InstallmentPayment, "status" | "due_date">) {
  if (payment.status === "pending" && isOverdue(payment.due_date)) {
    return "overdue" as const;
  }

  return payment.status;
}

export function buildMonthSeries(
  income: Pick<IncomeEntry, "amount" | "received_at">[],
  expenses: Pick<ExpenseEntry, "amount" | "spent_at">[],
  months = 6
) {
  const now = new Date();

  return Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - index - 1), 1);
    const key = getMonthYear(date);

    return {
      month: MONTH_LABELS[date.getMonth()],
      income: income.filter((entry) => entry.received_at.startsWith(key)).reduce((sum, entry) => sum + entry.amount, 0),
      expenses: expenses.filter((entry) => entry.spent_at.startsWith(key)).reduce((sum, entry) => sum + entry.amount, 0),
    };
  });
}

export function buildFinancialEvents({
  income,
  expenses,
  bills,
  installmentPayments,
  investments,
  goals,
}: {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  bills: Bill[];
  installmentPayments: InstallmentPayment[];
  investments: Investment[];
  goals: FinancialGoal[];
}) {
  const events: FinancialEvent[] = [
    ...income.map((entry) => ({
      id: entry.id,
      date: entry.received_at,
      title: entry.description,
      amount: entry.amount,
      type: "income" as const,
      subtitle: entry.category,
      status: entry.payment_method ?? undefined,
    })),
    ...expenses.map((entry) => ({
      id: entry.id,
      date: entry.spent_at,
      title: entry.description,
      amount: entry.amount,
      type: "expense" as const,
      subtitle: entry.category,
      status: entry.payment_method ?? undefined,
    })),
    ...bills.map((bill) => ({
      id: bill.id,
      date: bill.due_date,
      title: bill.name,
      amount: bill.amount,
      type: "bill" as const,
      subtitle: bill.category,
      status: getEffectiveBillStatus(bill),
    })),
    ...installmentPayments.map((payment) => ({
      id: payment.id,
      date: payment.due_date,
      title: `Parcela ${payment.installment_number}`,
      amount: payment.amount,
      type: "installment" as const,
      subtitle: "Compra parcelada",
      status: getEffectiveInstallmentStatus(payment),
    })),
    ...investments.map((investment) => ({
      id: investment.id,
      date: investment.invested_at,
      title: investment.name,
      amount: investment.amount,
      type: "investment" as const,
      subtitle: investment.investment_type,
    })),
    ...goals
      .filter((goal) => goal.deadline)
      .map((goal) => ({
        id: goal.id,
        date: goal.deadline as string,
        title: goal.name,
        amount: goal.target_amount,
        type: "goal" as const,
        subtitle: `${formatCurrency(goal.current_amount)} guardado`,
        status: goal.status,
      })),
  ];

  return events.sort((left, right) => left.date.localeCompare(right.date));
}

export function getCalendarMatrix(referenceDate: Date) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPreviousMonth = new Date(year, month, 0).getDate();

  return Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - startWeekday + 1;

    if (dayNumber <= 0) {
      const date = new Date(year, month - 1, daysInPreviousMonth + dayNumber);
      return { date, currentMonth: false };
    }

    if (dayNumber > daysInMonth) {
      const date = new Date(year, month + 1, dayNumber - daysInMonth);
      return { date, currentMonth: false };
    }

    return { date: new Date(year, month, dayNumber), currentMonth: true };
  });
}

export function getEventTone(type: FinancialEventType) {
  switch (type) {
    case "income":
      return "text-profit";
    case "expense":
      return "text-expense";
    case "bill":
      return "text-warning";
    case "installment":
      return "text-accent";
    case "investment":
      return "text-accent";
    case "goal":
      return "text-text-primary";
    default:
      return "text-text-primary";
  }
}
