import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMercadoPagoEnvironment } from "@/lib/mercado-pago/client";

/**
 * POST /api/mp/webhook
 *
 * Recebe notificacoes do Mercado Pago.
 *
 * Fluxo:
 * 1. Extrai event_id, type, action, resource_id
 * 2. Registra via RPC process_webhook_event (idempotente)
 * 3. Se for novo, consulta detalhes no MP e atualiza subscription
 * 4. Sempre retorna 200 (MP exige 200, senao reenvia)
 */

export const dynamic = "force-dynamic";

type MPWebhookBody = {
  id?: number | string;
  type?: string;
  action?: string;
  data?: {
    id?: string;
  };
  live_mode?: boolean;
};

export async function POST(request: NextRequest) {
  let body: MPWebhookBody = {};

  try {
    body = await request.json();
  } catch {
    // MP as vezes manda vazio em validacao inicial
    return NextResponse.json({ received: true });
  }

  try {
    // 1. Extrai campos do payload
    const eventId = String(body.id ?? crypto.randomUUID());
    const eventType = body.type ?? "unknown";
    const action = body.action ?? null;
    const resourceId = body.data?.id ?? null;

    // 2. Valida Supabase configurado
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      console.error("Supabase nao configurado");
      return NextResponse.json({ received: true });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const environment = getMercadoPagoEnvironment();

    // 3. Registra webhook (idempotente)
    const { data: isNew, error: rpcError } = await supabase.rpc(
      "process_webhook_event",
      {
        p_event_id: eventId,
        p_event_type: eventType,
        p_resource_id: resourceId,
        p_action: action,
        p_payload: body,
        p_environment: environment,
      }
    );

    if (rpcError) {
      console.error("Erro ao processar webhook:", rpcError);
      return NextResponse.json({ received: true });
    }

    // Se ja foi processado, nao faz nada
    if (!isNew) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // 4. Se for preapproval ou subscription, atualiza status
    if (
      (eventType === "preapproval" || eventType === "subscription_preapproval") &&
      resourceId
    ) {
      const { preApproval } = await import("@/lib/mercado-pago/client").then(
        (m) => m.getMercadoPagoResources()
      );

      const detail = await preApproval.get({ id: resourceId });
      const status = detail.status ?? "pending";

      // Mapeia status do MP para o nosso
      const mappedStatus = mapMPStatusToOurs(status);

      await supabase.rpc("update_mp_payment_status", {
        p_mp_preapproval_id: resourceId,
        p_status: mappedStatus,
        p_mp_payment_id: null,
        p_raw_payload: detail as unknown as Record<string, unknown>,
      });
    }

    // 5. Sempre retorna 200
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Erro em webhook:", error);
    // MP exige 200 mesmo em erro pra nao reenviar eternamente
    return NextResponse.json({ received: true });
  }
}

/**
 * GET /api/mp/webhook - usado para validacao inicial do MP
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

function mapMPStatusToOurs(mpStatus: string): string {
  switch (mpStatus) {
    case "authorized":
      return "authorized";
    case "paused":
      return "cancelled";
    case "cancelled":
      return "cancelled";
    case "pending":
      return "pending";
    default:
      return "pending";
  }
}
