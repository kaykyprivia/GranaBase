import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Additional, Product } from "@/types/database";
import { ProductBuilder } from "@/components/cliente/product-builder";

export default async function ProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: product }, { data: additionals }] = await Promise.all([
    supabase
      .from("products")
      .select("*, product_sizes(*)")
      .eq("id", id)
      .eq("active", true)
      .single(),
    supabase.from("additionals").select("*").eq("active", true).order("name"),
  ]);

  if (!product) notFound();

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-acai-50 px-4 py-8">
      <ProductBuilder
        product={product as Product}
        additionals={(additionals ?? []) as Additional[]}
      />
    </main>
  );
}
