"use client";

import { useCallback, useState } from "react";

const MAX_HISTORY = 100;

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface UndoableState<T> {
  state: T;
  set: (next: T | ((current: T) => T)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: (next: T) => void;
}

/**
 * Generic undo/redo history for any row-array-shaped state (add/remove/edit/
 * duplicate/move all collapse to "new array snapshot"). Knows nothing about
 * spreadsheets, pricing, or any domain concept — pure state history.
 */
export function useUndoRedo<T>(initial: T): UndoableState<T> {
  const [history, setHistory] = useState<History<T>>({ past: [], present: initial, future: [] });

  const set = useCallback((next: T | ((current: T) => T)) => {
    setHistory((current) => {
      const resolved = typeof next === "function" ? (next as (c: T) => T)(current.present) : next;
      return {
        past: [...current.past, current.present].slice(-MAX_HISTORY),
        present: resolved,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (previous === undefined) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (next === undefined) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((next: T) => {
    setHistory({ past: [], present: next, future: [] });
  }, []);

  return {
    state: history.present,
    set,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    reset,
  };
}
