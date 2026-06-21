import { ProductForm } from "@/components/admin/product-form";

export default function NovoProdutoPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-acai-700">Novo produto</h1>
      <ProductForm />
    </div>
  );
}
