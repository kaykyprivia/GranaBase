import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightIcon, error, ...props }, ref) => {
    return (
      <div className="relative w-full">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted",
            "shadow-input transition-all duration-150",
            "hover:border-border/80 hover:bg-background/80",
            "focus:outline-none focus:ring-0 focus:border-accent/60 focus:bg-background focus:shadow-input-focus",
            "disabled:cursor-not-allowed disabled:opacity-40",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium",
            error && "border-expense/70 focus:border-expense focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]",
            leftIcon && "pl-10",
            rightIcon && "pr-10",
            className
          )}
          ref={ref}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary">
            {rightIcon}
          </div>
        )}
        {error && (
          <p className="mt-1 text-xs text-expense">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
