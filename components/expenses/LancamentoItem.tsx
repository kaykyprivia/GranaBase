"use client";

import { Receipt, Repeat, CreditCard, Wallet, Check, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DisplayExpense } from "./types";

export interface LancamentoItemProps {
  entry: DisplayExpense;
  categoryColor: string;
  isDiscounted: boolean;
  currency: string;
  onMarkPaid: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRevert: () => void;
}

function getTypeIcon(entry: DisplayExpense) {
  if (entry.source === "bill") return Receipt;
  if (entry.source === "installment") return Repeat;
  if (entry.source === "manual" && entry.payment_method === "Cartão Crédito") return CreditCard;
  return Wallet;
}

export function LancamentoItem({
  entry,
  categoryColor,
  isDiscounted,
  currency,
  onMarkPaid,
  onEdit,
  onDelete,
  onRevert,
}: LancamentoItemProps) {
  const TypeIcon = getTypeIcon(entry);
  const isGenericInstallmentCategory = entry.source === "installment" && entry.category === "Parcelamento";
  const currencyCode = currency === "USD" ? "USD" : "BRL";

  let mainDate: string;
  let dateHint: string | null = null;
  if (entry.actualDate) {
    mainDate = entry.actualDate;
    if (entry.spent_at !== entry.actualDate) {
      dateHint = `Fatura: ${formatDate(entry.spent_at)}`;
    }
  } else if (entry.status === "paid" && entry.dueDateRef && entry.dueDateRef !== entry.spent_at) {
    mainDate = entry.spent_at;
    dateHint = `Venceria em ${formatDate(entry.dueDateRef)}`;
  } else {
    mainDate = entry.spent_at;
  }

  const metaParts: string[] = [entry.category];
  if (entry.source === "bill") metaParts[0] = `${entry.category} · Conta`;
  else if (entry.source === "installment" && !isGenericInstallmentCategory) metaParts[0] = `${entry.category} · Parcela`;
  if (entry.payment_method) metaParts.push(entry.payment_method);
  const metaText = metaParts.join(" · ");

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 transition-colors hover:bg-border/30 border-b border-border/20 last:border-0">
      {/* Ícone + descrição — sempre a largura inteira da linha no mobile, coluna fixa no desktop */}
      <div className="flex min-w-0 items-center gap-2 sm:w-64 sm:shrink-0 sm:gap-3">
        <div
          className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${categoryColor}18` }}
        >
          <TypeIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" style={{ color: categoryColor }} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] sm:text-sm font-medium text-text-primary">{entry.description}</p>
          <p className="truncate text-[10px] text-text-secondary mt-0.5">{metaText}</p>
        </div>
      </div>

      {/* Data, valor, status e ações — segunda linha no mobile, resto da linha no desktop */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-1 sm:flex-nowrap sm:gap-3">
        <div className="shrink-0 sm:w-32">
          <p className="text-[12px] sm:text-sm font-medium text-text-primary tabular-nums">{formatDate(mainDate)}</p>
          {dateHint && <p className="truncate text-[9px] text-text-secondary/70">{dateHint}</p>}
        </div>

        <div className="shrink-0 sm:w-28">
          {isDiscounted && entry.scheduledAmount !== undefined && (
            <p className="text-[9px] text-text-secondary/70 line-through">{formatCurrency(entry.scheduledAmount, currencyCode)}</p>
          )}
          <p className="text-[13px] sm:text-sm font-semibold tabular-nums text-expense">{formatCurrency(entry.amount, currencyCode)}</p>
        </div>

        <div className="shrink-0 sm:w-24">
          {isDiscounted ? (
            <Badge variant="paid_with_discount" className="text-[9px] px-1.5 py-0">Desconto</Badge>
          ) : entry.status === "paid" ? (
            entry.source !== "manual" && <Badge variant="paid" className="text-[9px] px-1.5 py-0">Pago</Badge>
          ) : entry.status === "overdue" ? (
            <Badge variant="overdue" className="text-[9px] px-1.5 py-0">Atrasada</Badge>
          ) : entry.status === "pending" ? (
            <Badge variant="pending" className="text-[9px] px-1.5 py-0">Pendente</Badge>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1 ml-auto sm:ml-0">
        {entry.status !== "paid" ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onMarkPaid}
              className="gap-1 border-profit/40 text-profit hover:bg-profit/10"
              title="Marcar como pago"
            >
              <Check className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Pagar</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
              className="text-text-secondary hover:text-text-primary"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              className="text-text-secondary hover:text-expense hover:bg-expense/10"
              title={entry.source === "installment" ? "Excluir parcelamento" : "Excluir conta"}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
              className="text-text-secondary hover:text-text-primary"
              title="Editar pagamento"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {entry.source === "manual" ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                className="text-text-secondary hover:text-expense hover:bg-expense/10"
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onRevert}
                className="text-warning hover:bg-warning/10"
                title="Desfazer pagamento — volta para pendente"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
