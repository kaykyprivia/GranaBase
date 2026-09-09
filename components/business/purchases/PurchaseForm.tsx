"use client";

import { FormEvent, useId, useMemo, useState } from "react";
import { PackagePlus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import { cn, formatCurrency, toLocalDateString } from "@/lib/utils";
import {
  calculatePurchasePreview,
  type PurchaseFormDraft,
  type PurchaseFormErrors,
  validatePurchaseForm,
} from "@/lib/business-purchases";
import type { BusinessProduct } from "@/types/database";

type ProductMode = "existing" | "new";

interface PurchaseFormProps {
  products: BusinessProduct[];
  submitting: boolean;
  onSubmit: (draft: PurchaseFormDraft, productMode: ProductMode) => Promise<void>;
}

const initialDraft: PurchaseFormDraft = {
  productId: "",
  productName: "",
  productSku: "",
  suggestedSalePrice: 0,
  minimumStock: 0,
  quantity: 1,
  productSubtotal: 0,
  shippingCost: 0,
  additionalCosts: 0,
  purchaseDate: toLocalDateString(),
  expectedArrivalDate: "",
  origin: "",
  notes: "",
};

export function PurchaseForm({ products, submitting, onSubmit }: PurchaseFormProps) {
  const productSelectId = useId();
  const productSelectErrorId = `${productSelectId}-error`;
  const [productMode, setProductMode] = useState<ProductMode>(products.length > 0 ? "existing" : "new");
  const [draft, setDraft] = useState<PurchaseFormDraft>(initialDraft);
  const [errors, setErrors] = useState<PurchaseFormErrors>({});

  const preview = useMemo(
    () =>
      calculatePurchasePreview({
        quantity: draft.quantity,
        productSubtotal: draft.productSubtotal,
        shippingCost: draft.shippingCost,
        additionalCosts: draft.additionalCosts,
      }),
    [draft.additionalCosts, draft.productSubtotal, draft.quantity, draft.shippingCost]
  );

  const updateDraft = <K extends keyof PurchaseFormDraft>(key: K, value: PurchaseFormDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined, product: key === "productId" ? undefined : current.product }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validatePurchaseForm(draft, productMode);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    await onSubmit(draft, productMode);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-surface p-1">
        <button
          type="button"
          onClick={() => setProductMode("existing")}
          disabled={products.length === 0}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
            productMode === "existing"
              ? "bg-accent/10 text-accent"
              : "text-text-secondary hover:bg-border/40 hover:text-text-primary"
          )}
        >
          <ShoppingCart className="h-4 w-4" />
          Produto existente
        </button>
        <button
          type="button"
          onClick={() => setProductMode("new")}
          className={cn(
            "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
            productMode === "new"
              ? "bg-accent/10 text-accent"
              : "text-text-secondary hover:bg-border/40 hover:text-text-primary"
          )}
        >
          <PackagePlus className="h-4 w-4" />
          Criar produto
        </button>
      </div>

      {productMode === "existing" ? (
        <div className="space-y-1.5">
          <Label htmlFor={productSelectId}>
            Produto<span className="text-expense ml-0.5">*</span>
          </Label>
          <Select value={draft.productId || undefined} onValueChange={(value) => updateDraft("productId", value)}>
            <SelectTrigger
              id={productSelectId}
              aria-describedby={errors.product ? productSelectErrorId : undefined}
              aria-invalid={Boolean(errors.product) || undefined}
              error={errors.product}
            >
              <SelectValue placeholder="Selecione um produto" />
            </SelectTrigger>
            <SelectContent>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}{product.sku ? ` · ${product.sku}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.product && <p id={productSelectErrorId} className="text-xs text-expense">{errors.product}</p>}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-background/35 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nome do produto" error={errors.productName} required className="sm:col-span-2">
              <Input
                value={draft.productName ?? ""}
                error={errors.productName}
                placeholder="Ex: Suporte Celular"
                onChange={(event) => updateDraft("productName", event.target.value)}
              />
            </FormField>
            <FormField label="SKU" hint="Opcional">
              <Input
                value={draft.productSku ?? ""}
                placeholder="Ex: SUP-001"
                onChange={(event) => updateDraft("productSku", event.target.value)}
              />
            </FormField>
            <FormField label="Estoque mínimo" error={errors.minimumStock}>
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={draft.minimumStock ?? 0}
                error={errors.minimumStock}
                onChange={(event) => updateDraft("minimumStock", Number(event.target.value || 0))}
              />
            </FormField>
            <FormField label="Preço de venda sugerido" error={errors.suggestedSalePrice} hint="Opcional">
              <CurrencyInput
                value={draft.suggestedSalePrice}
                error={errors.suggestedSalePrice}
                onChange={(value) => updateDraft("suggestedSalePrice", value)}
              />
            </FormField>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Quantidade" error={errors.quantity} required>
          <Input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={draft.quantity || ""}
            error={errors.quantity}
            onChange={(event) => updateDraft("quantity", Number(event.target.value || 0))}
          />
        </FormField>
        <FormField label="Valor da mercadoria" error={errors.productSubtotal} required>
          <CurrencyInput
            value={draft.productSubtotal}
            error={errors.productSubtotal}
            onChange={(value) => updateDraft("productSubtotal", value)}
          />
        </FormField>
        <FormField label="Frete" error={errors.shippingCost}>
          <CurrencyInput
            value={draft.shippingCost}
            error={errors.shippingCost}
            onChange={(value) => updateDraft("shippingCost", value)}
          />
        </FormField>
        <FormField label="Outros custos" error={errors.additionalCosts}>
          <CurrencyInput
            value={draft.additionalCosts}
            error={errors.additionalCosts}
            onChange={(value) => updateDraft("additionalCosts", value)}
          />
        </FormField>
        <FormField label="Data da compra" error={errors.purchaseDate} required>
          <Input
            type="date"
            value={draft.purchaseDate}
            error={errors.purchaseDate}
            onChange={(event) => updateDraft("purchaseDate", event.target.value)}
          />
        </FormField>
        <FormField label="Previsão de chegada">
          <Input
            type="date"
            value={draft.expectedArrivalDate ?? ""}
            onChange={(event) => updateDraft("expectedArrivalDate", event.target.value)}
          />
        </FormField>
        <FormField label="Origem da compra" className="sm:col-span-2">
          <Input
            value={draft.origin ?? ""}
            placeholder="Ex: Fornecedor, marketplace, loja"
            onChange={(event) => updateDraft("origin", event.target.value)}
          />
        </FormField>
        <FormField label="Observação" className="sm:col-span-2">
          <Textarea
            rows={3}
            value={draft.notes ?? ""}
            placeholder="Notas opcionais..."
            onChange={(event) => updateDraft("notes", event.target.value)}
          />
        </FormField>
      </div>

      <div className="rounded-xl border border-border/60 bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Preview de custo</p>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <PreviewValue label="Mercadoria" value={formatCurrency(preview.productSubtotal)} />
          <PreviewValue label="Frete" value={formatCurrency(preview.shippingCost)} />
          <PreviewValue label="Outros" value={formatCurrency(preview.additionalCosts)} />
          <PreviewValue label="Total" value={formatCurrency(preview.totalCost)} strong />
          <PreviewValue label="Custo/un." value={formatCurrency(preview.realUnitCost)} strong />
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" loading={submitting} className="min-h-11">
          Registrar compra
        </Button>
      </div>
    </form>
  );
}

function PreviewValue({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={cn("mt-0.5 truncate font-semibold tabular-nums", strong ? "text-text-primary" : "text-text-secondary")}>
        {value}
      </p>
    </div>
  );
}
