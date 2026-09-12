"use client";

import Link from "next/link";
import { ChevronRight, PackageCheck, PackageOpen, ReceiptText, Truck, XCircle } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { SaleOrderStatusBadge, SalePaymentStatusBadge } from "@/components/business/sales/SaleStatusBadges";
import { calculatePaymentSummary, calculateSaleFinancials, canCancelSale, getNextSaleAdvanceAction } from "@/lib/business-sales";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import type { SaleRow } from "@/components/business/sales/types";
import type { BusinessSaleOrderStatus } from "@/types/database";

type SalesListProps = {
  sales: SaleRow[];
  emptyAction: () => void;
  onPayment: (sale: SaleRow) => void;
  onAdvance: (sale: SaleRow, nextStatus: Extract<BusinessSaleOrderStatus, "SEPARATED" | "SHIPPED" | "DELIVERED">) => void;
  onCancel: (sale: SaleRow) => void;
};

export function SalesList({ sales, emptyAction, onPayment, onAdvance, onCancel }: SalesListProps) {
  if (sales.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Voce ainda nao registrou nenhuma venda."
        description="Registre a primeira venda para reservar estoque, acompanhar pagamentos e controlar entrega."
        actionLabel="Registrar primeira venda"
        onAction={emptyAction}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 lg:hidden">
        {sales.map((sale) => (
          <SaleMobileCard
            key={sale.id}
            sale={sale}
            onPayment={onPayment}
            onAdvance={onAdvance}
            onCancel={onCancel}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border/60 bg-surface lg:block">
        <table className="min-w-[1080px] w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/45 text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Venda</th>
              <th className="px-4 py-3 font-semibold">Produtos</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Pago</th>
              <th className="px-4 py-3 font-semibold">Data</th>
              <th className="px-4 py-3 font-semibold">Pedido</th>
              <th className="px-4 py-3 font-semibold">Pagamento</th>
              <th className="px-4 py-3 font-semibold">Lucro</th>
              <th className="px-4 py-3 text-right font-semibold">Acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {sales.map((sale) => (
              <SaleTableRow
                key={sale.id}
                sale={sale}
                onPayment={onPayment}
                onAdvance={onAdvance}
                onCancel={onCancel}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SaleMobileCard({ sale, onPayment, onAdvance, onCancel }: Omit<SalesListProps, "sales" | "emptyAction"> & { sale: SaleRow }) {
  const financials = getSaleFinancials(sale);
  const total = financials.netRevenue;
  const netProfit = financials.netProfit;
  const payment = calculatePaymentSummary({ totalAmount: total, payments: sale.payments });
  const action = getNextSaleAdvanceAction(sale.order_status);

  return (
    <article className="rounded-xl border border-border/60 bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold text-text-primary">
            {`Venda #${sale.sale_number}`}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{describeItems(sale)}</p>
        </div>
        <p className="shrink-0 text-right text-base font-bold tabular-nums text-accent">{formatCurrency(total)}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="Pedido" value={<SaleOrderStatusBadge status={sale.order_status} />} />
        <Info label="Pagamento" value={<SalePaymentStatusBadge status={sale.payment_status} />} />
        <Info label="Pago" value={formatCurrency(payment.netPaidAmount)} />
        <Info label="Restante" value={formatCurrency(payment.remainingAmount)} strong={payment.remainingAmount > 0} />
        <Info label="Lucro liquido" value={formatCurrency(netProfit)} strong />
        <Info label="Data" value={`${formatDate(sale.sale_date.slice(0, 10))} às ${formatTime(sale.sale_date)}`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
        {payment.remainingAmount > 0 && !["CANCELLED", "RETURNED"].includes(sale.order_status) && (
          <Button type="button" size="sm" variant="profit" onClick={() => onPayment(sale)}>
            <ReceiptText className="h-4 w-4" />
            Pagamento
          </Button>
        )}
        {action && (
          <Button type="button" size="sm" variant="outline" onClick={() => onAdvance(sale, action.nextStatus)}>
            <Truck className="h-4 w-4" />
            {shortActionLabel(action.label)}
          </Button>
        )}
        {canCancelSale(sale.order_status) && (
          <Button type="button" size="sm" variant="ghost" className="hover:text-expense" onClick={() => onCancel(sale)}>
            <XCircle className="h-4 w-4" />
            Cancelar
          </Button>
        )}
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link href={`/business/sales/${sale.id}`}>
            Detalhes
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function SaleTableRow({ sale, onPayment, onAdvance, onCancel }: Omit<SalesListProps, "sales" | "emptyAction"> & { sale: SaleRow }) {
  const financials = getSaleFinancials(sale);
  const total = financials.netRevenue;
  const netProfit = financials.netProfit;
  const payment = calculatePaymentSummary({ totalAmount: total, payments: sale.payments });
  const action = getNextSaleAdvanceAction(sale.order_status);

  return (
    <tr className="transition-colors hover:bg-border/20">
      <td className="px-4 py-3">
        <p className="font-medium text-text-primary">{sale.customer?.name ?? "Cliente nao informado"}</p>
        <p className="text-xs text-text-secondary">Venda #{sale.sale_number}</p>
      </td>
      <td className="px-4 py-3">
        <p className="max-w-56 truncate text-text-secondary">{describeItems(sale)}</p>
      </td>
      <td className="px-4 py-3 font-semibold tabular-nums text-text-primary">{formatCurrency(total)}</td>
      <td className="px-4 py-3">
        <p className="font-medium tabular-nums text-text-primary">{formatCurrency(payment.netPaidAmount)}</p>
        <p className={cn("text-xs tabular-nums", payment.remainingAmount > 0 ? "text-warning" : "text-text-secondary")}>
          resta {formatCurrency(payment.remainingAmount)}
        </p>
      </td>
      <td className="px-4 py-3 text-text-secondary">{formatDate(sale.sale_date.slice(0, 10))}</td>
      <td className="px-4 py-3"><SaleOrderStatusBadge status={sale.order_status} /></td>
      <td className="px-4 py-3"><SalePaymentStatusBadge status={sale.payment_status} /></td>
      <td className={cn("px-4 py-3 font-semibold tabular-nums", netProfit < 0 ? "text-expense" : "text-profit")}>
        {formatCurrency(netProfit)}
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          {payment.remainingAmount > 0 && !["CANCELLED", "RETURNED"].includes(sale.order_status) && (
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Registrar pagamento" onClick={() => onPayment(sale)}>
              <ReceiptText className="h-4 w-4 text-profit" />
            </Button>
          )}
          {action && (
            <Button type="button" size="icon-sm" variant="ghost" aria-label={action.label} onClick={() => onAdvance(sale, action.nextStatus)}>
              <PackageCheck className="h-4 w-4 text-accent" />
            </Button>
          )}
          {canCancelSale(sale.order_status) && (
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Cancelar venda" onClick={() => onCancel(sale)}>
              <XCircle className="h-4 w-4 text-expense" />
            </Button>
          )}
          <Button asChild size="icon-sm" variant="ghost" aria-label="Ver detalhes">
            <Link href={`/business/sales/${sale.id}`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}

function Info({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <div className={cn("mt-0.5 break-words tabular-nums", strong ? "font-semibold text-text-primary" : "text-text-secondary")}>
        {value}
      </div>
    </div>
  );
}

function getSaleFinancials(sale: SaleRow) {
  return calculateSaleFinancials({
    items: sale.items,
    returns: sale.returns ?? [],
    returnItems: sale.returnItems ?? [],
  });
}

function describeItems(sale: SaleRow): string {
  if (sale.items.length === 0) return "Sem produtos";
  return sale.items
    .slice(0, 3)
    .map((item) => `${item.quantity}x ${item.product?.name ?? "Produto"}`)
    .join(", ") + (sale.items.length > 3 ? ` +${sale.items.length - 3}` : "");
}

function shortActionLabel(label: string): string {
  return label.replace("Marcar como ", "");
}
