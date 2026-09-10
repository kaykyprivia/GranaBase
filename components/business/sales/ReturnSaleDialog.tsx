"use client";

import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { calculatePaymentSummary } from "@/lib/business-sales";
import { cn, formatCurrency } from "@/lib/utils";
import type { SaleDetail, SaleItemRow } from "@/components/business/sales/types";

type ReturnDraft = {
  saleItemId: string;
  quantity: number;
  restockable: boolean;
};

type ReturnSaleDialogProps = {
  open: boolean;
  sale: SaleDetail | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { items: ReturnDraft[]; refundAmount: number; notes?: string }) => Promise<void>;
};

export function ReturnSaleDialog({ open, sale, loading, onOpenChange, onConfirm }: ReturnSaleDialogProps) {
  const returnableItems = useMemo(
    () => (sale?.items ?? []).filter((item) => getReturnableQuantity(item) > 0),
    [sale?.items]
  );
  const [items, setItems] = useState<ReturnDraft[]>([]);
  const [refundAmount, setRefundAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const total = useMemo(() => sale?.items.reduce((sum, item) => sum + item.final_amount, 0) ?? 0, [sale?.items]);
  const payment = useMemo(
    () => calculatePaymentSummary({ totalAmount: total, payments: sale?.payments ?? [] }),
    [sale?.payments, total]
  );
  const selectedQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const refundError = refundAmount > payment.refundableAmount ? "Reembolso acima do valor pago disponivel." : null;

  useEffect(() => {
    if (open) {
      setItems([]);
      setRefundAmount(0);
      setNotes("");
    }
  }, [open]);

  function updateItem(item: SaleItemRow, patch: Partial<ReturnDraft>) {
    setItems((current) => {
      const existing = current.find((draft) => draft.saleItemId === item.id);
      const next = {
        saleItemId: item.id,
        quantity: existing?.quantity ?? 0,
        restockable: existing?.restockable ?? true,
        ...patch,
      };
      const max = getReturnableQuantity(item);
      next.quantity = Math.min(Math.max(Math.trunc(next.quantity), 0), max);
      const others = current.filter((draft) => draft.saleItemId !== item.id);
      return next.quantity > 0 ? [...others, next] : others;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/20 p-2 text-warning">
              <RotateCcw className="h-5 w-5" />
            </div>
            <DialogTitle>Registrar devolucao</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {returnableItems.length === 0 ? (
            <p className="rounded-xl border border-border/60 bg-background/35 p-4 text-sm text-text-secondary">
              Nao ha saldo disponivel para devolucao nesta venda.
            </p>
          ) : (
            <div className="space-y-3">
              {returnableItems.map((item) => {
                const draft = items.find((entry) => entry.saleItemId === item.id);
                const max = getReturnableQuantity(item);
                return (
                  <div key={item.id} className="rounded-xl border border-border/60 bg-background/35 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary">{item.product?.name ?? "Produto"}</p>
                        <p className="text-xs text-text-secondary">Disponivel para devolucao: {max} de {item.quantity}</p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">{formatCurrency(item.final_amount)}</p>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr]">
                      <div className="space-y-1.5">
                        <Label htmlFor={`return-${item.id}`}>Quantidade</Label>
                        <Input
                          id={`return-${item.id}`}
                          type="number"
                          min={0}
                          max={max}
                          step={1}
                          inputMode="numeric"
                          value={draft?.quantity ?? 0}
                          onChange={(event) => updateItem(item, { quantity: Number(event.target.value || 0) })}
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => updateItem(item, { restockable: !(draft?.restockable ?? true), quantity: draft?.quantity ?? 1 })}
                          className={cn(
                            "min-h-10 w-full rounded-lg border px-3 text-sm font-medium transition-colors",
                            (draft?.restockable ?? true)
                              ? "border-profit/30 bg-profit/10 text-profit"
                              : "border-warning/30 bg-warning/10 text-warning"
                          )}
                        >
                          {(draft?.restockable ?? true) ? "Volta para o estoque" : "Nao volta para o estoque"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sale-refund-amount">Reembolso</Label>
              <CurrencyInput id="sale-refund-amount" value={refundAmount} onChange={setRefundAmount} error={refundError ?? undefined} />
              <p className="text-xs text-text-secondary">Maximo: {formatCurrency(payment.refundableAmount)}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-return-notes">Observacao</Label>
              <Textarea id="sale-return-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={loading}
            disabled={selectedQuantity <= 0 || Boolean(refundError)}
            onClick={() => onConfirm({ items, refundAmount, notes })}
          >
            Registrar devolucao
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getReturnableQuantity(item: SaleItemRow): number {
  return Math.max(item.quantity - item.returnedQuantity, 0);
}
