"use client";

import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

  const pending = sortByRealDateDesc(items.filter((e) => e.status !== "paid"));
  const paidItems = sortByRealDateDesc(items.filter((e) => e.status === "paid"));

  const total = items.reduce((s, e) => s + e.amount, 0);
  const paidTotal = paidItems.reduce((s, e) => s + e.amount, 0);
  const pendingTotal = pending.reduce((s, e) => s + e.amount, 0);
  const progressPct = total > 0 ? (paidTotal / total) * 100 : 0;

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

      {pending.length > 0 && (
        <div className="px-4 pb-3">
          <Progress value={progressPct} className="h-1.5" indicatorClassName="bg-profit" />
          <p className="mt-1 text-[10px] text-text-secondary">
            {formatCurrency(paidTotal, currency as "BRL" | "USD")} pagos · faltam {formatCurrency(pendingTotal, currency as "BRL" | "USD")}
          </p>
        </div>
      )}

      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="border-t border-border/40">
            {pending.length > 0 && (
              <>
                <div className="flex items-center justify-between px-4 pt-2 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-warning">A pagar ({pending.length})</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-warning tabular-nums">{formatCurrency(pendingTotal, currency as "BRL" | "USD")}</span>
                </div>
                {pending.map((entry) => (
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
              </>
            )}

            {paidItems.length > 0 && pending.length > 0 && (
              <div className="px-4 pt-2 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-profit">Pago ({paidItems.length})</span>
              </div>
            )}

            {paidItems.map((entry) => (
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
        </div>
      </div>
    </div>
  );
}
