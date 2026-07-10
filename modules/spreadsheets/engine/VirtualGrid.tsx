"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Column } from "./types";
import { useTable } from "./useTable";
import { formatCellValue, inputValueForEditing, parseCellValue } from "./formatCellValue";
import { cn } from "./cn";

const ROW_HEIGHT = 44;

export interface VirtualGridProps<Row> {
  rows: Row[];
  columns: Column<Row>[];
  getRowId: (row: Row) => string;
  onCellChange: (rowIndex: number, columnId: string, value: string | number) => void;
  onRowClick?: (row: Row, rowIndex: number) => void;
  selectedRowId?: string;
  onCreateRow?: (name: string) => void;
  createPlaceholder?: string;
}

export function VirtualGrid<Row>({
  rows,
  columns,
  getRowId,
  onCellChange,
  onRowClick,
  selectedRowId,
  onCreateRow,
  createPlaceholder,
}: VirtualGridProps<Row>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const table = useTable(rows.length, columns);
  const [draftName, setDraftName] = useState("");

  function submitDraft() {
    const trimmed = draftName.trim();
    if (!trimmed || !onCreateRow) return;
    onCreateRow(trimmed);
    setDraftName("");
  }

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-surface">
      <div className="flex border-b border-border bg-surface-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {columns.map((column) => (
          <div
            key={column.id}
            className="shrink-0 px-3 py-2.5"
            style={{ width: column.width ?? 160 }}
          >
            {column.label}
          </div>
        ))}
      </div>

      <div ref={parentRef} className="max-h-[560px] overflow-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const rowId = getRowId(row);
            const isRowSelected = selectedRowId === rowId;

            return (
              <div
                key={rowId}
                data-row-id={rowId}
                className={cn(
                  "absolute left-0 top-0 flex w-full items-stretch border-b border-border/60 transition-colors",
                  isRowSelected ? "bg-accent/10" : "hover:bg-border/30"
                )}
                style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                onClick={() => onRowClick?.(row, virtualRow.index)}
              >
                {columns.map((column) => {
                  const editing = table.isEditing(virtualRow.index, column.id);
                  const selected = table.isSelected(virtualRow.index, column.id);
                  const value = column.getValue(row);
                  let committed = false;
                  const commit = (rawValue: string) => {
                    if (committed) return;
                    committed = true;
                    onCellChange(virtualRow.index, column.id, parseCellValue(rawValue, column.type));
                  };

                  return (
                    <div
                      key={column.id}
                      className={cn(
                        "flex shrink-0 items-center px-3 text-sm text-text-primary",
                        column.editable ? "cursor-text hover:bg-accent/5" : "cursor-default",
                        selected && "ring-1 ring-inset ring-accent"
                      )}
                      style={{ width: column.width ?? 160 }}
                      tabIndex={0}
                      onClick={() => table.selectCell(virtualRow.index, column.id)}
                      onDoubleClick={() => column.editable && table.startEditing()}
                      onKeyDown={table.handleKeyDown}
                    >
                      {editing && column.editable ? (
                        <input
                          autoFocus
                          defaultValue={inputValueForEditing(row, column)}
                          className="w-full bg-transparent text-sm text-text-primary outline-none"
                          onBlur={(event) => {
                            commit(event.target.value);
                            table.stopEditing();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === "Tab") {
                              commit((event.target as HTMLInputElement).value);
                            }
                          }}
                        />
                      ) : (
                        <span className="truncate">{formatCellValue(value, column.type)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {onCreateRow && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
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
    </div>
  );
}
