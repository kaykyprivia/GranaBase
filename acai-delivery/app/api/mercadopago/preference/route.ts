import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mpPreference } from "@/lib/mercadopago";
import type { Order } from "@/types/database";

export async function POST(request: NextRequest) {
  const { orderId } = await request.json();
  if (!orderId) {
    return NextResponse.json({ error: "orderId é obrigatório" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userData.user.id)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  const typedOrder = order as Order;
  if (typedOrder.payment_method === "cash") {
    return NextResponse.json(
      { error: "Pedido com pagamento na entrega não usa Mercado Pago" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;

  const preference = await mpPreference.create({
    body: {
      items: [
        {
          id: typedOrder.id,
          title: `Pedido açaí #${typedOrder.id.slice(0, 8)}`,
          quantity: 1,
          unit_price: typedOrder.total,
          currency_id: "BRL",
        },
      ],
      external_reference: typedOrder.id,
      back_urls: {
        success: `${appUrl}/pedido/${typedOrder.id}`,
        pending: `${appUrl}/pedido/${typedOrder.id}`,
        failure: `${appUrl}/pedido/${typedOrder.id}`,
      },
      auto_return: "approved",
      notification_url: `${appUrl}/api/mercadopago/webhook`,
    },
  });

  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({ mp_preference_id: preference.id })
    .eq("id", typedOrder.id);

  return NextResponse.json({ init_point: preference.init_point });
}
