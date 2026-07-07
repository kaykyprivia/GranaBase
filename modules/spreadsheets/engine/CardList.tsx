"use client";

import type { Column } from "./types";
import { formatCellValue } from "./formatCellValue";
import { cn } from "./cn";

export interface CardListProps<Row> {
  rows: Row[];
  columns: Column<Row>[];
  getRowId: (row: Row) => string;
  onRowClick?: (row: Row, rowIndex: number) => void;
  selectedRowId?: string;
}

/**
 * Mobile adaptation of VirtualGrid — no product with a real grid keeps the
 * grid on touch screens (Airtable/Notion/Coda all switch to card/list).
 * Same Row/Column data model, different presentation.
 */
export function CardList<Row>({ rows, columns, getRowId, onRowClick, selectedRowId }: CardListProps<Row>) {
  const [primaryColumn, ...restColumns] = columns;

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, rowIndex) => {
        const rowId = getRowId(row);
        return (
          <button
            key={rowId}
            type="button"
            onClick={() => onRowClick?.(row, rowIndex)}
            className={cn(
              "rounded-xl border border-border bg-surface p-3 text-left transition-colors",
              selectedRowId === rowId ? "border-accent/60 bg-accent/10" : "hover:bg-border/30"
            )}
          >
            <p className="truncate text-sm font-semibold text-text-primary">
              {formatCellValue(primaryColumn?.getValue(row) ?? null, primaryColumn?.type ?? "text")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {restColumns.slice(0, 3).map((column) => (
                <p key={column.id} className="text-xs text-text-secondary">
                  <span className="uppercase tracking-wide text-text-muted">{column.label}: </span>
                  {formatCellValue(column.getValue(row), column.type)}
                </p>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
