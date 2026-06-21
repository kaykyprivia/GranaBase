"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  productSchema,
  type ProductInput,
  type ProductOutput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Product } from "@/types/database";

interface ProductFormProps {
  product?: Product;
}

export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductInput, unknown, ProductOutput>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      description: product?.description ?? "",
      image_url: product?.image_url ?? "",
      category: product?.category ?? "acai",
      active: product?.active ?? true,
      sizes:
        product?.product_sizes?.map((s) => ({ label: s.label, price: s.price })) ??
        [{ label: "", price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "sizes" });

  async function onSubmit(values: ProductOutput) {
    setIsSubmitting(true);
    const supabase = createClient();

    const payload = {
      name: values.name,
      description: values.description || null,
      image_url: values.image_url || null,
      category: values.category,
      active: values.active,
    };

    if (product) {
      const { error: updateError } = await supabase
        .from("products")
        .update(payload)
        .eq("id", product.id);

      if (updateError) {
        toast.error("Não foi possível salvar o produto.");
        setIsSubmitting(false);
        return;
      }

      await supabase.from("product_sizes").delete().eq("product_id", product.id);
      const { error: sizesError } = await supabase
        .from("product_sizes")
        .insert(values.sizes.map((s) => ({ ...s, product_id: product.id })));

      if (sizesError) {
        toast.error("Produto salvo, mas houve erro ao salvar os tamanhos.");
        setIsSubmitting(false);
        return;
      }
    } else {
      const { data: created, error: insertError } = await supabase
        .from("products")
        .insert(payload)
        .select()
        .single();

      if (insertError || !created) {
        toast.error("Não foi possível criar o produto.");
        setIsSubmitting(false);
        return;
      }

      const { error: sizesError } = await supabase
        .from("product_sizes")
        .insert(values.sizes.map((s) => ({ ...s, product_id: created.id })));

      if (sizesError) {
        toast.error("Produto criado, mas houve erro ao salvar os tamanhos.");
        setIsSubmitting(false);
        return;
      }
    }

    toast.success(product ? "Produto atualizado!" : "Produto criado!");
    router.push("/admin/cardapio");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-xl flex-col gap-4">
      <Input id="name" label="Nome" error={errors.name?.message} {...register("name")} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-acai-800">
          Descrição
        </label>
        <textarea
          id="description"
          rows={3}
          className="rounded-xl border border-acai-200 px-4 py-3 text-acai-900 outline-none focus:border-acai-500"
          {...register("description")}
        />
      </div>

      <Input
        id="image_url"
        label="URL da foto"
        placeholder="https://..."
        error={errors.image_url?.message}
        {...register("image_url")}
      />

      <Input
        id="category"
        label="Categoria"
        error={errors.category?.message}
        {...register("category")}
      />

      <div className="flex items-center gap-2">
        <input id="active" type="checkbox" {...register("active")} />
        <label htmlFor="active" className="text-sm text-acai-800">
          Produto ativo (visível no cardápio)
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-acai-800">Tamanhos e preços</span>
          <button
            type="button"
            onClick={() => append({ label: "", price: 0 })}
            className="flex items-center gap-1 text-sm font-medium text-acai-600 hover:underline"
          >
            <Plus size={16} /> Adicionar tamanho
          </button>
        </div>

        {fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <Input
              id={`sizes.${index}.label`}
              label="Tamanho"
              placeholder="300ml"
              error={errors.sizes?.[index]?.label?.message}
              {...register(`sizes.${index}.label`)}
            />
            <Input
              id={`sizes.${index}.price`}
              label="Preço (R$)"
              type="number"
              step="0.01"
              error={errors.sizes?.[index]?.price?.message}
              {...register(`sizes.${index}.price`)}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={fields.length === 1}
              className="mb-1 rounded-xl p-3 text-red-500 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        {errors.sizes?.message && (
          <span className="text-sm text-red-500">{errors.sizes.message}</span>
        )}
      </div>

      <Button type="submit" isLoading={isSubmitting} className="mt-2 w-auto px-6">
        {product ? "Salvar alterações" : "Criar produto"}
      </Button>
    </form>
  );
}
