"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import { calculatePurchasePreview, validatePurchaseForm } from "@/lib/business-purchases";
import { formatCurrency } from "@/lib/utils";
import type { PurchaseDetail, PurchaseRow } from "@/components/business/purchases/types";
import type { PurchaseFormDraft, PurchaseFormErrors } from "@/lib/business-purchases";

interface EditPurchaseDialogProps {
  open: boolean;
  purchase: PurchaseDetail | PurchaseRow | null;
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (draft: PurchaseFormDraft) => Promise<void> | void;
}

const today = new Date().toISOString().slice(0, 10);

export function EditPurchaseDialog({ open, purchase, loading, onOpenChange, onConfirm }: EditPurchaseDialogProps) {
  const [draft, setDraft] = useState<PurchaseFormDraft>(() => buildDraft(purchase));
  const [errors, setErrors] = useState<PurchaseFormErrors>({});

  useEffect(() => {
    if (open) {
      setDraft(buildDraft(purchase));
      setErrors({});
    }
  }, [open, purchase]);

  const preview = useMemo(() => calculatePurchasePreview(draft), [draft]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validatePurchaseForm(draft, "existing");
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    await onConfirm(draft);
  };

  const productName = purchase?.product?.name ?? "Produto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar compra</DialogTitle>
          <DialogDescription>{productName}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Quantidade" error={errors.quantity} required>
              <Input
                type="number"
                min={1}
                step={1}
                value={draft.quantity || ""}
                onChange={(event) => setDraft((current) => ({ ...current, quantity: Number(event.target.value) }))}
              />
            </FormField>

            <FormField label="Mercadoria" error={errors.productSubtotal} required>
              <CurrencyInput
                value={draft.productSubtotal}
                onChange={(value) => setDraft((current) => ({ ...current, productSubtotal: value }))}
                error={errors.productSubtotal}
              />
            </FormField>

            <FormField label="Frete" error={errors.shippingCost}>
              <CurrencyInput
                value={draft.shippingCost ?? 0}
                onChange={(value) => setDraft((current) => ({ ...current, shippingCost: value }))}
                error={errors.shippingCost}
              />
            </FormField>

            <FormField label="Outros custos" error={errors.additionalCosts}>
              <CurrencyInput
                value={draft.additionalCosts ?? 0}
                onChange={(value) => setDraft((current) => ({ ...current, additionalCosts: value }))}
                error={errors.additionalCosts}
              />
            </FormField>

            <FormField label="Data da compra" error={errors.purchaseDate} required>
              <Input
                type="date"
                value={draft.purchaseDate}
                onChange={(event) => setDraft((current) => ({ ...current, purchaseDate: event.target.value }))}
              />
            </FormField>

            <FormField label="Chegada prevista">
              <Input
                type="date"
                value={draft.expectedArrivalDate ?? ""}
                onChange={(event) => setDraft((current) => ({ ...current, expectedArrivalDate: event.target.value }))}
              />
            </FormField>
          </div>

          <FormField label="Origem">
            <Input
              value={draft.origin ?? ""}
              placeholder="Fornecedor, canal ou marketplace"
              onChange={(event) => setDraft((current) => ({ ...current, origin: event.target.value }))}
            />
          </FormField>

          <FormField label="Observações">
            <Textarea
              value={draft.notes ?? ""}
              placeholder="Condições, rastreio ou detalhes operacionais"
              onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            />
          </FormField>

          <div className="grid gap-3 rounded-lg border border-border/60 bg-background/50 p-3 text-sm sm:grid-cols-3">
            <Preview label="Total" value={formatCurrency(preview.totalCost)} strong />
            <Preview label="Custo unitário" value={formatCurrency(preview.unitPurchaseCost)} />
            <Preview label="Custo real" value={formatCurrency(preview.realUnitCost)} strong />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Fechar
            </Button>
            <Button type="submit" variant="profit" loading={loading} disabled={loading}>
              <Save className="h-4 w-4" />
              Salvar alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Preview({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={strong ? "font-semibold tabular-nums text-text-primary" : "tabular-nums text-text-secondary"}>
        {value}
      </p>
    </div>
  );
}

function buildDraft(purchase: PurchaseDetail | PurchaseRow | null): PurchaseFormDraft {
  return {
    productId: purchase?.item?.product_id,
    quantity: purchase?.item?.quantity_ordered ?? 1,
    productSubtotal: purchase?.product_subtotal ?? 0,
    shippingCost: purchase?.shipping_cost ?? 0,
    additionalCosts: purchase?.additional_costs ?? 0,
    purchaseDate: purchase?.purchase_date ?? today,
    expectedArrivalDate: purchase?.expected_arrival_date ?? "",
    origin: purchase?.origin ?? "",
    notes: purchase?.notes ?? "",
  };
}
