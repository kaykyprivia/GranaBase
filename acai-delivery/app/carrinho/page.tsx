"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useCart, itemTotal } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

export default function CarrinhoPage() {
  const router = useRouter();
  const { items, removeItem, updateQuantity, subtotal } = useCart();

  return (
    <main className="flex min-h-screen flex-1 flex-col gap-6 bg-acai-50 px-4 py-8">
      <h1 className="text-2xl font-bold text-acai-700">Carrinho</h1>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-acai-500">Seu carrinho está vazio.</p>
          <Link href="/cardapio">
            <Button className="w-auto px-6">Ver cardápio</Button>
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <div
                key={item.cartItemId}
                className="flex flex-col gap-2 rounded-2xl border border-acai-100 bg-white p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-acai-900">{item.productName}</p>
                    <p className="text-sm text-acai-500">{item.sizeLabel}</p>
                    {item.additionals.length > 0 && (
                      <p className="text-sm text-acai-500">
                        + {item.additionals.map((a) => a.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(item.cartItemId)}
                    className="text-red-500"
                    aria-label="Remover item"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() =>
                        updateQuantity(item.cartItemId, Math.max(1, item.quantity - 1))
                      }
                      className="rounded-full border border-acai-200 p-1.5 text-acai-700"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-6 text-center font-medium">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                      className="rounded-full border border-acai-200 p-1.5 text-acai-700"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="font-semibold text-acai-900">
                    {formatCurrency(itemTotal(item))}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto flex flex-col gap-3 rounded-2xl border border-acai-100 bg-white p-4">
            <div className="flex justify-between text-acai-700">
              <span>Subtotal</span>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <p className="text-xs text-acai-400">
              Taxa de entrega calculada no próximo passo.
            </p>
            <Button onClick={() => router.push("/checkout")}>Ir para o checkout</Button>
          </div>
        </>
      )}
    </main>
  );
}
