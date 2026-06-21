import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Product } from "@/types/database";
import { formatCurrency } from "@/lib/utils";

export default async function CardapioPage() {
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("*, product_sizes(*)")
    .eq("active", true)
    .order("name");

  const items = (products ?? []) as Product[];

  return (
    <main className="flex min-h-screen flex-1 flex-col gap-6 bg-acai-50 px-4 py-8">
      <h1 className="text-2xl font-bold text-acai-700">Cardápio</h1>

      {items.length === 0 ? (
        <p className="text-acai-500">Nenhum produto disponível no momento.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((product) => {
            const cheapestSize = product.product_sizes?.reduce(
              (min, s) => (s.price < min.price ? s : min),
              product.product_sizes[0]
            );

            return (
              <Link
                key={product.id}
                href={`/produto/${product.id}`}
                className="flex flex-col overflow-hidden rounded-2xl border border-acai-100 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative h-40 w-full bg-acai-100">
                  {product.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-4">
                  <h2 className="font-semibold text-acai-900">{product.name}</h2>
                  {product.description && (
                    <p className="text-sm text-acai-500">{product.description}</p>
                  )}
                  {cheapestSize && (
                    <span className="mt-1 font-semibold text-gold-600">
                      a partir de {formatCurrency(cheapestSize.price)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
