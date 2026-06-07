import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageIntroProps {
  icon: LucideIcon;
  title: string;
  description: string;
  iconTone?: "accent" | "profit" | "expense" | "warning";
  actions?: ReactNode;
}

const toneStyles = {
  accent: "bg-gradient-to-br from-accent/20 to-accent/8 text-accent ring-1 ring-accent/20",
  profit: "bg-gradient-to-br from-profit/20 to-profit/8 text-profit ring-1 ring-profit/20",
  expense: "bg-gradient-to-br from-expense/20 to-expense/8 text-expense ring-1 ring-expense/20",
  warning: "bg-gradient-to-br from-warning/20 to-warning/8 text-warning ring-1 ring-warning/20",
};

export function PageIntro({
  icon: Icon,
  title,
  description,
  iconTone = "accent",
  actions,
}: PageIntroProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pb-6 border-b border-border/50">
      <div className="flex items-center gap-4">
        <div className={cn("rounded-2xl p-3.5 shrink-0", toneStyles[iconTone])}>
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">{title}</h1>
          <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
