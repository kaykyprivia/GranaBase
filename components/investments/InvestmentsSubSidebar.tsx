"use client";

import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, PlusCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export type InvestmentTabId = "overview" | "portfolio" | "contributions";

export interface InvestmentTabItem {
  id: InvestmentTabId;
  label: string;
  icon: LucideIcon;
}

export const investmentTabs: InvestmentTabItem[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "portfolio", label: "Carteira", icon: Wallet },
  { id: "contributions", label: "Aportes", icon: PlusCircle },
];

export const investmentNavGroups: InvestmentTabItem[] = investmentTabs;

interface InvestmentsSubSidebarProps {
  activeTab: InvestmentTabId;
  onTabChange: (tab: InvestmentTabId) => void;
  embedded?: boolean;
}

export function InvestmentsSubSidebar({ activeTab, onTabChange, embedded = false }: InvestmentsSubSidebarProps) {
  const inner = (
    <>
      <div className={cn("px-4 py-4", embedded ? "border-b border-border/70" : "hidden border-b border-border/70 lg:block")}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-text-secondary">
          Central
        </p>
        <p className="mt-2 text-sm font-semibold text-text-primary">
          Navegação de investimentos
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Explore sua carteira por categoria sem sair da página.
        </p>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-3">
        {investmentTabs.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeTab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-white/10 text-text-primary"
                  : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
              )}
            >
              <span className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                isActive ? "bg-white/12 text-text-primary" : "text-text-secondary group-hover:text-text-primary"
              )}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="break-words text-left">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );

  if (embedded) {
    return (
      <aside className="w-full shrink-0 border-b border-border/70 lg:w-60 lg:border-b-0 lg:border-r">
        {inner}
      </aside>
    );
  }

  return (
    <aside className="w-full lg:w-64 lg:shrink-0">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface/85 backdrop-blur">
        {inner}
      </div>
    </aside>
  );
}
