import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-b from-accent to-accent-dim text-background hover:brightness-110 shadow-[0_1px_3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]",
        destructive:
          "bg-expense text-white hover:brightness-110 shadow-[0_1px_3px_rgba(0,0,0,0.4)]",
        outline:
          "border border-border bg-transparent hover:bg-border/40 hover:border-border/80 hover:text-text-primary text-text-secondary transition-colors",
        secondary:
          "bg-surface text-text-primary hover:bg-border/80 border border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        ghost:
          "text-text-secondary hover:bg-border/50 hover:text-text-primary",
        link:
          "text-accent underline-offset-4 hover:underline p-0 h-auto",
        profit:
          "bg-gradient-to-b from-profit to-profit-dim text-white hover:brightness-110 shadow-[0_1px_3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.15)]",
        warning:
          "bg-gradient-to-b from-warning to-warning-dim text-background hover:brightness-110 shadow-[0_1px_3px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-sm",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin -ml-1 mr-1 h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
