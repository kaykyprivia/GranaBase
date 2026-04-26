import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "profit" | "expense" | "warning" | "accent";
  loading?: boolean;
  trend?: {
    value: string;
    positive: boolean;
  };
}

const variantStyles = {
  default: {
    icon: "bg-border text-text-secondary",
    value: "text-text-primary",
    glow: "",
  },
  profit: {
    icon: "bg-profit/20 text-profit",
    value: "text-profit",
    glow: "hover:shadow-[0_0_20px_rgba(34,197,94,0.1)]",
  },
  expense: {
    icon: "bg-expense/20 text-expense",
    value: "text-expense",
    glow: "hover:shadow-[0_0_20px_rgba(239,68,68,0.1)]",
  },
  warning: {
    icon: "bg-warning/20 text-warning",
    value: "text-warning",
    glow: "hover:shadow-[0_0_20px_rgba(250,204,21,0.1)]",
  },
  accent: {
    icon: "bg-accent/20 text-accent",
    value: "text-accent",
    glow: "hover:shadow-[0_0_20px_rgba(56,189,248,0.1)]",
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  loading = false,
  trend,
}: StatCardProps) {
  const styles = variantStyles[variant];

  if (loading) {
    return (
      <div className="stat-card">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <Skeleton className="h-4 w-24 mb-3" />
            <Skeleton className="h-7 w-36 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("stat-card group", styles.glow)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-secondary font-medium mb-1 truncate">{title}</p>
          <p className={cn("text-2xl font-bold tracking-tight", styles.value)}>{value}</p>
          {(subtitle || trend) && (
            <div className="flex items-center gap-2 mt-1">
              {subtitle && (
                <p className="text-xs text-text-secondary truncate">{subtitle}</p>
              )}
              {trend && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend.positive ? "text-profit" : "text-expense"
                  )}
                >
                  {trend.positive ? "+" : ""}{trend.value}
                </span>
              )}
            </div>
          )}
        </div>
        <div className={cn("p-2.5 rounded-lg ml-3 shrink-0", styles.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
