"use client";

import { useState } from "react";
import { cn } from "../../engine/cn";

export const inputClass =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/60";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

export interface NumberFieldProps {
  label: string;
  value: number | null;
  onCommit: (value: number | null) => void;
  step?: string;
  /** When true, clearing the field commits `null`. When false (default), clearing reverts to the last valid value instead of silently saving 0. */
  allowNull?: boolean;
  min?: number;
  className?: string;
}

/**
 * Numeric field that only commits on blur/Enter, and only when the value is
 * a real finite number — clearing the field (or typing something invalid)
 * reverts to the last valid value on blur instead of silently coercing to
 * 0/NaN and saving that. This is the fix for the "Number('') === 0" footgun.
 */
export function NumberField({
  label,
  value,
  onCommit,
  step = "0.01",
  allowNull = false,
  min,
  className,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string>(value === null || value === undefined ? "" : String(value));

  function revert() {
    setDraft(value === null || value === undefined ? "" : String(value));
  }

  function handleBlur() {
    const trimmed = draft.trim();

    if (trimmed === "") {
      if (allowNull) {
        onCommit(null);
      } else {
        revert();
      }
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || (min !== undefined && parsed < min)) {
      revert();
      return;
    }

    onCommit(parsed);
  }

  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        className={cn(inputClass, className)}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
      />
    </Field>
  );
}
