"use client";

import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  calculateSalePreview,
  hasSaleFormErrors,
  mapInventoryToSaleItem,
  validateSaleForm,
  SALE_CHANNEL_OPTIONS,
  SALE_DELIVERY_METHOD_OPTIONS,
  type SaleFormDraft,
  type SaleFormErrors,
  type SaleFormItem,
} from "@/lib/business-sales";
import { cn, formatCurrency, toLocalDateString } from "@/lib/utils";
import type { BusinessCustomer, BusinessInventorySummary } from "@/types/database";

type SaleFormProps = {
  products: BusinessInventorySummary[];
  customers: BusinessCustomer[];
  customerSearch: string;
  onCustomerSearchChange: (value: string) => void;
  submitting: boolean;
  onSubmit: (draft: SaleFormDraft) => Promise<void>;
};

const emptyErrors: SaleFormErrors = { itemErrors: [] };

export function SaleForm({
  products,
  customers,
  customerSearch,
  onCustomerSearchChange,
  submitting,
  onSubmit,
}: SaleFormProps) {
  const availableProducts = useMemo(() => products.filter((product) => product.active && product.available > 0), [products]);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<SaleFormDraft>({
    customerId: "",
    quickCustomerName: "",
    quickCustomerWhatsapp: "",
    saleDate: toLocalDateString(),
    salesChannel: "IN_PERSON",
    deliveryMethod: "UNSPECIFIED",
    deliveryFee: 0,
    deliveryCost: 0,
    notes: "",
    items: [],
  });
  const [errors, setErrors] = useState<SaleFormErrors>(emptyErrors);

  const preview = useMemo(
    () => calculateSalePreview(draft.items, draft.deliveryFee, draft.deliveryCost),
    [draft.items, draft.deliveryFee, draft.deliveryCost]
  );

  function updateDraft<K extends keyof SaleFormDraft>(key: K, value: SaleFormDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined } as SaleFormErrors));
  }

  function addProduct() {
    const product = availableProducts.find((item) => item.product_id === selectedProductId);
    if (!product) return;

    setDraft((current) => {
      const existingIndex = current.items.findIndex((item) => item.productId === product.product_id);
      if (existingIndex >= 0) {
        const items = current.items.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: Math.min(item.quantity + 1, item.available) }
            : item
        );
        return { ...current, items };
      }
      return { ...current, items: [...current.items, mapInventoryToSaleItem(product)] };
    });
  }

  function updateItem(index: number, patch: Partial<SaleFormItem>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  function removeItem(index: number) {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateSaleForm(draft);
    setErrors(nextErrors);
    if (hasSaleFormErrors(nextErrors)) {
      return;
    }
    await onSubmit(draft);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Cliente existente</Label>

          <Input
            value={customerSearch}
            placeholder="Buscar cliente por nome ou WhatsApp..."
            onChange={(event) =>
              onCustomerSearchChange(
                event.target.value
              )
            }
          />

          <Select
            value={draft.customerId || "none"}
            onValueChange={(value) =>
              updateDraft(
                "customerId",
                value === "none" ? "" : value
              )
            }
          >
            <SelectTrigger aria-label="Cliente existente">
              <SelectValue placeholder="Cliente opcional" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="none">
                Sem cliente
              </SelectItem>

              {customers.map((customer) => (
                <SelectItem
                  key={customer.id}
                  value={customer.id}
                >
                  {customer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <FormField label="Data da venda" error={errors.saleDate} required>
          <Input
            type="date"
            value={draft.saleDate}
            error={errors.saleDate}
            onChange={(event) => updateDraft("saleDate", event.target.value)}
          />
        </FormField>

        <FormField label="Canal de venda">
          <Select
            value={draft.salesChannel}
            onValueChange={(value) => updateDraft("salesChannel", value as SaleFormDraft["salesChannel"])}
          >
            <SelectTrigger aria-label="Canal de venda">
              <SelectValue placeholder="Selecione o canal" />
            </SelectTrigger>
            <SelectContent>
              {SALE_CHANNEL_OPTIONS.filter((option) => option.value !== "UNSPECIFIED").map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="rounded-xl border border-border/60 bg-background/35 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Cliente rápido</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nome" error={errors.customer} hint="Opcional">
            <Input
              value={draft.quickCustomerName ?? ""}
              error={errors.customer}
              placeholder="Ex: Ana"
              onChange={(event) => updateDraft("quickCustomerName", event.target.value)}
            />
          </FormField>
          <FormField label="WhatsApp" hint="Opcional">
            <Input
              value={draft.quickCustomerWhatsapp ?? ""}
              placeholder="(00) 00000-0000"
              onChange={(event) => updateDraft("quickCustomerWhatsapp", event.target.value)}
            />
          </FormField>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label>Produto</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger aria-label="Selecionar produto para venda">
                <SelectValue placeholder="Selecione um produto" />
              </SelectTrigger>
              <SelectContent>
                {availableProducts.map((product) => (
                  <SelectItem key={product.product_id} value={product.product_id}>
                    {product.name} - disp. {product.available}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" className="min-h-10 self-end" onClick={addProduct} disabled={!selectedProductId}>
            <Plus className="h-4 w-4" />
            Adicionar
          </Button>
        </div>
        {errors.items && <p className="mt-2 text-xs text-expense">{errors.items}</p>}

        <div className="mt-4 space-y-3">
          {draft.items.map((item, index) => (
            <SaleItemEditor
              key={`${item.productId}-${index}`}
              item={item}
              index={index}
              errors={errors.itemErrors[index] ?? {}}
              onUpdate={updateItem}
              onRemove={removeItem}
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Entrega</p>
        <div className="mb-4">
          <FormField label="Modalidade de entrega">
            <Select
              value={draft.deliveryMethod}
              onValueChange={(value) => {
                const deliveryMethod = value as SaleFormDraft["deliveryMethod"];
                setDraft((current) => ({
                  ...current,
                  deliveryMethod,
                  ...(deliveryMethod === "CUSTOMER_PICKUP"
                    ? { deliveryFee: 0, deliveryCost: 0 }
                    : {}),
                }));
                setErrors((current) => ({
                  ...current,
                  deliveryFee: undefined,
                  deliveryCost: undefined,
                }));
              }}
            >
              <SelectTrigger aria-label="Modalidade de entrega">
                <SelectValue placeholder="Selecione como o pedido sera entregue" />
              </SelectTrigger>
              <SelectContent>
                {SALE_DELIVERY_METHOD_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Taxa de entrega cobrada do cliente" error={errors.deliveryFee} hint="Valor que o cliente paga pela entrega">
            <CurrencyInput
              value={draft.deliveryFee}
              error={errors.deliveryFee}
              disabled={draft.deliveryMethod === "CUSTOMER_PICKUP"}
              onChange={(value) => updateDraft("deliveryFee", value)}
            />
          </FormField>
          <FormField label="Custo real da entrega" error={errors.deliveryCost} hint="Quanto você realmente gastou para entregar">
            <CurrencyInput
              value={draft.deliveryCost}
              error={errors.deliveryCost}
              disabled={draft.deliveryMethod === "CUSTOMER_PICKUP"}
              onChange={(value) => updateDraft("deliveryCost", value)}
            />
          </FormField>
        </div>
      </div>

      {preview.belowCost && (
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Esta venda pode gerar prejuizo. O resultado oficial sera confirmado pelo Business Core apos a reserva.</p>
        </div>
      )}

      <FormField label="Observação">
        <Textarea
          rows={3}
          value={draft.notes ?? ""}
          placeholder="Notas opcionais..."
          onChange={(event) => updateDraft("notes", event.target.value)}
        />
      </FormField>

      <div className="sticky bottom-3 rounded-xl border border-border/60 bg-surface p-4 shadow-card">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Preview financeiro</p>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 lg:grid-cols-8">
          <PreviewValue label="Subtotal" value={formatCurrency(preview.subtotal)} />
          <PreviewValue label="Desconto" value={formatCurrency(preview.discountAmount)} />
          <PreviewValue label="Taxas" value={formatCurrency(preview.feesAmount)} />
          <PreviewValue label="Taxa entrega" value={formatCurrency(preview.deliveryFee)} />
          <PreviewValue label="Custo entrega" value={formatCurrency(preview.deliveryCost)} />
          <PreviewValue label="Total" value={formatCurrency(preview.totalAmount)} strong />
          <PreviewValue label="CMV est." value={formatCurrency(preview.estimatedCogs)} />
          <PreviewValue label="Lucro est." value={formatCurrency(preview.estimatedNetProfit)} strong={preview.estimatedNetProfit >= 0} danger={preview.estimatedNetProfit < 0} />
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="submit" loading={submitting} className="min-h-11">
            Registrar venda
          </Button>
        </div>
      </div>
    </form>
  );
}

function QuantityStepper({
  value,
  max,
  productName,
  error,
  onChange,
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: number;
  max: number;
  productName: string;
  error?: string;
  onChange: (value: number) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  suppressErrorMessage?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex h-10 w-full items-center overflow-hidden rounded-lg border border-border bg-background/60 shadow-input transition-all duration-150",
          "hover:border-border/80 hover:bg-background/80",
          "focus-within:border-accent/60 focus-within:bg-background focus-within:shadow-input-focus",
          error && "border-expense/70 focus-within:border-expense"
        )}
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="h-full w-10 shrink-0 rounded-none border-r border-border/60"
          aria-label={`Diminuir quantidade de ${productName}`}
          disabled={value <= 1}
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          <Minus className="h-4 w-4" />
        </Button>

        <input
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          type="number"
          min={1}
          max={max}
          step={1}
          inputMode="numeric"
          value={value || ""}
          onChange={(event) => {
            const nextValue = Number(event.target.value || 0);
            onChange(Math.min(Math.max(nextValue, 0), max));
          }}
          onBlur={() => {
            if (value < 1) onChange(1);
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-center text-sm font-medium text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="h-full w-10 shrink-0 rounded-none border-l border-border/60"
          aria-label={`Aumentar quantidade de ${productName}. Máximo ${max}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, Math.max(value + 1, 1)))}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-[11px] text-text-secondary">
        Máx. {max} em estoque
      </p>
    </div>
  );
}
function SaleItemEditor({
  item,
  index,
  errors,
  onUpdate,
  onRemove,
}: {
  item: SaleFormItem;
  index: number;
  errors: Partial<Record<keyof SaleFormItem, string>>;
  onUpdate: (index: number, patch: Partial<SaleFormItem>) => void;
  onRemove: (index: number) => void;
}) {
  const subtotal = item.quantity * item.unitSalePrice - (item.discountAmount ?? 0);

  return (
    <div className="rounded-xl border border-border/60 bg-background/35 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text-primary">{item.productName}</p>
          <p className="text-xs text-text-secondary">Disponivel {item.available} - custo medio {formatCurrency(item.averageUnitCost)}</p>
        </div>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Remover produto" onClick={() => onRemove(index)}>
          <Trash2 className="h-4 w-4 text-expense" />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <FormField label="Qtd." error={errors.quantity}>
          <QuantityStepper
            value={item.quantity}
            max={item.available}
            productName={item.productName}
            error={errors.quantity}
            onChange={(quantity) => onUpdate(index, { quantity })}
          />
        </FormField>
        <FormField label="Preco" error={errors.unitSalePrice}>
          <CurrencyInput
            value={item.unitSalePrice}
            error={errors.unitSalePrice}
            onChange={(value) => onUpdate(index, { unitSalePrice: value })}
          />
        </FormField>
        <FormField label="Desconto" error={errors.discountAmount}>
          <CurrencyInput
            value={item.discountAmount}
            error={errors.discountAmount}
            onChange={(value) => onUpdate(index, { discountAmount: value })}
          />
        </FormField>
        <FormField label="Taxa" error={errors.platformFee}>
          <CurrencyInput
            value={item.platformFee}
            error={errors.platformFee}
            onChange={(value) => onUpdate(index, { platformFee: value })}
          />
        </FormField>
        <div className="rounded-lg bg-surface px-3 py-2">
          <p className="text-[11px] text-text-muted">Subtotal</p>
          <p className="mt-1 font-semibold tabular-nums text-text-primary">{formatCurrency(Math.max(subtotal, 0))}</p>
        </div>
      </div>
    </div>
  );
}

function PreviewValue({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={cn("mt-0.5 truncate font-semibold tabular-nums", danger ? "text-expense" : strong ? "text-text-primary" : "text-text-secondary")}>
        {value}
      </p>
    </div>
  );
}
