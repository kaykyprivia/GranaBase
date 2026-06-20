"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  BarChart3,
  Bitcoin,
  Building2,
  ChevronDown,
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

type NavItem =
  | { kind: "single"; id: InvestmentTabId; label: string; icon: LucideIcon }
  | { kind: "group"; groupId: string; label: string; icon: LucideIcon; items: { id: InvestmentTabId; label: string }[] };

const NAV: NavItem[] = [
  { kind: "single", id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { kind: "single", id: "portfolio", label: "Carteira", icon: Wallet },
  {
    kind: "group",
    groupId: "assets",
    label: "Ativos",
    icon: TrendingUp,
    items: [
      { id: "stocks", label: "Ações" },
      { id: "fiis", label: "FIIs" },
      { id: "fixed-income", label: "Renda fixa" },
      { id: "crypto", label: "Criptomoedas" },
      { id: "international", label: "Exterior" },
    ],
  },
  {
    kind: "group",
    groupId: "income",
    label: "Rendimentos",
    icon: BadgeDollarSign,
    items: [
      { id: "dividends", label: "Dividendos" },
      { id: "earnings", label: "Proventos" },
    ],
  },
  { kind: "single", id: "contributions", label: "Aportes", icon: PlusCircle },
  {
    kind: "group",
    groupId: "analysis",
    label: "Análise",
    icon: BarChart3,
    items: [
      { id: "profitability", label: "Rentabilidade" },
      { id: "reports", label: "Relatórios" },
    ],
  },
];

interface InvestmentsSubSidebarProps {
  activeTab: InvestmentTabId;
  onTabChange: (tab: InvestmentTabId) => void;
  embedded?: boolean;
}

export function InvestmentsSubSidebar({ activeTab, onTabChange, embedded = false }: InvestmentsSubSidebarProps) {
  const initialOpen = NAV.reduce<Record<string, boolean>>((acc, item) => {
    if (item.kind === "group") {
      acc[item.groupId] = item.items.some((sub) => sub.id === activeTab);
    }
    return acc;
  }, {});

  const [open, setOpen] = useState<Record<string, boolean>>(initialOpen);

  const toggle = (groupId: string) =>
    setOpen((prev) => ({ ...prev, [groupId]: !prev[groupId] }));

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
          {NAV.map((item) => {
            if (item.kind === "single") {
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
            }

            const Icon = item.icon;
            const isGroupOpen = !!open[item.groupId];
            const hasActiveChild = item.items.some((sub) => sub.id === activeTab);
            const subHeight = item.items.length * 40;

            return (
              <div key={item.groupId} className="w-full">
                <button
                  type="button"
                  onClick={() => toggle(item.groupId)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    hasActiveChild
                      ? "text-text-primary"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  )}
                >
                  <span className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                    hasActiveChild ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"
                  )}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 break-words text-left">{item.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-300",
                      isGroupOpen ? "rotate-180" : "rotate-0"
                    )}
                  />
                </button>

                <div
                  className="relative overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ height: isGroupOpen ? `${subHeight}px` : 0 }}
                >
                  <ul className="absolute left-0 top-0 w-full">
                    {item.items.map((sub) => {
                      const isActive = sub.id === activeTab;
                      return (
                        <li key={sub.id}>
                          <button
                            type="button"
                            onClick={() => onTabChange(sub.id)}
                            className={cn(
                              "flex h-10 w-full items-center gap-3 rounded-lg pl-14 pr-3 text-sm transition-all duration-150",
                              isActive
                                ? "bg-white/10 font-medium text-text-primary"
                                : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                            )}
                          >
                            <span className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                              isActive ? "bg-accent" : "bg-text-secondary/40"
                            )} />
                            {sub.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
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
