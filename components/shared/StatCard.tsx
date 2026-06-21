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
  /** "compact" lowers visual weight for secondary/supporting metrics. */
  size?: "default" | "compact";
  trend?: {
    value: string;
    positive: boolean;
  };
}

const variantStyles = {
  default: {
    icon: "bg-white/[0.06] text-text-secondary",
    value: "text-text-primary",
    glow: "",
  },
  profit: {
    icon: "bg-gradient-to-br from-profit/25 to-profit/10 text-profit ring-1 ring-profit/20",
    value: "text-profit",
    glow: "hover:shadow-glow-profit",
  },
  expense: {
    icon: "bg-gradient-to-br from-expense/25 to-expense/10 text-expense ring-1 ring-expense/20",
    value: "text-expense",
    glow: "hover:shadow-glow-expense",
  },
  warning: {
    icon: "bg-gradient-to-br from-warning/25 to-warning/10 text-warning ring-1 ring-warning/20",
    value: "text-warning",
    glow: "hover:shadow-glow-warning",
  },
  accent: {
    icon: "bg-gradient-to-br from-accent/25 to-accent/10 text-accent ring-1 ring-accent/20",
    value: "text-accent",
    glow: "hover:shadow-glow-accent",
  },
};

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  loading = false,
  size = "default",
  trend,
}: StatCardProps) {
  const styles = variantStyles[variant];
  const isCompact = size === "compact";

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
          <p className="text-[11px] text-text-muted font-medium mb-2 uppercase tracking-wider leading-snug">{title}</p>
          <p className={cn("font-bold tracking-tight tabular-nums", isCompact ? "text-lg" : "text-2xl", styles.value)}>{value}</p>
          {(subtitle || trend) && (
            <div className="flex items-center gap-2 mt-1">
              {subtitle && (
                <p className="text-xs text-text-secondary">{subtitle}</p>
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
        <div className={cn("rounded-xl ml-3 shrink-0", isCompact ? "p-2" : "p-2.5", styles.icon)}>
          <Icon className={isCompact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}
