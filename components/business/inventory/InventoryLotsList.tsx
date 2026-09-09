"use client";

import { PackageOpen } from "lucide-react";
import type { InventoryLotWithOrigin } from "@/components/business/inventory/types";
import { formatCurrency, formatDate } from "@/lib/utils";

type InventoryLotsListProps = {
  lots: InventoryLotWithOrigin[];
};

export function InventoryLotsList({ lots }: InventoryLotsListProps) {
  if (lots.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-5 text-sm text-text-secondary">
        Nenhum lote com histórico para este produto.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {lots.map((lot, index) => (
        <article key={lot.id} className="rounded-lg border border-border/60 bg-background/45 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-text-primary">Lote #{index + 1}</h3>
              <p className="mt-0.5 truncate text-xs text-text-secondary">{lot.origin || "Origem manual"}</p>
            </div>
            <PackageOpen className="h-4 w-4 shrink-0 text-accent" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Recebido" value={formatDate(lot.received_at.slice(0, 10))} />
            <Info label="Original" value={String(lot.received_quantity)} />
            <Info label="Restante" value={String(lot.remaining_quantity)} />
            <Info label="Reservado" value={String(lot.reserved_quantity)} />
            <Info label="Custo" value={`${formatCurrency(lot.unit_cost)}/un.`} />
            <Info label="Compra" value={lot.purchase_order_id ? lot.purchase_order_id.slice(0, 8) : "Ajuste"} />
          </div>
        </article>
      ))}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="mt-0.5 break-words font-medium tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
