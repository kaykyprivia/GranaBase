"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Column } from "./types";
import { formatCellValue } from "./formatCellValue";
import { cn } from "./cn";

const ESTIMATED_CARD_HEIGHT = 84;

export interface CardListProps<Row> {
  rows: Row[];
  columns: Column<Row>[];
  getRowId: (row: Row) => string;
  onRowClick?: (row: Row, rowIndex: number) => void;
  selectedRowId?: string;
  onCreateRow?: (name: string) => void;
  createPlaceholder?: string;
}

/**
 * Mobile adaptation of VirtualGrid — no product with a real grid keeps the
 * grid on touch screens (Airtable/Notion/Coda all switch to card/list).
 * Same Row/Column data model, different presentation, same virtualization
 * strategy so a list with thousands of rows costs the same DOM nodes as one
 * with ten.
 */
export function CardList<Row>({ rows, columns, getRowId, onRowClick, selectedRowId, onCreateRow, createPlaceholder }: CardListProps<Row>) {
  const [primaryColumn, ...restColumns] = columns;
  const [draftName, setDraftName] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 6,
  });

  function submitDraft() {
    const trimmed = draftName.trim();
    if (!trimmed || !onCreateRow) return;
    onCreateRow(trimmed);
    setDraftName("");
  }

  return (
    <div className="flex flex-col gap-2">
      {onCreateRow && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5">
          <Plus className="h-4 w-4 shrink-0 text-text-secondary" />
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitDraft();
            }}
            onBlur={submitDraft}
            placeholder={createPlaceholder ?? "Adicionar..."}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary outline-none"
          />
        </div>
      )}

      <div ref={parentRef} className="max-h-[70vh] overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const rowId = getRowId(row);
            return (
              <button
                key={rowId}
                type="button"
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                onClick={() => onRowClick?.(row, virtualRow.index)}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                className={cn(
                  "mb-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors",
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
      </div>
    </div>
  );
}
