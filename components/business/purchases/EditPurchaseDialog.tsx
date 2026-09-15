"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PurchaseForm } from "@/components/business/purchases/PurchaseForm";
import type {
  PurchaseDetail,
  PurchaseRow,
} from "@/components/business/purchases/types";
import type {
  MultiPurchaseDraft,
  PurchaseItemDraft,
} from "@/lib/business-purchases";
import type { ProductCategoryOption } from "@/lib/business-inventory";
import type { BusinessProduct } from "@/types/database";

interface EditPurchaseDialogProps {
  open: boolean;
  purchase: PurchaseDetail | PurchaseRow | null;
  products?: BusinessProduct[];
  categories?: ProductCategoryOption[];
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (draft: MultiPurchaseDraft) => Promise<void> | void;
}

export function EditPurchaseDialog({
  open,
  purchase,
  products = [],
  categories = [],
  loading = false,
  onOpenChange,
  onConfirm,
}: EditPurchaseDialogProps) {
  const availableProducts = useMemo(() => {
    const productsById = new Map<string, BusinessProduct>();

    for (const product of products) {
      productsById.set(product.id, product);
    }

    for (const line of purchase?.items ?? []) {
      if (line.product) {
        productsById.set(
          line.product.id,
          line.product
        );
      }
    }

    return [...productsById.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [products, purchase]);

  const initialDraft = useMemo(
    () => buildDraft(purchase),
    [purchase]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar compra
          </DialogTitle>

          <DialogDescription>
            Altere os produtos, quantidades, custos e informações do pedido antes do recebimento.
          </DialogDescription>
        </DialogHeader>

        {purchase && initialDraft ? (
          <PurchaseForm
            products={availableProducts}
            categories={categories}
            submitting={loading}
            initialDraft={initialDraft}
            submitLabel="Salvar alterações"
            onCancel={() =>
              onOpenChange(false)
            }
            onSubmit={async (draft) => {
              await onConfirm(draft);
            }}
          />
        ) : (
          <p className="py-6 text-center text-sm text-text-secondary">
            Compra não encontrada.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function buildDraft(
  purchase: PurchaseDetail | PurchaseRow | null
): MultiPurchaseDraft | null {
  if (!purchase || purchase.items.length === 0) {
    return null;
  }

  const items: PurchaseItemDraft[] =
    purchase.items.map(
      ({ item, product }, index) => ({
        key:
          item.id ||
          `purchase-item-${index}`,
        mode: "existing",
        productId: item.product_id,
        productName:
          product?.name ?? "",
        productSku:
          product?.sku ?? "",
        suggestedSalePrice:
          product?.default_sale_price ?? 0,
        minimumStock:
          product?.minimum_stock ?? 0,
        quantity:
          item.quantity_ordered,
        productSubtotal: roundMoney(
          item.unit_purchase_cost *
            item.quantity_ordered
        ),
      })
    );

  return {
    items,
    shippingCost:
      purchase.shipping_cost ?? 0,
    additionalCosts:
      purchase.additional_costs ?? 0,
    purchaseDate:
      purchase.purchase_date,
    expectedArrivalDate:
      purchase.expected_arrival_date ?? "",
    origin:
      purchase.origin ?? "",
    notes:
      purchase.notes ?? "",
  };
}

function roundMoney(value: number) {
  return Math.round(
    (value + Number.EPSILON) * 100
  ) / 100;
}
