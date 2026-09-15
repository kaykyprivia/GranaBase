"use client";

import Link from "next/link";
import { ChevronRight, PackageOpen } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { InventoryStatusBadges } from "@/components/business/inventory/InventoryStatusBadges";
import type { InventoryIntelligenceItem } from "@/lib/business-inventory";
import { cn, formatCurrency } from "@/lib/utils";

type InventoryListProps = {
  items: InventoryIntelligenceItem[];
  emptyAction: () => void;
};

export function InventoryList({ items, emptyAction }: InventoryListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Seu estoque ainda está vazio."
        description="Registre uma compra e confirme o recebimento para adicionar produtos ao estoque."
        actionLabel="Registrar primeira compra"
        onAction={emptyAction}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 lg:hidden">
        {items.map((item) => (
          <InventoryMobileCard key={item.product_id} item={item} />
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border/60 bg-surface lg:block">
        <table className="min-w-[1040px] w-full text-left text-sm">
          <thead className="border-b border-border/60 bg-background/45 text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Produto</th>
              <th className="px-4 py-3 font-semibold">Disponível</th>
              <th className="px-4 py-3 font-semibold">Reservado</th>
              <th className="px-4 py-3 font-semibold">Físico</th>
              <th className="px-4 py-3 font-semibold">A caminho</th>
              <th className="px-4 py-3 font-semibold">Custo médio</th>
              <th className="px-4 py-3 font-semibold">Capital</th>
              <th className="px-4 py-3 font-semibold">Preço de venda</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {items.map((item) => (
              <InventoryTableRow key={item.product_id} item={item} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function InventoryMobileCard({ item }: { item: InventoryIntelligenceItem }) {
  return (
    <article className="rounded-xl border border-border/60 bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-base font-semibold text-text-primary">{item.name}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{item.category_name ?? "Sem categoria"}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{item.sku || item.barcode || "Sem código"}</p>
        </div>
        <p className="shrink-0 text-right text-lg font-bold tabular-nums text-accent">{item.available}</p>
      </div>

      <div className="mt-3">
        <InventoryStatusBadges item={item} />
        <InventoryIntelligenceHint item={item} className="mt-2" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Info label="Disponível" value={String(item.available)} strong />
        <Info label="Reservado" value={String(item.reserved)} />
        <Info label="Físico" value={String(item.on_hand)} />
        <Info label="A caminho" value={String(item.in_transit)} />
        <Info label="Custo médio" value={formatCurrency(item.average_unit_cost)} />
        <Info label="Venda" value={item.default_sale_price !== null ? formatCurrency(item.default_sale_price) : "Sem preço"} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/40 pt-3">
        <div>
          <p className="text-[11px] text-text-muted">Capital</p>
          <p className="font-semibold tabular-nums text-text-primary">{formatCurrency(item.inventory_value)}</p>
        </div>
        <Button asChild size="sm" variant="ghost" className="min-h-10">
          <Link href={`/business/inventory/${item.product_id}`}>
            Ver detalhes
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function InventoryTableRow({ item }: { item: InventoryIntelligenceItem }) {
  return (
    <tr className="transition-colors hover:bg-border/20">
      <td className="px-4 py-3">
        <p className="max-w-52 truncate font-medium text-text-primary">{item.name}</p>
        <p className={cn("text-xs text-text-secondary", !item.active && "text-text-muted")}>
          {item.sku || item.barcode || item.product_id.slice(0, 8)}
        </p>
        <p className="max-w-52 truncate text-xs text-text-muted">
          {item.category_name ?? "Sem categoria"}
        </p>
      </td>
      <td className="px-4 py-3 font-semibold tabular-nums text-accent">{item.available}</td>
      <td className="px-4 py-3 tabular-nums text-text-secondary">{item.reserved}</td>
      <td className="px-4 py-3 tabular-nums text-text-secondary">{item.on_hand}</td>
      <td className="px-4 py-3 tabular-nums text-warning">{item.in_transit}</td>
      <td className="px-4 py-3 tabular-nums text-text-secondary">{formatCurrency(item.average_unit_cost)}</td>
      <td className="px-4 py-3 font-semibold tabular-nums text-text-primary">{formatCurrency(item.inventory_value)}</td>
      <td className="px-4 py-3 tabular-nums text-text-secondary">
        {item.default_sale_price !== null ? formatCurrency(item.default_sale_price) : "-"}
      </td>
      <td className="px-4 py-3">
        <InventoryStatusBadges item={item} />
        <InventoryIntelligenceHint item={item} className="mt-1.5" />
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end">
          <Button asChild size="icon-sm" variant="ghost" aria-label="Ver detalhes do produto">
            <Link href={`/business/inventory/${item.product_id}`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </td>
    </tr>
  );
}

function InventoryIntelligenceHint({
  item,
  className,
}: {
  item: InventoryIntelligenceItem;
  className?: string;
}) {
  const parts: string[] = [];

  if (item.average_daily_outflow > 0 && item.coverage_days !== null) {
    parts.push(`Cobertura: ${formatDays(item.coverage_days)}`);
  }

  if (item.suggested_reorder_quantity > 0) {
    parts.push(`Repor +${item.suggested_reorder_quantity} un.`);
  }

  if (parts.length === 0) return null;

  return (
    <p className={cn("text-[11px] tabular-nums text-text-muted", className)}>
      {parts.join(" · ")}
    </p>
  );
}

function formatDays(value: number): string {
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(1));
  return `${rounded} ${rounded === 1 ? "dia" : "dias"}`;
}

function Info({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={cn("mt-0.5 break-words tabular-nums", strong ? "font-semibold text-text-primary" : "text-text-secondary")}>{value}</p>
    </div>
  );
}
