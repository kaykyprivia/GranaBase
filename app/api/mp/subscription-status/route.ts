import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/mp/subscription-status
 *
 * Retorna o status atual da assinatura do usuario autenticado.
 *
 * Headers:
 *   Authorization: Bearer <supabase_access_token>
 *
 * Retorna:
 *   {
 *     subscription: {...} | null,
 *     recentPayments: [...]
 *   }
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. Pega token
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Nao autenticado" },
        { status: 401 }
      );
    }

    // 2. Valida Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Supabase nao configurado" },
        { status: 500 }
      );
    }

    // 3. Cria cliente com o token do usuario (respeita RLS)
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });

    // 4. Valida user
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Token invalido" },
        { status: 401 }
      );
    }

    // 5. Busca subscription atual
    const { data: subscriptionData, error: subError } = await supabase.rpc(
      "get_my_subscription"
    );

    if (subError) {
      console.error("Erro ao buscar subscription:", subError);
    }

    // 6. Busca historico de pagamentos
    const { data: paymentsData, error: payError } = await supabase.rpc(
      "list_my_subscription_payments"
    );

    if (payError) {
      console.error("Erro ao buscar pagamentos:", payError);
    }

    return NextResponse.json({
      success: true,
      subscription: subscriptionData?.[0] ?? null,
      recentPayments: paymentsData ?? [],
    });
  } catch (error) {
    console.error("Erro em subscription-status:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
