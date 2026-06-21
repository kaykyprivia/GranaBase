import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { Order } from "@/types/database";

const statusLabels: Record<string, string> = {
  pending: "Aguardando confirmação",
  accepted: "Aceito",
  preparing: "Em preparo",
  delivering: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (!order) notFound();

  const typedOrder = order as Order;

  return (
    <main className="flex min-h-screen flex-1 flex-col items-center gap-6 bg-acai-50 px-4 py-12 text-center">
      <h1 className="text-2xl font-bold text-acai-700">Pedido confirmado!</h1>
      <div className="w-full max-w-sm rounded-2xl border border-acai-100 bg-white p-6 text-left">
        <p className="text-sm text-acai-500">Status</p>
        <p className="mb-4 font-semibold text-acai-900">
          {statusLabels[typedOrder.status] ?? typedOrder.status}
        </p>
        <p className="text-sm text-acai-500">Total</p>
        <p className="font-semibold text-acai-900">{formatCurrency(typedOrder.total)}</p>
      </div>
      <Link href="/cardapio">
        <Button variant="outline" className="w-auto px-6">
          Voltar ao cardápio
        </Button>
      </Link>
    </main>
  );
}
