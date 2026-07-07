"use client";

import { useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Debounces a value and calls onSave once it stops changing. Generic to
 * whatever shape the caller wants persisted — no Supabase/domain knowledge.
 */
export function useAutosave<T>(value: T, onSave: (value: T) => Promise<void>, delayMs = 800) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRun = useRef(true);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setStatus("saving");
      onSaveRef.current(value)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"));
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delayMs]);

  return status;
}
