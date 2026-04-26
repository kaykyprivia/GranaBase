"use client";

import React, { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: number;
  onChange?: (value: number) => void;
  error?: string;
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, error, ...props }, ref) => {
    const [displayValue, setDisplayValue] = useState(() => {
      if (!value) return "";
      return value.toFixed(2).replace(".", ",");
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, "");
      if (!raw) {
        setDisplayValue("");
        onChange?.(0);
        return;
      }
      const cents = parseInt(raw, 10);
      const numericValue = cents / 100;
      setDisplayValue(numericValue.toFixed(2).replace(".", ","));
      onChange?.(numericValue);
    };

    const handleFocus = () => {
      if (displayValue === "0,00") setDisplayValue("");
    };

    const handleBlur = () => {
      if (!displayValue) {
        setDisplayValue("");
        onChange?.(0);
      }
    };

    return (
      <div className="relative w-full">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary text-sm font-medium pointer-events-none">
          R$
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="0,00"
          className={cn(
            "flex h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary",
            "placeholder:text-text-secondary/50 font-medium",
            "focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-all duration-200",
            error && "border-expense focus:ring-expense",
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-expense">{error}</p>}
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
