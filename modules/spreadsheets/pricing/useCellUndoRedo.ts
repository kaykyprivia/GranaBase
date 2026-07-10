"use client";

import { useCallback, useEffect, useRef } from "react";

interface CellEdit {
  id: string;
  columnId: string;
  previousValue: string | number | null;
  newValue: string | number | null;
}

/**
 * Ctrl+Z / Ctrl+Shift+Z for grid cell edits — records the value a cell had
 * right before a commit so it can be restored (and re-applied on redo).
 * Ignores keystrokes while a text input/textarea has focus so it doesn't
 * fight the browser's native undo inside an open editor.
 */
export function useCellUndoRedo(update: (id: string, patch: Record<string, string | number | null>) => void) {
  const undoStack = useRef<CellEdit[]>([]);
  const redoStack = useRef<CellEdit[]>([]);

  const record = useCallback(
    (id: string, columnId: string, previousValue: string | number | null, newValue: string | number | null) => {
      undoStack.current = [...undoStack.current, { id, columnId, previousValue, newValue }].slice(-50);
      redoStack.current = [];
    },
    []
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;

      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (event.shiftKey) {
        const edit = redoStack.current.at(-1);
        if (!edit) return;
        event.preventDefault();
        redoStack.current = redoStack.current.slice(0, -1);
        undoStack.current = [...undoStack.current, edit];
        update(edit.id, { [edit.columnId]: edit.newValue });
      } else {
        const edit = undoStack.current.at(-1);
        if (!edit) return;
        event.preventDefault();
        undoStack.current = undoStack.current.slice(0, -1);
        redoStack.current = [...redoStack.current, edit];
        update(edit.id, { [edit.columnId]: edit.previousValue });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [update]);

  return { record };
}
