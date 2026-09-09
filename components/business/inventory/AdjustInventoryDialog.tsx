"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessInventoryMovementType } from "@/types/database";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getSignedAdjustmentQuantity,
  validateInventoryAdjustment,
  type InventoryAdjustmentErrors,
  type InventoryItem,
} from "@/lib/business-inventory";
import { formatCurrency } from "@/lib/utils";

type AdjustInventoryDialogProps = {
  open: boolean;
  products: InventoryItem[];
  selectedProductId?: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: {
    productId: string;
    quantityDelta: number;
    movementType: BusinessInventoryMovementType;
    reason: string;
    unitCost?: number;
  }) => Promise<void>;
};

const outputTypes: Array<{ value: BusinessInventoryMovementType; label: string }> = [
  { value: "ADJUSTMENT_OUT", label: "Correção de contagem" },
  { value: "LOSS", label: "Perda" },
  { value: "DAMAGED", label: "Avaria" },
];

export function AdjustInventoryDialog({
  open,
  products,
  selectedProductId,
  loading,
  onOpenChange,
  onConfirm,
}: AdjustInventoryDialogProps) {
  const [productId, setProductId] = useState(selectedProductId ?? "");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [movementType, setMovementType] = useState<BusinessInventoryMovementType>("ADJUSTMENT_OUT");
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState("");
  const [unitCost, setUnitCost] = useState(0);
  const [errors, setErrors] = useState<InventoryAdjustmentErrors>({});

  useEffect(() => {
    if (open) {
      setProductId(selectedProductId ?? products[0]?.product_id ?? "");
      setDirection("out");
      setMovementType("ADJUSTMENT_OUT");
      setQuantity(1);
      setReason("");
      setUnitCost(0);
      setErrors({});
    }
  }, [open, products, selectedProductId]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.product_id === productId) ?? null,
    [productId, products]
  );
  const quantityDelta = getSignedAdjustmentQuantity({ direction, quantity });
  const confirmationText = selectedProduct
    ? `${direction === "in" ? "Você está adicionando" : "Você está removendo"} ${quantity} unidade${quantity === 1 ? "" : "s"} de ${selectedProduct.name}${reason.trim() ? ` por ${reason.trim()}` : ""}.`
    : "Selecione um produto para ajustar o estoque.";

  function handleDirectionChange(value: "in" | "out") {
    setDirection(value);
    setMovementType(value === "in" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT");
    setErrors({});
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct) return;

    const nextErrors = validateInventoryAdjustment({
      productId,
      direction,
      movementType,
      quantity,
      reason,
      unitCost,
      availableQuantity: selectedProduct.available,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    await onConfirm({
      productId,
      quantityDelta,
      movementType,
      reason: reason.trim(),
      unitCost: direction === "in" ? unitCost : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar estoque</DialogTitle>
          <DialogDescription>
            Registre somente movimentos excepcionais. Compras e vendas continuam nos fluxos próprios.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormField label="Produto" required error={errors.productId}>
            <Select value={productId} onValueChange={setProductId} disabled={loading || products.length === 0}>
              <SelectTrigger error={errors.productId} className="min-h-11" aria-label="Produto">
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.product_id} value={product.product_id}>
                    {product.name} {product.sku ? `- ${product.sku}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Movimento" required>
              <Select value={direction} onValueChange={(value) => handleDirectionChange(value as "in" | "out")} disabled={loading}>
                <SelectTrigger className="min-h-11" aria-label="Movimento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Entrada</SelectItem>
                  <SelectItem value="out">Saída</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Tipo" required error={errors.movementType}>
              <Select value={movementType} onValueChange={(value) => setMovementType(value as BusinessInventoryMovementType)} disabled={loading || direction === "in"}>
                <SelectTrigger error={errors.movementType} className="min-h-11" aria-label="Tipo de ajuste">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {direction === "in" ? (
                    <SelectItem value="ADJUSTMENT_IN">Correção de contagem</SelectItem>
                  ) : (
                    outputTypes.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Quantidade" required error={errors.quantity}>
              <Input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value))}
                error={errors.quantity}
                className="min-h-11"
                disabled={loading}
              />
            </FormField>

            {direction === "in" && (
              <FormField label="Custo unitário real" required error={errors.unitCost}>
                <CurrencyInput
                  value={unitCost}
                  onChange={setUnitCost}
                  error={errors.unitCost}
                  className="min-h-11"
                  disabled={loading}
                />
              </FormField>
            )}
          </div>

          {selectedProduct && (
            <div className="rounded-lg border border-border/50 bg-background/50 px-3 py-2 text-xs text-text-secondary">
              Disponível agora: <span className="font-semibold text-text-primary">{selectedProduct.available}</span>
              {direction === "in" && unitCost > 0 && (
                <> · Capital adicionado: <span className="font-semibold text-text-primary">{formatCurrency(quantity * unitCost)}</span></>
              )}
            </div>
          )}

          <FormField label="Motivo" required error={errors.reason}>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ex.: avaria na conferência, correção de contagem..."
              error={errors.reason}
              disabled={loading}
              maxLength={180}
            />
          </FormField>

          <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">{confirmationText}</p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading} disabled={products.length === 0}>
              Confirmar ajuste
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
