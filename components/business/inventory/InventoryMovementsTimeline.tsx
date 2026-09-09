"use client";

import type { BusinessInventoryMovement } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { getMovementMeta, getMovementSign } from "@/lib/business-inventory";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";

type InventoryMovementsTimelineProps = {
  movements: BusinessInventoryMovement[];
};

export function InventoryMovementsTimeline({ movements }: InventoryMovementsTimelineProps) {
  if (movements.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-5 text-sm text-text-secondary">
        Ainda não há movimentações registradas para este produto.
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {movements.map((movement) => {
        const meta = getMovementMeta(movement.movement_type);
        const sign = getMovementSign(movement.quantity_delta);

        return (
          <li key={movement.id} className="rounded-lg border border-border/60 bg-background/45 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-base font-semibold tabular-nums", sign === "+" ? "text-profit" : "text-expense")}>
                    {sign}{Math.abs(movement.quantity_delta)} unidade{Math.abs(movement.quantity_delta) === 1 ? "" : "s"}
                  </p>
                  <Badge variant={meta.tone}>{meta.label}</Badge>
                </div>
                <p className="mt-1 text-sm text-text-secondary">{movement.notes || getReferenceLabel(movement)}</p>
                {movement.reference_id && (
                  <p className="mt-1 text-xs text-text-muted">Ref. {movement.reference_id.slice(0, 8)}</p>
                )}
              </div>
              <div className="shrink-0 text-left sm:text-right">
                <p className="text-sm font-medium text-text-primary">{formatDate(movement.created_at.slice(0, 10))} às {formatTime(movement.created_at)}</p>
                <p className="mt-1 text-xs tabular-nums text-text-secondary">{formatCurrency(movement.total_cost)}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function getReferenceLabel(movement: BusinessInventoryMovement): string {
  if (movement.reference_type === "purchase_order") return "Origem em compra registrada.";
  if (movement.reference_type === "inventory_adjustment") return "Ajuste manual auditável.";
  return "Movimento registrado no ledger.";
}
