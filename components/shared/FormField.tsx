import React, { cloneElement, isValidElement, useId } from "react";
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
  const generatedId = useId();
  const errorId = `${generatedId}-error`;
  const hintId = `${generatedId}-hint`;
  const childId = isValidElement<{ id?: string }>(children) ? children.props.id ?? generatedId : generatedId;
  const describedBy = [
    isValidElement<{ "aria-describedby"?: string }>(children) ? children.props["aria-describedby"] : undefined,
    error ? errorId : hint ? hintId : undefined,
  ].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: childId,
        "aria-describedby": describedBy,
        "aria-invalid": Boolean(error) || undefined,
        suppressErrorMessage: Boolean(error) || undefined,
      } as React.HTMLAttributes<HTMLElement>)
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={childId}>
        {label}
        {required && <span className="text-expense ml-0.5">*</span>}
      </Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-secondary">{hint}</p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-expense">{error}</p>
      )}
    </div>
  );
}
