import React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  error,
  required,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>
        {label}
        {required && <span className="text-expense ml-0.5">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-text-secondary">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-expense">{error}</p>
      )}
    </div>
  );
}
