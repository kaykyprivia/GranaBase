import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mpPayment } from "@/lib/mercadopago";
import type { PaymentStatus } from "@/types/database";

function isSignatureValid(request: NextRequest, dataId: string) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;

  const signatureHeader = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  if (!signatureHeader || !requestId) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.trim().split("=") as [string, string])
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(v1);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

const statusMap: Record<string, PaymentStatus> = {
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
  refunded: "refunded",
  charged_back: "refunded",
};

export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  const body = await request.json().catch(() => null);

  const type = url.searchParams.get("type") ?? url.searchParams.get("topic") ?? body?.type;
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? body?.data?.id;

  if (type !== "payment" || !dataId) {
    return NextResponse.json({ received: true });
  }

  if (!isSignatureValid(request, String(dataId))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const payment = await mpPayment.get({ id: String(dataId) });
  const orderId = payment.external_reference;
  if (!orderId) {
    return NextResponse.json({ received: true });
  }

  const paymentStatus = statusMap[payment.status ?? ""] ?? "pending";
  const orderStatus = paymentStatus === "approved" ? "accepted" : undefined;

  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({
      payment_status: paymentStatus,
      mp_payment_id: String(dataId),
      ...(orderStatus ? { status: orderStatus } : {}),
      ...(paymentStatus === "rejected" || paymentStatus === "cancelled"
        ? { status: "cancelled" }
        : {}),
    })
    .eq("id", orderId);

  return NextResponse.json({ received: true });
}
