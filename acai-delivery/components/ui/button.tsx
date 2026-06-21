import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline";
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex w-full items-center justify-center rounded-xl px-4 py-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          variant === "primary" &&
            "bg-acai-600 text-white hover:bg-acai-700 active:bg-acai-800",
          variant === "outline" &&
            "border border-acai-200 text-acai-700 hover:bg-acai-50",
          className
        )}
        {...props}
      >
        {isLoading ? "Aguarde..." : children}
      </button>
    );
  }
);

Button.displayName = "Button";
