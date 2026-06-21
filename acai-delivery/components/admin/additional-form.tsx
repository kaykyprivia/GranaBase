"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  additionalSchema,
  type AdditionalInput,
  type AdditionalOutput,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdditionalForm({ onCreated }: { onCreated: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AdditionalInput, unknown, AdditionalOutput>({
    resolver: zodResolver(additionalSchema),
    defaultValues: { name: "", price: 0, active: true },
  });

  async function onSubmit(values: AdditionalOutput) {
    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("additionals").insert({
      name: values.name,
      price: values.price,
      stock_quantity: values.stock_quantity ?? null,
      active: values.active,
    });

    if (error) {
      toast.error("Não foi possível criar o adicional.");
      setIsSubmitting(false);
      return;
    }

    toast.success("Adicional criado!");
    reset({ name: "", price: 0, active: true, stock_quantity: undefined });
    setIsSubmitting(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3">
      <Input
        id="add-name"
        label="Nome"
        error={errors.name?.message}
        {...register("name")}
      />
      <Input
        id="add-price"
        label="Preço (R$)"
        type="number"
        step="0.01"
        error={errors.price?.message}
        {...register("price")}
      />
      <Input
        id="add-stock"
        label="Estoque (opcional)"
        type="number"
        error={errors.stock_quantity?.message}
        {...register("stock_quantity")}
      />
      <Button type="submit" isLoading={isSubmitting} className="w-auto px-5">
        Adicionar
      </Button>
    </form>
  );
}
