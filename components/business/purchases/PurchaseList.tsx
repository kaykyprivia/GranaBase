"use client";

import Link from "next/link";
import {
  ChevronRight,
  PackageCheck,
  PackageOpen,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  cn,
  formatCurrency,
  formatDate,
} from "@/lib/utils";
import {
  canCancelPurchase,
  canReceivePurchase,
  getPurchaseReceiptState,
} from "@/lib/business-purchases";
import { PurchaseStatusBadge } from "@/components/business/purchases/PurchaseStatusBadge";
import type { PurchaseRow } from "@/components/business/purchases/types";

interface PurchaseListProps {
  purchases: PurchaseRow[];
  emptyAction: () => void;
  onReceive: (purchase: PurchaseRow) => void;
  onCancel: (purchase: PurchaseRow) => void;
}

export function PurchaseList({
  purchases,
  emptyAction,
  onReceive,
  onCancel,
}: PurchaseListProps) {
  if (purchases.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Você ainda não registrou nenhuma compra."
        description="Registre a primeira compra para acompanhar chegada, recebimento e entrada no estoque."
        actionLabel="Registrar primeira compra"
        onAction={emptyAction}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 lg:hidden">
        {purchases.map((purchase) => (
          <PurchaseMobileCard
            key={purchase.id}
            purchase={purchase}
            onReceive={onReceive}
            onCancel={onCancel}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border/60 bg-surface lg:block">
        <table className="min-w-[920px] w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/45 text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Produtos</th>
              <th className="px-4 py-3 font-semibold">Quantidade</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Compra</th>
              <th className="px-4 py-3 font-semibold">Chegada</th>
              <th className="px-4 py-3 font-semibold">Recebido</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Ação</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border/40">
            {purchases.map((purchase) => (
              <PurchaseTableRow
                key={purchase.id}
                purchase={purchase}
                onReceive={onReceive}
                onCancel={onCancel}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PurchaseMobileCard({
  purchase,
  onReceive,
  onCancel,
}: {
  purchase: PurchaseRow;
  onReceive: (purchase: PurchaseRow) => void;
  onCancel: (purchase: PurchaseRow) => void;
}) {
  const summary = getPurchaseItemsSummary(purchase);

  const receipt = summary.totalOrdered > 0
    ? getPurchaseReceiptState({
        quantityOrdered: summary.totalOrdered,
        quantityReceived: summary.totalReceived,
      })
    : null;

  const canReceive =
    summary.totalOrdered > 0 &&
    canReceivePurchase(
      purchase.status,
      summary.totalOrdered,
      summary.totalReceived
    );

  const canCancel = canCancelPurchase(
    purchase.status,
    summary.totalReceived
  );

  return (
    <article className="rounded-xl border border-border/60 bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold text-text-primary">
            {summary.title}
          </h2>

          <p className="mt-0.5 text-xs text-text-secondary">
            {summary.subtitle}
          </p>
        </div>

        <PurchaseStatusBadge status={purchase.status} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info
          label="Quantidade"
          value={`${summary.totalOrdered} unidades`}
        />

        <Info
          label="Total"
          value={formatCurrency(purchase.total_cost)}
          strong
        />

        <Info
          label="Compra"
          value={formatDate(purchase.purchase_date)}
        />

        <Info
          label="Chegada prevista"
          value={
            purchase.expected_arrival_date
              ? formatDate(purchase.expected_arrival_date)
              : "Sem previsão"
          }
        />
      </div>

      {receipt && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-text-secondary">
              Recebido
            </span>

            <span className="font-semibold text-text-primary">
              {receipt.received} de {receipt.ordered}
            </span>
          </div>

          <Progress
            value={receipt.progress}
            className="h-2"
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canReceive && (
          <Button
            type="button"
            size="sm"
            variant="profit"
            onClick={() => onReceive(purchase)}
          >
            <PackageCheck className="h-4 w-4" />
            Receber
          </Button>
        )}

        {canCancel && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="hover:text-expense"
            onClick={() => onCancel(purchase)}
          >
            <XCircle className="h-4 w-4" />
            Cancelar
          </Button>
        )}

        <Button
          asChild
          size="sm"
          variant="ghost"
          className="ml-auto"
        >
          <Link
            href={`/business/purchases/${purchase.id}`}
          >
            Ver detalhes
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function PurchaseTableRow({
  purchase,
  onReceive,
  onCancel,
}: {
  purchase: PurchaseRow;
  onReceive: (purchase: PurchaseRow) => void;
  onCancel: (purchase: PurchaseRow) => void;
}) {
  const summary = getPurchaseItemsSummary(purchase);

  const receipt = summary.totalOrdered > 0
    ? getPurchaseReceiptState({
        quantityOrdered: summary.totalOrdered,
        quantityReceived: summary.totalReceived,
      })
    : null;

  const canReceive =
    summary.totalOrdered > 0 &&
    canReceivePurchase(
      purchase.status,
      summary.totalOrdered,
      summary.totalReceived
    );

  const canCancel = canCancelPurchase(
    purchase.status,
    summary.totalReceived
  );

  return (
    <tr className="transition-colors hover:bg-border/20">
      <td className="px-4 py-3">
        <p className="font-medium text-text-primary">
          {summary.title}
        </p>

        <p className="text-xs text-text-secondary">
          {purchase.origin || summary.subtitle}
        </p>
      </td>

      <td className="px-4 py-3 tabular-nums text-text-secondary">
        {summary.totalOrdered}
      </td>

      <td className="px-4 py-3 font-semibold tabular-nums text-text-primary">
        {formatCurrency(purchase.total_cost)}
      </td>

      <td className="px-4 py-3 text-text-secondary">
        {formatDate(purchase.purchase_date)}
      </td>

      <td className="px-4 py-3 text-text-secondary">
        {purchase.expected_arrival_date
          ? formatDate(purchase.expected_arrival_date)
          : "Sem previsão"}
      </td>

      <td className="px-4 py-3">
        {receipt ? (
          <div className="min-w-28">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-text-secondary">
                {receipt.received}/{receipt.ordered}
              </span>

              <span className="text-text-muted">
                {receipt.progress}%
              </span>
            </div>

            <Progress
              value={receipt.progress}
              className="h-1.5"
            />
          </div>
        ) : (
          <span className="text-text-muted">-</span>
        )}
      </td>

      <td className="px-4 py-3">
        <PurchaseStatusBadge status={purchase.status} />
      </td>

      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          {canReceive && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Registrar recebimento"
              onClick={() => onReceive(purchase)}
            >
              <PackageCheck className="h-4 w-4 text-profit" />
            </Button>
          )}

          {canCancel && (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Cancelar compra"
              onClick={() => onCancel(purchase)}
            >
              <XCircle className="h-4 w-4 text-expense" />
            </Button>
          )}

          <Button
            asChild
            size="icon-sm"
            variant="ghost"
            aria-label="Ver detalhes"
          >
            <Link
              href={`/business/purchases/${purchase.id}`}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}

function getPurchaseItemsSummary(
  purchase: PurchaseRow
) {
  const totalOrdered = purchase.items.reduce(
    (sum, { item }) =>
      sum + item.quantity_ordered,
    0
  );

  const totalReceived = purchase.items.reduce(
    (sum, { item }) =>
      sum + item.quantity_received,
    0
  );

  const primaryLine = purchase.items[0];

  const primaryName =
    primaryLine?.product?.name ??
    "Produto não encontrado";

  const extraProducts = Math.max(
    purchase.items.length - 1,
    0
  );

  const title =
    extraProducts > 0
      ? `${primaryName} + ${extraProducts} ${
          extraProducts === 1
            ? "produto"
            : "produtos"
        }`
      : primaryName;

  const subtitle =
    purchase.items.length > 1
      ? `${purchase.items.length} produtos no pedido`
      : primaryLine?.product?.sku ||
        "Sem SKU informado";

  return {
    totalOrdered,
    totalReceived,
    title,
    subtitle,
  };
}

function Info({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted">
        {label}
      </p>

      <p
        className={cn(
          "mt-0.5 break-words",
          strong
            ? "font-semibold text-text-primary"
            : "text-text-secondary"
        )}
      >
        {value}
      </p>
    </div>
  );
}
