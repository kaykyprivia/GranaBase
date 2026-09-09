"use client";

import { useEffect, useState } from "react";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { FormField } from "@/components/shared/FormField";
import { getPurchaseReceiptState, validateReceiveQuantity } from "@/lib/business-purchases";
import type { PurchaseRow } from "@/components/business/purchases/types";

interface ReceivePurchaseDialogProps {
  purchase: PurchaseRow | null;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (quantity: number) => Promise<void>;
}

export function ReceivePurchaseDialog({
  purchase,
  open,
  loading,
  onOpenChange,
  onConfirm,
}: ReceivePurchaseDialogProps) {
  const receipt = purchase?.item
    ? getPurchaseReceiptState({
        quantityOrdered: purchase.item.quantity_ordered,
        quantityReceived: purchase.item.quantity_received,
      })
    : null;
  const [quantity, setQuantity] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const remainingToReceive = receipt?.remaining ?? 0;

  useEffect(() => {
    if (open && remainingToReceive > 0) {
      setQuantity(remainingToReceive);
      setError(null);
    }
  }, [open, remainingToReceive]);

  const handleConfirm = async () => {
    if (!purchase?.item) {
      return;
    }

    const nextError = validateReceiveQuantity({
      status: purchase.status,
      quantityOrdered: purchase.item.quantity_ordered,
      quantityReceived: purchase.item.quantity_received,
      incomingQuantity: quantity,
    });

    setError(nextError);
    if (nextError) {
      return;
    }

    await onConfirm(quantity);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-profit/15 p-2.5 text-profit">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Registrar recebimento</DialogTitle>
              <DialogDescription>Informe quantas unidades chegaram agora.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {purchase && receipt && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-text-primary">{purchase.product?.name ?? "Produto"}</p>
                <p className="text-xs font-semibold text-text-secondary">{receipt.received} / {receipt.ordered}</p>
              </div>
              <Progress value={receipt.progress} className="h-2" />
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <MiniStat label="Comprado" value={receipt.ordered} />
                <MiniStat label="Recebido" value={receipt.received} />
                <MiniStat label="Faltando" value={receipt.remaining} />
              </div>
            </div>

            <FormField label="Quantidade recebida agora" error={error ?? undefined} required>
              <Input
                type="number"
                min={1}
                max={receipt.remaining}
                step={1}
                inputMode="numeric"
                value={quantity || ""}
                error={error ?? undefined}
                onChange={(event) => {
                  setQuantity(Number(event.target.value || 0));
                  setError(null);
                }}
              />
            </FormField>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" variant="profit" loading={loading} onClick={handleConfirm}>
            Confirmar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <p className="text-[10px] text-text-muted">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
