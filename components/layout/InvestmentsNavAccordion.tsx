"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronDown, PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";
import { investmentNavGroups, type InvestmentTabId } from "@/components/investments/InvestmentsSubSidebar";

interface InvestmentsNavAccordionProps {
  onNavigate?: () => void;
}

export function InvestmentsNavAccordion({ onNavigate }: InvestmentsNavAccordionProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInvestmentsSection = pathname === "/investments";
  const activeTab: InvestmentTabId = ((isInvestmentsSection ? searchParams.get("tab") : null) as InvestmentTabId | null) ?? "overview";

  const [expanded, setExpanded] = useState(isInvestmentsSection);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    investmentNavGroups.reduce<Record<string, boolean>>((acc, item) => {
      if (item.kind === "group") {
        acc[item.groupId] = isInvestmentsSection && item.items.some((sub) => sub.id === activeTab);
      }
      return acc;
    }, {})
  );

  const toggleGroup = (groupId: string) =>
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className={cn(
          "relative flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
          isInvestmentsSection
            ? "bg-accent/10 text-accent"
            : "text-text-secondary hover:bg-white/[0.04] hover:text-text-primary"
        )}
      >
        {isInvestmentsSection && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-accent" />
        )}
        <PiggyBank
          className={cn("shrink-0", isInvestmentsSection ? "text-accent" : "text-text-muted")}
          style={{ height: "17px", width: "17px" }}
          strokeWidth={isInvestmentsSection ? 2 : 1.75}
        />
        <span className="flex-1 text-left">Investimentos</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", expanded ? "rotate-180" : "rotate-0")}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: expanded ? "1000px" : "0px" }}
      >
        <div className="ml-[19px] mt-0.5 space-y-0.5 border-l border-border/60 py-0.5 pl-3">
          {investmentNavGroups.map((item) => {
            if (item.kind === "single") {
              const isActive = isInvestmentsSection && activeTab === item.id;
              return (
                <Link
                  key={item.id}
                  href={`/investments?tab=${item.id}`}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-white/10 font-medium text-text-primary"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  )}
                >
                  {item.label}
                </Link>
              );
            }

            const isGroupOpen = !!openGroups[item.groupId];
            const hasActiveChild = isInvestmentsSection && item.items.some((sub) => sub.id === activeTab);

            return (
              <div key={item.groupId}>
                <button
                  type="button"
                  onClick={() => toggleGroup(item.groupId)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                    hasActiveChild
                      ? "text-text-primary"
                      : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                  )}
                >
                  <span className="flex-1 break-words text-left">{item.label}</span>
                  <ChevronDown
                    className={cn("h-3 w-3 shrink-0 transition-transform duration-200", isGroupOpen ? "rotate-180" : "rotate-0")}
                  />
                </button>

                <div
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ maxHeight: isGroupOpen ? `${item.items.length * 40}px` : "0px" }}
                >
                  <div className="ml-3 space-y-0.5 border-l border-border/40 py-0.5 pl-3">
                    {item.items.map((sub) => {
                      const isActive = isInvestmentsSection && activeTab === sub.id;
                      return (
                        <Link
                          key={sub.id}
                          href={`/investments?tab=${sub.id}`}
                          onClick={onNavigate}
                          className={cn(
                            "block rounded-lg px-3 py-1.5 text-xs transition-colors",
                            isActive
                              ? "bg-white/10 font-medium text-text-primary"
                              : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                          )}
                        >
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
