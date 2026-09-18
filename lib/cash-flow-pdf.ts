export interface CashFlowPdfSummaryItem {
  label: string;
  value: number;
  tone?: "default" | "income" | "expense";
}

export interface CashFlowPdfTransaction {
  date: string;
  description: string;
  category: string;
  direction: "income" | "expense";
  amount: number;
  paymentMethod?: string | null;
}

interface DownloadCashFlowPdfOptions {
  title: string;
  accountLabel: string;
  startDate: string;
  endDate: string;
  currency: "BRL" | "USD";
  summary: CashFlowPdfSummaryItem[];
  transactions: CashFlowPdfTransaction[];
  filenamePrefix: string;
}

const PDF_COLORS = {
  ink: [15, 23, 42] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  accent: [14, 165, 233] as [number, number, number],
  income: [22, 163, 74] as [number, number, number],
  expense: [220, 38, 38] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

export async function downloadCashFlowPdf(options: DownloadCashFlowPdfOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const document = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = document.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  document.setFillColor(...PDF_COLORS.ink);
  document.rect(0, 0, pageWidth, 38, "F");
  document.setFillColor(...PDF_COLORS.accent);
  document.rect(0, 0, 4, 38, "F");

  document.setTextColor(...PDF_COLORS.white);
  document.setFont("helvetica", "bold");
  document.setFontSize(19);
  document.text(options.title, margin, 16);
  document.setFont("helvetica", "normal");
  document.setFontSize(9);
  document.text(options.accountLabel, margin, 23);
  document.text(
    `${formatPdfDate(options.startDate)} a ${formatPdfDate(options.endDate)}`,
    margin,
    29
  );

  const gap = 3;
  const boxWidth = (contentWidth - gap * (options.summary.length - 1)) / options.summary.length;
  const boxY = 46;

  options.summary.forEach((item, index) => {
    const x = margin + index * (boxWidth + gap);
    document.setFillColor(248, 250, 252);
    document.setDrawColor(...PDF_COLORS.border);
    document.roundedRect(x, boxY, boxWidth, 23, 2, 2, "FD");
    document.setFont("helvetica", "normal");
    document.setFontSize(7.5);
    document.setTextColor(...PDF_COLORS.muted);
    document.text(item.label.toUpperCase(), x + 3, boxY + 7);
    document.setFont("helvetica", "bold");
    document.setFontSize(10);
    document.setTextColor(...getToneColor(item.tone));
    document.text(formatPdfCurrency(item.value, options.currency), x + 3, boxY + 16);
  });

  document.setFont("helvetica", "bold");
  document.setFontSize(11);
  document.setTextColor(...PDF_COLORS.ink);
  document.text("Movimentações", margin, 79);
  document.setFont("helvetica", "normal");
  document.setFontSize(8);
  document.setTextColor(...PDF_COLORS.muted);
  document.text(
    `${options.transactions.length} lançamento${options.transactions.length === 1 ? "" : "s"}`,
    margin,
    84
  );

  const rows = [...options.transactions]
    .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))
    .map((transaction) => [
      formatPdfDate(transaction.date),
      transaction.description,
      transaction.paymentMethod
        ? `${transaction.category} · ${transaction.paymentMethod}`
        : transaction.category,
      transaction.direction === "income" ? "Entrada" : "Saída",
      `${transaction.direction === "income" ? "+" : "-"} ${formatPdfCurrency(transaction.amount, options.currency)}`,
    ]);

  autoTable(document, {
    startY: 89,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [["Data", "Descrição", "Categoria", "Tipo", "Valor"]],
    body: rows.length > 0 ? rows : [["-", "Nenhuma movimentação no período", "-", "-", "-"]],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 2.2,
      lineColor: PDF_COLORS.border,
      lineWidth: 0.15,
      textColor: PDF_COLORS.ink,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: PDF_COLORS.ink,
      textColor: PDF_COLORS.white,
      fontStyle: "bold",
      lineColor: PDF_COLORS.ink,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 55 },
      2: { cellWidth: 50 },
      3: { cellWidth: 19 },
      4: { cellWidth: 34, halign: "right", fontStyle: "bold" },
    },
  });

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setDrawColor(...PDF_COLORS.border);
    document.line(margin, 286, pageWidth - margin, 286);
    document.setFont("helvetica", "normal");
    document.setFontSize(7);
    document.setTextColor(...PDF_COLORS.muted);
    document.text("Gerado pelo GranaBase", margin, 291);
    document.text(`Página ${page} de ${pageCount}`, pageWidth - margin, 291, { align: "right" });
  }

  document.save(
    `${options.filenamePrefix}-${options.startDate}-a-${options.endDate}.pdf`
  );
}

function getToneColor(tone: CashFlowPdfSummaryItem["tone"]) {
  if (tone === "income") return PDF_COLORS.income;
  if (tone === "expense") return PDF_COLORS.expense;
  return PDF_COLORS.ink;
}

function formatPdfCurrency(value: number, currency: "BRL" | "USD") {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "pt-BR", {
    style: "currency",
    currency,
  })
    .format(value)
    .replace(/\u00a0/g, " ");
}

function formatPdfDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}
