"use client";

import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  BarChart3,
  Bitcoin,
  Building2,
  Globe2,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LineChart,
  PlusCircle,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type InvestmentTabId =
  | "overview"
  | "portfolio"
  | "stocks"
  | "fiis"
  | "fixed-income"
  | "crypto"
  | "international"
  | "dividends"
  | "earnings"
  | "contributions"
  | "profitability"
  | "reports";

export interface InvestmentTabItem {
  id: InvestmentTabId;
  label: string;
  icon: LucideIcon;
}

export const investmentTabs: InvestmentTabItem[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "portfolio", label: "Carteira", icon: Wallet },
  { id: "stocks", label: "Ações", icon: TrendingUp },
  { id: "fiis", label: "FIIs", icon: Building2 },
  { id: "fixed-income", label: "Renda fixa", icon: Landmark },
  { id: "crypto", label: "Criptomoedas", icon: Bitcoin },
  { id: "international", label: "Exterior", icon: Globe2 },
  { id: "dividends", label: "Dividendos", icon: BadgeDollarSign },
  { id: "earnings", label: "Proventos", icon: HandCoins },
  { id: "contributions", label: "Aportes", icon: PlusCircle },
  { id: "profitability", label: "Rentabilidade", icon: LineChart },
  { id: "reports", label: "Relatórios", icon: BarChart3 },
];

interface InvestmentsSubSidebarProps {
  activeTab: InvestmentTabId;
  onTabChange: (tab: InvestmentTabId) => void;
}

export function InvestmentsSubSidebar({
  activeTab,
  onTabChange,
}: InvestmentsSubSidebarProps) {
  return (
    <aside className="w-full lg:w-64 lg:shrink-0">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface/85 backdrop-blur">
        <div className="hidden border-b border-border/70 px-4 py-4 lg:block">
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

        <div className="flex gap-2 overflow-x-auto px-3 py-3 scrollbar-thin scrollbar-track-transparent lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-3 lg:py-3">
          {investmentTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "group inline-flex min-w-max items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  "lg:w-full lg:min-w-0",
                  isActive
                    ? "border-accent/30 bg-accent/10 text-accent shadow-[0_0_0_1px_rgba(56,189,248,0.08)]"
                    : "border-transparent text-text-secondary hover:border-border hover:bg-background/70 hover:text-text-primary"
                )}
                aria-pressed={isActive}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-accent/12 text-accent"
                      : "bg-background/60 text-text-secondary group-hover:text-text-primary"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate text-left">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
