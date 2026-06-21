"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { Additional, Product } from "@/types/database";

export function ProductBuilder({
  product,
  additionals,
}: {
  product: Product;
  additionals: Additional[];
}) {
  const router = useRouter();
  const { addItem } = useCart();
  const sizes = product.product_sizes ?? [];

  const [sizeId, setSizeId] = useState(sizes[0]?.id ?? "");
  const [selectedAdditionals, setSelectedAdditionals] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);

  const selectedSize = sizes.find((s) => s.id === sizeId);

  const total = useMemo(() => {
    const additionalsTotal = additionals
      .filter((a) => selectedAdditionals.includes(a.id))
      .reduce((sum, a) => sum + a.price, 0);
    return ((selectedSize?.price ?? 0) + additionalsTotal) * quantity;
  }, [selectedSize, selectedAdditionals, additionals, quantity]);

  function toggleAdditional(id: string) {
    setSelectedAdditionals((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function handleAddToCart() {
    if (!selectedSize) {
      toast.error("Escolha um tamanho.");
      return;
    }

    addItem({
      productId: product.id,
      productName: product.name,
      sizeId: selectedSize.id,
      sizeLabel: selectedSize.label,
      unitPrice: selectedSize.price,
      quantity,
      additionals: additionals
        .filter((a) => selectedAdditionals.includes(a.id))
        .map((a) => ({ id: a.id, name: a.name, price: a.price })),
    });

    toast.success("Adicionado ao carrinho!");
    router.push("/carrinho");
  }

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-acai-700">{product.name}</h1>
        {product.description && (
          <p className="mt-1 text-acai-500">{product.description}</p>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium text-acai-800">Tamanho</span>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <button
              key={size.id}
              type="button"
              onClick={() => setSizeId(size.id)}
              className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                sizeId === size.id
                  ? "border-acai-600 bg-acai-600 text-white"
                  : "border-acai-200 text-acai-700 hover:bg-acai-50"
              }`}
            >
              {size.label} · {formatCurrency(size.price)}
            </button>
          ))}
        </div>
      </div>

      {additionals.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-acai-800">Adicionais</span>
          <div className="flex flex-col gap-2">
            {additionals.map((additional) => (
              <label
                key={additional.id}
                className="flex items-center justify-between rounded-xl border border-acai-100 px-4 py-3"
              >
                <span className="flex items-center gap-2 text-sm text-acai-800">
                  <input
                    type="checkbox"
                    checked={selectedAdditionals.includes(additional.id)}
                    onChange={() => toggleAdditional(additional.id)}
                  />
                  {additional.name}
                </span>
                <span className="text-sm text-acai-500">
                  + {formatCurrency(additional.price)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-acai-800">Quantidade</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="rounded-full border border-acai-200 p-2 text-acai-700"
          >
            <Minus size={16} />
          </button>
          <span className="w-6 text-center font-medium">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="rounded-full border border-acai-200 p-2 text-acai-700"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <Button onClick={handleAddToCart} className="w-full">
        Adicionar ao carrinho · {formatCurrency(total)}
      </Button>
    </div>
  );
}
