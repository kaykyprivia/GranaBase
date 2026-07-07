import type { Column, ColumnType } from "./types";

export function formatCellValue(value: string | number | null, type: ColumnType): string {
  if (value === null || value === undefined) return "";

  switch (type) {
    case "currency":
      return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        Number(value)
      );
    case "percentage":
      return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
    case "number":
      return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    default:
      return String(value);
  }
}

export function parseCellValue(raw: string, type: ColumnType): string | number {
  if (type === "text" || type === "select") return raw;
  const normalized = raw.replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function inputValueForEditing<Row>(row: Row, column: Column<Row>): string {
  const value = column.getValue(row);
  if (value === null || value === undefined) return "";
  return String(value);
}
