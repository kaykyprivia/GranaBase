"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types/database";
import { formatCurrency } from "@/lib/utils";

export default function AdminCardapioPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function loadProducts() {
    setIsLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("products")
      .select("*, product_sizes(*)")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Não foi possível carregar os produtos.");
    } else {
      setProducts(data as Product[]);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    loadProducts();
  }, []);

  async function toggleActive(product: Product) {
    const supabase = createClient();
    const { error } = await supabase
      .from("products")
      .update({ active: !product.active })
      .eq("id", product.id);

    if (error) {
      toast.error("Não foi possível atualizar o produto.");
      return;
    }
    toast.success(product.active ? "Produto desativado." : "Produto ativado.");
    loadProducts();
  }

  async function deleteProduct(product: Product) {
    if (!confirm(`Excluir "${product.name}"? Essa ação não pode ser desfeita.`)) return;

    const supabase = createClient();
    const { error } = await supabase.from("products").delete().eq("id", product.id);

    if (error) {
      toast.error("Não foi possível excluir o produto.");
      return;
    }
    toast.success("Produto excluído.");
    loadProducts();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-acai-700">Cardápio</h1>
        <Link href="/admin/cardapio/novo">
          <Button className="w-auto px-5">Novo produto</Button>
        </Link>
      </div>

      {isLoading ? (
        <p className="text-acai-500">Carregando...</p>
      ) : products.length === 0 ? (
        <p className="text-acai-500">Nenhum produto cadastrado ainda.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-acai-100 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-acai-50 text-acai-600">
              <tr>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Tamanhos</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-t border-acai-100">
                  <td className="px-4 py-3 font-medium text-acai-900">{product.name}</td>
                  <td className="px-4 py-3 text-acai-600">{product.category}</td>
                  <td className="px-4 py-3 text-acai-600">
                    {product.product_sizes
                      ?.map((s) => `${s.label} (${formatCurrency(s.price)})`)
                      .join(", ")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        product.active
                          ? "rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700"
                          : "rounded-full bg-acai-100 px-2 py-1 text-xs font-medium text-acai-600"
                      }
                    >
                      {product.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => toggleActive(product)}
                        className="text-xs font-medium text-acai-600 hover:underline"
                      >
                        {product.active ? "Desativar" : "Ativar"}
                      </button>
                      <Link
                        href={`/admin/cardapio/${product.id}`}
                        className="text-xs font-medium text-acai-600 hover:underline"
                      >
                        Editar
                      </Link>
                      <button
                        onClick={() => deleteProduct(product)}
                        className="text-xs font-medium text-red-500 hover:underline"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
