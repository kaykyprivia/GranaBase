import type {
  Bill,
  ExpenseEntry,
  FinancialGoal,
  IncomeEntry,
  Installment,
  InstallmentPayment,
  Investment,
} from "@/types/database";

interface SettingsExportPayload {
  bills: Bill[];
  expenseEntries: ExpenseEntry[];
  financialGoals: FinancialGoal[];
  incomeEntries: IncomeEntry[];
  installmentPayments: InstallmentPayment[];
  installments: Installment[];
  investments: Investment[];
}

interface SettingsExportRow {
  origem: string;
  titulo: string;
  categoria: string;
  valor: string;
  data: string;
  status: string;
  observacoes: string;
  detalhe_1: string;
  detalhe_2: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

export function getSupabaseErrorMessage(error: unknown): string {
  if (!error) {
    return "Erro desconhecido.";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object") {
    const typedError = error as { message?: string; code?: string; details?: string; hint?: string };
    return [typedError.message, typedError.code ? `code=${typedError.code}` : null, typedError.details, typedError.hint]
      .filter(Boolean)
      .join(" | ");
  }

  return "Erro inesperado.";
}

export function buildSettingsExportCsv({
  bills,
  expenseEntries,
  financialGoals,
  incomeEntries,
  installmentPayments,
  installments,
  investments,
}: SettingsExportPayload) {
  const rows: SettingsExportRow[] = [
    ...incomeEntries.map((entry) => ({
      origem: "Entradas",
      titulo: entry.description,
      categoria: entry.category,
      valor: formatCurrency(entry.amount),
      data: entry.received_at,
      status: entry.payment_method ?? "",
      observacoes: entry.notes ?? "",
      detalhe_1: "",
      detalhe_2: "",
    })),
    ...expenseEntries.map((entry) => ({
      origem: "Gastos",
      titulo: entry.description,
      categoria: entry.category,
      valor: formatCurrency(entry.amount),
      data: entry.spent_at,
      status: entry.payment_method ?? "",
      observacoes: entry.notes ?? "",
      detalhe_1: "",
      detalhe_2: "",
    })),
    ...bills.map((bill) => ({
      origem: "Contas",
      titulo: bill.name,
      categoria: bill.category,
      valor: formatCurrency(bill.amount),
      data: bill.due_date,
      status: bill.status,
      observacoes: bill.notes ?? "",
      detalhe_1: bill.is_recurring ? "Recorrente" : "Pontual",
      detalhe_2: bill.paid_at ?? "",
    })),
    ...installments.map((installment) => ({
      origem: "Parcelamentos",
      titulo: installment.description,
      categoria: "Compra parcelada",
      valor: formatCurrency(installment.total_amount),
      data: installment.first_due_date,
      status: "",
      observacoes: installment.notes ?? "",
      detalhe_1: `${installment.installment_count} parcelas`,
      detalhe_2: `Parcela: ${formatCurrency(installment.installment_amount)}`,
    })),
    ...installmentPayments.map((payment) => ({
      origem: "Parcelas",
      titulo: `Parcela ${payment.installment_number}`,
      categoria: payment.installment_id,
      valor: formatCurrency(payment.amount),
      data: payment.due_date,
      status: payment.status,
      observacoes: "",
      detalhe_1: payment.paid_at ?? "",
      detalhe_2: "",
    })),
    ...investments.map((investment) => ({
      origem: "Investimentos",
      titulo: investment.name,
      categoria: investment.investment_type,
      valor: formatCurrency(investment.amount),
      data: investment.invested_at,
      status: "",
      observacoes: investment.notes ?? "",
      detalhe_1: "",
      detalhe_2: "",
    })),
    ...financialGoals.map((goal) => ({
      origem: "Metas",
      titulo: goal.name,
      categoria: goal.category,
      valor: formatCurrency(goal.target_amount),
      data: goal.deadline ?? "",
      status: goal.status,
      observacoes: goal.notes ?? "",
      detalhe_1: "Progresso calculado pelo patrimonio global",
      detalhe_2: "",
    })),
  ];

  const header = [
    "origem",
    "titulo",
    "categoria",
    "valor",
    "data",
    "status",
    "observacoes",
    "detalhe_1",
    "detalhe_2",
  ];

  return [
    header.join(","),
    ...rows.map((row) =>
      [
        row.origem,
        row.titulo,
        row.categoria,
        row.valor,
        row.data,
        row.status,
        row.observacoes,
        row.detalhe_1,
        row.detalhe_2,
      ]
        .map(escapeCsv)
        .join(",")
    ),
  ].join("\n");
}
