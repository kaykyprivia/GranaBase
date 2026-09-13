"use client";

import { useEffect, useMemo, useState } from "react";
import { PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { FormField } from "@/components/shared/FormField";
import {
  getPurchaseReceiptState,
  validateReceiveQuantity,
} from "@/lib/business-purchases";
import type {
  PurchaseReceiptInput,
  PurchaseRow,
} from "@/components/business/purchases/types";

interface ReceivePurchaseDialogProps {
  purchase: PurchaseRow | null;
  open: boolean;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (items: PurchaseReceiptInput[]) => Promise<void>;
}

export function ReceivePurchaseDialog({
  purchase,
  open,
  loading,
  onOpenChange,
  onConfirm,
}: ReceivePurchaseDialogProps) {
  const pendingLines = useMemo(
    () =>
      (purchase?.items ?? []).filter(
        ({ item }) =>
          item.quantity_received < item.quantity_ordered
      ),
    [purchase]
  );

  const [quantities, setQuantities] = useState<
    Record<string, number>
  >({});

  const [errors, setErrors] = useState<
    Record<string, string>
  >({});

  const [formError, setFormError] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const next: Record<string, number> = {};

    for (const { item } of pendingLines) {
      next[item.id] =
        item.quantity_ordered -
        item.quantity_received;
    }

    setQuantities(next);
    setErrors({});
    setFormError(null);
  }, [open, pendingLines]);

  const totalPending = pendingLines.reduce(
    (sum, { item }) =>
      sum +
      (item.quantity_ordered -
        item.quantity_received),
    0
  );

  const totalSelected = pendingLines.reduce(
    (sum, { item }) =>
      sum + (quantities[item.id] ?? 0),
    0
  );

  const receiveAll = () => {
    const next: Record<string, number> = {};

    for (const { item } of pendingLines) {
      next[item.id] =
        item.quantity_ordered -
        item.quantity_received;
    }

    setQuantities(next);
    setErrors({});
    setFormError(null);
  };

  const handleConfirm = async () => {
    if (!purchase) {
      return;
    }

    const nextErrors: Record<string, string> = {};
    const payload: PurchaseReceiptInput[] = [];

    for (const { item } of pendingLines) {
      const quantity = quantities[item.id] ?? 0;

      if (quantity === 0) {
        continue;
      }

      const error = validateReceiveQuantity({
        status: purchase.status,
        quantityOrdered: item.quantity_ordered,
        quantityReceived: item.quantity_received,
        incomingQuantity: quantity,
      });

      if (error) {
        nextErrors[item.id] = error;
        continue;
      }

      payload.push({
        purchase_item_id: item.id,
        quantity,
      });
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (payload.length === 0) {
      setFormError(
        "Informe pelo menos uma quantidade para receber."
      );
      return;
    }

    setFormError(null);
    await onConfirm(payload);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-profit/15 p-2.5 text-profit">
              <PackageCheck className="h-5 w-5" />
            </div>

            <div>
              <DialogTitle>
                Registrar recebimento
              </DialogTitle>

              <DialogDescription>
                Informe quanto chegou de cada produto desta compra.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {purchase && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
              <div>
                <p className="text-xs text-text-muted">
                  Pendente no pedido
                </p>

                <p className="mt-0.5 font-semibold tabular-nums text-text-primary">
                  {totalPending} unidades
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-text-muted">
                  Receber agora
                </p>

                <p className="mt-0.5 font-semibold tabular-nums text-profit">
                  {totalSelected} unidades
                </p>
              </div>

              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={receiveAll}
                disabled={loading}
              >
                Receber tudo
              </Button>
            </div>

            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {pendingLines.map(
                ({ item, product }) => {
                  const receipt =
                    getPurchaseReceiptState({
                      quantityOrdered:
                        item.quantity_ordered,
                      quantityReceived:
                        item.quantity_received,
                    });

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-border/60 bg-background/35 p-4"
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-text-primary">
                            {product?.name ??
                              "Produto não encontrado"}
                          </p>

                          {product?.sku && (
                            <p className="mt-0.5 text-xs text-text-secondary">
                              {product.sku}
                            </p>
                          )}
                        </div>

                        <p className="shrink-0 text-xs font-semibold tabular-nums text-text-secondary">
                          {receipt.received} /{" "}
                          {receipt.ordered}
                        </p>
                      </div>

                      <Progress
                        value={receipt.progress}
                        className="mb-3 h-2"
                      />

                      <div className="grid gap-3 sm:grid-cols-[1fr_180px] sm:items-end">
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <MiniStat
                            label="Comprado"
                            value={receipt.ordered}
                          />
                          <MiniStat
                            label="Recebido"
                            value={receipt.received}
                          />
                          <MiniStat
                            label="Faltando"
                            value={receipt.remaining}
                          />
                        </div>

                        <FormField
                          label="Chegou agora"
                          error={errors[item.id]}
                        >
                          <Input
                            type="number"
                            min={0}
                            max={receipt.remaining}
                            step={1}
                            inputMode="numeric"
                            value={
                              quantities[item.id] ?? ""
                            }
                            error={errors[item.id]}
                            onChange={(event) => {
                              setQuantities(
                                (current) => ({
                                  ...current,
                                  [item.id]: Number(
                                    event.target
                                      .value || 0
                                  ),
                                })
                              );

                              setErrors((current) => {
                                const next = { ...current };
                                delete next[item.id];
                                return next;
                              });

                              setFormError(null);
                            }}
                          />
                        </FormField>
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {pendingLines.length === 0 && (
              <p className="rounded-xl border border-profit/30 bg-profit/10 p-4 text-sm text-profit">
                Todos os produtos desta compra já foram recebidos.
              </p>
            )}

            {formError && (
              <p className="text-xs text-expense">
                {formError}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onOpenChange(false)
            }
            disabled={loading}
          >
            Cancelar
          </Button>

          <Button
            type="button"
            variant="profit"
            loading={loading}
            disabled={
              loading ||
              pendingLines.length === 0
            }
            onClick={handleConfirm}
          >
            Confirmar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <p className="text-[10px] text-text-muted">
        {label}
      </p>

      <p className="mt-0.5 font-semibold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}
