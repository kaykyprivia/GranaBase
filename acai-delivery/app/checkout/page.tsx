"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { createClient } from "@/lib/supabase/client";
import { checkoutSchema, type CheckoutInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

const paymentOptions = [
  { value: "pix", label: "PIX" },
  { value: "card", label: "Cartão" },
  { value: "cash", label: "Dinheiro na entrega" },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clear } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (items.length === 0) router.replace("/carrinho");
  }, [items, router]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CheckoutInput>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { payment_method: "pix" },
  });

  const paymentMethod = watch("payment_method");

  async function onSubmit(values: CheckoutInput) {
    setIsSubmitting(true);
    const supabase = createClient();

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      toast.error("Você precisa entrar para finalizar o pedido.");
      router.push("/login?redirect=/checkout");
      setIsSubmitting(false);
      return;
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userData.user.id,
        status: "pending",
        delivery_fee: 0,
        subtotal,
        cashback_used: 0,
        total: subtotal,
        payment_method: values.payment_method,
        address_json: values.address,
        notes: values.notes || null,
      })
      .select()
      .single();

    if (orderError || !order) {
      toast.error("Não foi possível criar o pedido.");
      setIsSubmitting(false);
      return;
    }

    const { error: itemsError } = await supabase.from("order_items").insert(
      items.map((item) => ({
        order_id: order.id,
        product_id: item.productId,
        size_id: item.sizeId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        additionals_json: item.additionals,
      }))
    );

    if (itemsError) {
      toast.error("Pedido criado, mas houve erro ao salvar os itens.");
      setIsSubmitting(false);
      return;
    }

    if (values.payment_method === "cash") {
      clear();
      toast.success("Pedido realizado com sucesso!");
      router.push(`/pedido/${order.id}`);
      return;
    }

    const preferenceResponse = await fetch("/api/mercadopago/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.id }),
    });

    if (!preferenceResponse.ok) {
      toast.error("Pedido criado, mas houve erro ao iniciar o pagamento.");
      setIsSubmitting(false);
      router.push(`/pedido/${order.id}`);
      return;
    }

    const { init_point } = await preferenceResponse.json();
    clear();
    window.location.href = init_point;
  }

  return (
    <main className="flex min-h-screen flex-1 flex-col bg-acai-50 px-4 py-8">
      <h1 className="text-2xl font-bold text-acai-700">Checkout</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex max-w-xl flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-2xl border border-acai-100 bg-white p-4">
          <span className="font-semibold text-acai-800">Endereço de entrega</span>
          <Input
            id="street"
            label="Rua"
            error={errors.address?.street?.message}
            {...register("address.street")}
          />
          <div className="flex gap-3">
            <Input
              id="number"
              label="Número"
              error={errors.address?.number?.message}
              {...register("address.number")}
            />
            <Input
              id="complement"
              label="Complemento"
              {...register("address.complement")}
            />
          </div>
          <Input
            id="neighborhood"
            label="Bairro"
            error={errors.address?.neighborhood?.message}
            {...register("address.neighborhood")}
          />
          <Input
            id="city"
            label="Cidade"
            defaultValue="São Sebastião"
            error={errors.address?.city?.message}
            {...register("address.city")}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-acai-100 bg-white p-4">
          <span className="font-semibold text-acai-800">Forma de pagamento</span>
          <div className="flex flex-col gap-2">
            {paymentOptions.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-xl border border-acai-100 px-4 py-3"
              >
                <input
                  type="radio"
                  checked={paymentMethod === option.value}
                  onChange={() => setValue("payment_method", option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="notes" className="text-sm font-medium text-acai-800">
            Observações (opcional)
          </label>
          <textarea
            id="notes"
            rows={2}
            className="rounded-xl border border-acai-200 px-4 py-3 outline-none focus:border-acai-500"
            {...register("notes")}
          />
        </div>

        <div className="flex justify-between rounded-2xl border border-acai-100 bg-white p-4">
          <span className="text-acai-700">Total</span>
          <span className="font-semibold text-acai-900">{formatCurrency(subtotal)}</span>
        </div>

        <Button type="submit" isLoading={isSubmitting}>
          Confirmar pedido
        </Button>
      </form>
    </main>
  );
}
