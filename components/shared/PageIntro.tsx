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
  accent: "bg-accent/15 text-accent",
  profit: "bg-profit/15 text-profit",
  expense: "bg-expense/15 text-expense",
  warning: "bg-warning/15 text-warning",
};

export function PageIntro({
  icon: Icon,
  title,
  description,
  iconTone = "accent",
  actions,
}: PageIntroProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex items-start gap-3">
        <div className={cn("rounded-2xl p-3", toneStyles[iconTone])}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{title}</h1>
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}
