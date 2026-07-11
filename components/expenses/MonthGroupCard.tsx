"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { LancamentoItem } from "./LancamentoItem";
import type { DisplayExpense } from "./types";

export interface MonthGroupCardProps {
  month: string;
  label: string;
  items: DisplayExpense[];
  isCurrent: boolean;
  isOpen: boolean;
  onToggle: () => void;
  currency: string;
  getCategoryColor: (category: string) => string;
  isDiscounted: (entry: DisplayExpense) => boolean;
  onMarkPaid: (entry: DisplayExpense) => void;
  onEdit: (entry: DisplayExpense) => void;
  onDelete: (entry: DisplayExpense) => void;
  onRevert: (entry: DisplayExpense) => void;
}

function realDateSortKey(entry: DisplayExpense): string {
  const time = entry.created_at.includes("T") ? entry.created_at.slice(11) : "00:00:00";
  const date = entry.actualDate ?? entry.spent_at;
  return `${date}T${time}`;
}

function sortByRealDateDesc(list: DisplayExpense[]): DisplayExpense[] {
  return [...list].sort((a, b) => realDateSortKey(b).localeCompare(realDateSortKey(a)));
}

const SOURCE_SECTIONS: { source: DisplayExpense["source"]; label: string }[] = [
  { source: "manual", label: "Gastos avulsos" },
  { source: "bill", label: "Contas fixas" },
  { source: "installment", label: "Parcelamentos" },
];

export function MonthGroupCard(props: MonthGroupCardProps) {
  const {
    label,
    items,
    isCurrent,
    isOpen,
    onToggle,
    currency,
    getCategoryColor,
    isDiscounted,
    onMarkPaid,
    onEdit,
    onDelete,
    onRevert,
  } = props;

  const total = items.reduce((s, e) => s + e.amount, 0);
  const sections = SOURCE_SECTIONS.map(({ source, label: sectionLabel }) => ({
    label: sectionLabel,
    entries: sortByRealDateDesc(items.filter((e) => e.source === source)),
  })).filter((section) => section.entries.length > 0);

  return (
    <div className={cn(
      "overflow-hidden rounded-2xl border",
      isCurrent ? "border-expense/40" : "border-border/50"
    )}>
      <button type="button" onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-border/20">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
          {isCurrent && <Badge variant="expense" className="text-[10px]">Atual</Badge>}
          <span className="rounded-full bg-expense/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-expense">{formatCurrency(total, currency as "BRL" | "USD")}</span>
          <span className="text-[10px] text-text-secondary">{items.length} {items.length === 1 ? "item" : "itens"}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform duration-300", isOpen ? "rotate-180" : "rotate-0")} />
      </button>

      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="border-t border-border/40">
            {sections.map((section) => (
              <div key={section.label}>
                {sections.length > 1 && (
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                      {section.label} ({section.entries.length})
                    </span>
                  </div>
                )}
                {section.entries.map((entry) => (
                  <LancamentoItem
                    key={entry.id}
                    entry={entry}
                    categoryColor={getCategoryColor(entry.category)}
                    isDiscounted={isDiscounted(entry)}
                    currency={currency}
                    onMarkPaid={() => onMarkPaid(entry)}
                    onEdit={() => onEdit(entry)}
                    onDelete={() => onDelete(entry)}
                    onRevert={() => onRevert(entry)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
