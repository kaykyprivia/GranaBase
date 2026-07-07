"use client";

import { useCallback, useState } from "react";
import type { CellPosition, Column } from "./types";

/**
 * Cell selection/editing state and Excel-style keyboard navigation
 * (Enter = down, Tab = right, Shift+Tab = left, arrows = move) for a grid
 * of rowCount rows x columns. Knows nothing about what the cells contain.
 */
export function useTable<Row>(rowCount: number, columns: Column<Row>[]) {
  const [selected, setSelected] = useState<CellPosition | null>(null);
  const [editing, setEditing] = useState(false);

  const columnIndex = useCallback(
    (columnId: string) => columns.findIndex((c) => c.id === columnId),
    [columns]
  );

  const selectCell = useCallback((rowIndex: number, columnId: string) => {
    setSelected({ rowIndex, columnId });
    setEditing(false);
  }, []);

  const startEditing = useCallback(() => {
    if (selected) setEditing(true);
  }, [selected]);

  const stopEditing = useCallback(() => setEditing(false), []);

  const moveSelection = useCallback(
    (deltaRow: number, deltaCol: number) => {
      setSelected((current) => {
        if (!current) return current;
        const nextRow = Math.min(Math.max(current.rowIndex + deltaRow, 0), rowCount - 1);
        const currentColIndex = columnIndex(current.columnId);
        const nextColIndex = Math.min(Math.max(currentColIndex + deltaCol, 0), columns.length - 1);
        return { rowIndex: nextRow, columnId: columns[nextColIndex]?.id ?? current.columnId };
      });
    },
    [rowCount, columns, columnIndex]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!selected) return;

      if (editing) {
        if (event.key === "Enter") {
          stopEditing();
          moveSelection(1, 0);
        } else if (event.key === "Tab") {
          event.preventDefault();
          stopEditing();
          moveSelection(0, event.shiftKey ? -1 : 1);
        } else if (event.key === "Escape") {
          stopEditing();
        }
        return;
      }

      switch (event.key) {
        case "Enter":
          startEditing();
          break;
        case "Tab":
          event.preventDefault();
          moveSelection(0, event.shiftKey ? -1 : 1);
          break;
        case "ArrowDown":
          moveSelection(1, 0);
          break;
        case "ArrowUp":
          moveSelection(-1, 0);
          break;
        case "ArrowLeft":
          moveSelection(0, -1);
          break;
        case "ArrowRight":
          moveSelection(0, 1);
          break;
      }
    },
    [selected, editing, moveSelection, startEditing, stopEditing]
  );

  const isSelected = useCallback(
    (rowIndex: number, columnId: string) =>
      selected?.rowIndex === rowIndex && selected.columnId === columnId,
    [selected]
  );

  const isEditing = useCallback(
    (rowIndex: number, columnId: string) => editing && isSelected(rowIndex, columnId),
    [editing, isSelected]
  );

  return {
    selected,
    editing,
    selectCell,
    startEditing,
    stopEditing,
    handleKeyDown,
    isSelected,
    isEditing,
  };
}
