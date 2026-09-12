"use client";

import { useEffect, useState } from "react";
import * as Switch from "@radix-ui/react-switch";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { validateProductMetadata, type InventoryItem, type ProductMetadataErrors } from "@/lib/business-inventory";

type EditProductDialogProps = {
  open: boolean;
  product: InventoryItem | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: {
    name: string;
    sku: string | null;
    defaultSalePrice: number | null;
    minimumStock: number;
    active: boolean;
  }) => Promise<void>;
};

export function EditProductDialog({ open, product, loading, onOpenChange, onConfirm }: EditProductDialogProps) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [defaultSalePrice, setDefaultSalePrice] = useState(0);
  const [minimumStock, setMinimumStock] = useState(0);
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<ProductMetadataErrors>({});

  useEffect(() => {
    if (open && product) {
      setName(product.name);
      setSku(product.sku ?? "");
      setDefaultSalePrice(product.default_sale_price ?? 0);
      setMinimumStock(product.minimum_stock);
      setActive(product.active);
      setErrors({});
    }
  }, [open, product]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateProductMetadata({
      name,
      sku,
      defaultSalePrice,
      minimumStock,
      active,
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    await onConfirm({
      name: name.trim(),
      sku: sku.trim() || null,
      defaultSalePrice: defaultSalePrice > 0 ? defaultSalePrice : null,
      minimumStock,
      active,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
          <DialogDescription>
            Edite somente dados cadastrais. Estoque, custo médio e capital são calculados automaticamente pelas movimentações.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormField label="Nome" required error={errors.name}>
            <Input value={name} onChange={(event) => setName(event.target.value)} error={errors.name} className="min-h-11" disabled={loading} />
          </FormField>

          <FormField label="SKU">
            <Input value={sku} onChange={(event) => setSku(event.target.value)} className="min-h-11" disabled={loading} />
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Preço de venda padrão" error={errors.defaultSalePrice}>
              <CurrencyInput value={defaultSalePrice} onChange={setDefaultSalePrice} error={errors.defaultSalePrice} className="min-h-11" disabled={loading} />
            </FormField>

            <FormField label="Estoque mínimo" error={errors.minimumStock}>
              <Input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={minimumStock}
                onChange={(event) => setMinimumStock(Number(event.target.value))}
                error={errors.minimumStock}
                className="min-h-11"
                disabled={loading}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/50 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Produto ativo</p>
              <p className="text-xs text-text-secondary">Produtos inativos preservam histórico e lotes.</p>
            </div>
            <Switch.Root
              checked={active}
              onCheckedChange={setActive}
              disabled={loading}
              className="relative h-6 w-11 rounded-full border border-border bg-border/70 transition-colors data-[state=checked]:bg-accent"
              aria-label="Produto ativo"
            >
              <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
            </Switch.Root>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" loading={loading}>
              Salvar produto
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
