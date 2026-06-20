"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronDown, PiggyBank } from "lucide-react";
import { cn } from "@/lib/utils";
import { investmentTabs, type InvestmentTabId } from "@/components/investments/InvestmentsSubSidebar";

interface InvestmentsNavAccordionProps {
  onNavigate?: () => void;
}

export function InvestmentsNavAccordion({ onNavigate }: InvestmentsNavAccordionProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isInvestmentsSection = pathname === "/investments";
  const activeTab: InvestmentTabId = ((isInvestmentsSection ? searchParams.get("tab") : null) as InvestmentTabId | null) ?? "overview";

  const [expanded, setExpanded] = useState(isInvestmentsSection);

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
          {investmentTabs.map((item) => {
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
          })}
        </div>
      </div>
    </div>
  );
}
