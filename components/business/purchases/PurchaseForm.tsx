"use client";

import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import { PackagePlus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import { cn, formatCurrency, toLocalDateString } from "@/lib/utils";
import {
  calculateMultiPurchasePreview,
  createPurchaseItemDraft,
  hasMultiPurchaseErrors,
  type MultiPurchaseDraft,
  type MultiPurchaseFormErrors,
  type PurchaseItemDraft,
  type PurchaseItemMode,
  validateMultiPurchaseForm,
} from "@/lib/business-purchases";
import type { BusinessProduct } from "@/types/database";

interface PurchaseFormProps {
  products: BusinessProduct[];
  submitting: boolean;
  onSubmit: (draft: MultiPurchaseDraft) => Promise<void>;
  initialDraft?: MultiPurchaseDraft;
  submitLabel?: string;
  onCancel?: () => void;
}

export function PurchaseForm({
  products,
  submitting,
  onSubmit,
  initialDraft,
  submitLabel = "Registrar compra",
  onCancel,
}: PurchaseFormProps) {
  const formId = useId();

  const [draft, setDraft] = useState<MultiPurchaseDraft>(
    () => initialDraft ?? createDefaultPurchaseDraft(products)
  );

  const [errors, setErrors] =
    useState<MultiPurchaseFormErrors>({
      itemErrors: {},
    });

  useEffect(() => {
    if (!initialDraft) {
      return;
    }

    setDraft(initialDraft);
    setErrors({
      itemErrors: {},
    });
  }, [initialDraft]);
  const preview = useMemo(
    () => calculateMultiPurchasePreview(draft),
    [draft]
  );

  const updateDraft = <K extends keyof MultiPurchaseDraft>(
    key: K,
    value: MultiPurchaseDraft[K]
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));

    setErrors((current) => ({
      ...current,
      [key]: undefined,
    }));
  };

  const updateItem = (
    key: string,
    patch: Partial<PurchaseItemDraft>
  ) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.key === key
          ? {
              ...item,
              ...patch,
            }
          : item
      ),
    }));

    setErrors((current) => {
      const nextItemErrors = {
        ...current.itemErrors,
      };

      delete nextItemErrors[key];

      return {
        ...current,
        items: undefined,
        itemErrors: nextItemErrors,
      };
    });
  };

  const changeItemMode = (
    key: string,
    mode: PurchaseItemMode
  ) => {
    updateItem(key, {
      mode,
      productId: "",
      productName: "",
      productSku: "",
      suggestedSalePrice: 0,
      minimumStock: 0,
    });
  };

  const addItem = () => {
    setDraft((current) => ({
      ...current,
      items: [
        ...current.items,
        createPurchaseItemDraft(
          products.length > 0 ? "existing" : "new"
        ),
      ],
    }));

    setErrors((current) => ({
      ...current,
      items: undefined,
    }));
  };

  const removeItem = (key: string) => {
    setDraft((current) => {
      if (current.items.length <= 1) {
        return current;
      }

      return {
        ...current,
        items: current.items.filter(
          (item) => item.key !== key
        ),
      };
    });

    setErrors((current) => {
      const nextItemErrors = {
        ...current.itemErrors,
      };

      delete nextItemErrors[key];

      return {
        ...current,
        itemErrors: nextItemErrors,
      };
    });
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const nextErrors =
      validateMultiPurchaseForm(draft);

    setErrors(nextErrors);

    if (hasMultiPurchaseErrors(nextErrors)) {
      return;
    }

    await onSubmit(draft);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Produtos da compra
            </h2>
            <p className="mt-0.5 text-xs text-text-secondary">
              Adicione todos os produtos que fazem parte do mesmo pedido.
            </p>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addItem}
          >
            <Plus className="h-4 w-4" />
            Adicionar produto
          </Button>
        </div>

        {errors.items && (
          <p className="text-xs text-expense">
            {errors.items}
          </p>
        )}

        <div className="space-y-4">
          {draft.items.map((item, index) => {
            const itemErrors =
              errors.itemErrors[item.key] ?? {};

            const itemPreview =
              preview.items.find(
                (entry) => entry.key === item.key
              );

            const productSelectId =
              `${formId}-${item.key}-product`;

            const productErrorId =
              `${productSelectId}-error`;

            return (
              <article
                key={item.key}
                className="rounded-xl border border-border/60 bg-background/35 p-4"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      Produto {index + 1}
                    </p>

                    {itemPreview && (
                      <p className="mt-0.5 text-xs text-text-secondary">
                        {itemPreview.quantity} un. ·{" "}
                        {formatCurrency(
                          itemPreview.productSubtotal
                        )}
                      </p>
                    )}
                  </div>

                  {draft.items.length > 1 && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Remover produto ${index + 1}`}
                      onClick={() =>
                        removeItem(item.key)
                      }
                    >
                      <Trash2 className="h-4 w-4 text-expense" />
                    </Button>
                  )}
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-surface p-1">
                  <button
                    type="button"
                    disabled={products.length === 0}
                    onClick={() =>
                      changeItemMode(
                        item.key,
                        "existing"
                      )
                    }
                    className={cn(
                      "flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm",
                      item.mode === "existing"
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-border/40 hover:text-text-primary"
                    )}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Existente
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      changeItemMode(
                        item.key,
                        "new"
                      )
                    }
                    className={cn(
                      "flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors sm:text-sm",
                      item.mode === "new"
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-border/40 hover:text-text-primary"
                    )}
                  >
                    <PackagePlus className="h-4 w-4" />
                    Novo produto
                  </button>
                </div>

                {item.mode === "existing" ? (
                  <div className="mb-4 space-y-1.5">
                    <Label htmlFor={productSelectId}>
                      Produto
                      <span className="ml-0.5 text-expense">
                        *
                      </span>
                    </Label>

                    <Select
                      value={
                        item.productId ||
                        undefined
                      }
                      onValueChange={(value) =>
                        updateItem(item.key, {
                          productId: value,
                        })
                      }
                    >
                      <SelectTrigger
                        id={productSelectId}
                        aria-describedby={
                          itemErrors.product
                            ? productErrorId
                            : undefined
                        }
                        aria-invalid={
                          Boolean(
                            itemErrors.product
                          ) || undefined
                        }
                        error={
                          itemErrors.product
                        }
                      >
                        <SelectValue placeholder="Selecione um produto" />
                      </SelectTrigger>

                      <SelectContent>
                        {products.map(
                          (product) => (
                            <SelectItem
                              key={product.id}
                              value={product.id}
                            >
                              {product.name}
                              {product.sku
                                ? ` · ${product.sku}`
                                : ""}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>

                    {itemErrors.product && (
                      <p
                        id={productErrorId}
                        className="text-xs text-expense"
                      >
                        {itemErrors.product}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mb-4 grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Nome do produto"
                      error={
                        itemErrors.productName
                      }
                      required
                      className="sm:col-span-2"
                    >
                      <Input
                        value={
                          item.productName ?? ""
                        }
                        error={
                          itemErrors.productName
                        }
                        placeholder="Ex: Suporte Celular"
                        onChange={(event) =>
                          updateItem(item.key, {
                            productName:
                              event.target.value,
                          })
                        }
                      />
                    </FormField>

                    <FormField
                      label="SKU"
                      error={
                        itemErrors.productSku
                      }
                      hint="Opcional"
                    >
                      <Input
                        value={
                          item.productSku ?? ""
                        }
                        error={
                          itemErrors.productSku
                        }
                        placeholder="Ex: SUP-001"
                        onChange={(event) =>
                          updateItem(item.key, {
                            productSku:
                              event.target.value,
                          })
                        }
                      />
                    </FormField>

                    <FormField
                      label="Estoque mínimo"
                      error={
                        itemErrors.minimumStock
                      }
                    >
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        value={
                          item.minimumStock ?? 0
                        }
                        error={
                          itemErrors.minimumStock
                        }
                        onChange={(event) =>
                          updateItem(item.key, {
                            minimumStock: Number(
                              event.target.value ||
                                0
                            ),
                          })
                        }
                      />
                    </FormField>

                    <FormField
                      label="Preço de venda sugerido"
                      error={
                        itemErrors.suggestedSalePrice
                      }
                      hint="Opcional"
                      className="sm:col-span-2"
                    >
                      <CurrencyInput
                        value={
                          item.suggestedSalePrice
                        }
                        error={
                          itemErrors.suggestedSalePrice
                        }
                        onChange={(value) =>
                          updateItem(item.key, {
                            suggestedSalePrice:
                              value,
                          })
                        }
                      />
                    </FormField>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="Quantidade"
                    error={itemErrors.quantity}
                    required
                  >
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={
                        item.quantity || ""
                      }
                      error={
                        itemErrors.quantity
                      }
                      onChange={(event) =>
                        updateItem(item.key, {
                          quantity: Number(
                            event.target.value ||
                              0
                          ),
                        })
                      }
                    />
                  </FormField>

                  <FormField
                    label="Valor da mercadoria"
                    error={
                      itemErrors.productSubtotal
                    }
                    required
                  >
                    <CurrencyInput
                      value={
                        item.productSubtotal
                      }
                      error={
                        itemErrors.productSubtotal
                      }
                      onChange={(value) =>
                        updateItem(item.key, {
                          productSubtotal:
                            value,
                        })
                      }
                    />
                  </FormField>
                </div>

                {itemPreview && (
                  <div className="mt-4 grid gap-2 rounded-lg border border-border/50 bg-surface/70 p-3 text-xs sm:grid-cols-3">
                    <PreviewValue
                      label="Custo unitário"
                      value={formatCurrency(
                        itemPreview.unitPurchaseCost
                      )}
                    />
                    <PreviewValue
                      label="Custos rateados"
                      value={formatCurrency(
                        itemPreview.allocatedExtraCost
                      )}
                    />
                    <PreviewValue
                      label="Custo real/un."
                      value={formatCurrency(
                        itemPreview.realUnitCost
                      )}
                      strong
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full border-dashed"
          onClick={addItem}
        >
          <Plus className="h-4 w-4" />
          Adicionar outro produto
        </Button>
      </section>

      <section className="space-y-4 rounded-xl border border-border/60 bg-surface p-4">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">
            Custos e informações do pedido
          </h2>
          <p className="mt-0.5 text-xs text-text-secondary">
            Frete e outros custos serão distribuídos proporcionalmente entre os produtos.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Frete"
            error={errors.shippingCost}
          >
            <CurrencyInput
              value={draft.shippingCost}
              error={errors.shippingCost}
              onChange={(value) =>
                updateDraft(
                  "shippingCost",
                  value
                )
              }
            />
          </FormField>

          <FormField
            label="Outros custos"
            error={errors.additionalCosts}
          >
            <CurrencyInput
              value={draft.additionalCosts}
              error={
                errors.additionalCosts
              }
              onChange={(value) =>
                updateDraft(
                  "additionalCosts",
                  value
                )
              }
            />
          </FormField>

          <FormField
            label="Data da compra"
            error={errors.purchaseDate}
            required
          >
            <Input
              type="date"
              value={draft.purchaseDate}
              error={errors.purchaseDate}
              onChange={(event) =>
                updateDraft(
                  "purchaseDate",
                  event.target.value
                )
              }
            />
          </FormField>

          <FormField
            label="Previsão de chegada"
            error={
              errors.expectedArrivalDate
            }
          >
            <Input
              type="date"
              value={
                draft.expectedArrivalDate ??
                ""
              }
              error={
                errors.expectedArrivalDate
              }
              onChange={(event) =>
                updateDraft(
                  "expectedArrivalDate",
                  event.target.value
                )
              }
            />
          </FormField>

          <FormField
            label="Origem da compra"
            className="sm:col-span-2"
          >
            <Input
              value={draft.origin ?? ""}
              placeholder="Ex: Marketplace, loja ou canal de compra"
              onChange={(event) =>
                updateDraft(
                  "origin",
                  event.target.value
                )
              }
            />
          </FormField>

          <FormField
            label="Observação"
            className="sm:col-span-2"
          >
            <Textarea
              rows={3}
              value={draft.notes ?? ""}
              placeholder="Rastreio, condições ou notas opcionais..."
              onChange={(event) =>
                updateDraft(
                  "notes",
                  event.target.value
                )
              }
            />
          </FormField>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Resumo da compra
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <PreviewValue
            label="Produtos"
            value={String(
              preview.itemCount
            )}
          />
          <PreviewValue
            label="Unidades"
            value={String(
              preview.totalQuantity
            )}
          />
          <PreviewValue
            label="Mercadorias"
            value={formatCurrency(
              preview.productSubtotal
            )}
          />
          <PreviewValue
            label="Frete"
            value={formatCurrency(
              preview.shippingCost
            )}
          />
          <PreviewValue
            label="Outros"
            value={formatCurrency(
              preview.additionalCosts
            )}
          />
          <PreviewValue
            label="Total"
            value={formatCurrency(
              preview.totalCost
            )}
            strong
          />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            className="min-h-11"
            onClick={onCancel}
          >
            Fechar
          </Button>
        )}

        <Button
          type="submit"
          loading={submitting}
          disabled={submitting}
          className="min-h-11"
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}


function createDefaultPurchaseDraft(
  products: BusinessProduct[]
): MultiPurchaseDraft {
  return {
    items: [
      createPurchaseItemDraft(
        products.length > 0 ? "existing" : "new"
      ),
    ],
    shippingCost: 0,
    additionalCosts: 0,
    purchaseDate: toLocalDateString(),
    expectedArrivalDate: "",
    origin: "",
    notes: "",
  };
}
function PreviewValue({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate font-semibold tabular-nums",
          strong
            ? "text-text-primary"
            : "text-text-secondary"
        )}
      >
        {value}
      </p>
    </div>
  );
}
