import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-accent/20 text-accent border border-accent/30",
        profit: "bg-profit/20 text-profit border border-profit/30",
        expense: "bg-expense/20 text-expense border border-expense/30",
        warning: "bg-warning/20 text-warning border border-warning/30",
        secondary: "bg-surface text-text-secondary border border-border",
        pending: "bg-warning/20 text-warning border border-warning/30",
        paid: "bg-profit/20 text-profit border border-profit/30",
        paid_with_discount: "bg-accent/20 text-accent border border-accent/30",
        overdue: "bg-expense/20 text-expense border border-expense/30",
        active: "bg-accent/20 text-accent border border-accent/30",
        completed: "bg-profit/20 text-profit border border-profit/30",
        paused: "bg-surface text-text-secondary border border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
