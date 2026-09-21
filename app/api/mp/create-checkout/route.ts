import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMercadoPagoResources } from "@/lib/mercado-pago/client";

/**
 * POST /api/mp/create-checkout
 *
 * Body esperado:
 * {
 *   planType: "monthly" | "semiannual" | "annual"
 * }
 *
 * Fluxo:
 * 1. Verifica usuario autenticado (via header Authorization)
 * 2. Cria preapproval (assinatura) no Mercado Pago
 * 3. Registra tentativa no banco (subscription_payments)
 * 4. Retorna URL de checkout pro frontend redirecionar
 */

export const dynamic = "force-dynamic";

type PlanType = "monthly" | "semiannual" | "annual";

const PLAN_PRICES: Record<PlanType, number> = {
  monthly: 19.90,
  semiannual: 65.67,
  annual: 167.16,
};

const PLAN_TITLES: Record<PlanType, string> = {
  monthly: "GranaBase Mensal",
  semiannual: "GranaBase Semestral",
  annual: "GranaBase Anual",
};

export async function POST(request: NextRequest) {
  try {
    // 1. Pega token do header Authorization
    const authHeader = request.headers.get("authorization");
    const accessToken = authHeader?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json(
        { error: "Nao autenticado" },
        { status: 401 }
      );
    }

    // 2. Cria cliente Supabase (service_role para validar user + gravar)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Supabase nao configurado" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 3. Valida usuario
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Token invalido" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email;

    // 4. Parseia o body
    const body = await request.json();
    const planType = body?.planType as PlanType;

    if (!planType || !PLAN_PRICES[planType]) {
      return NextResponse.json(
        { error: "Plano invalido" },
        { status: 400 }
      );
    }

    // 5. Cria preapproval no Mercado Pago
    const { preApproval, environment } = getMercadoPagoResources();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://granabase.vercel.app";

    const preapprovalResult = await preApproval.create({
      body: {
        reason: PLAN_TITLES[planType],
        external_reference: userId,
        payer_email: userEmail ?? undefined,
        back_url: `${baseUrl}/business/plans/success`,
        auto_recurring: {
          frequency: planType === "monthly" ? 1 : planType === "semiannual" ? 6 : 12,
          frequency_type: "months",
          transaction_amount: PLAN_PRICES[planType],
          currency_id: "BRL",
        },
        status: "pending",
      },
    });

    if (!preapprovalResult.id) {
      return NextResponse.json(
        { error: "Falha ao criar assinatura no Mercado Pago" },
        { status: 500 }
      );
    }

    // 6. Registra no banco via RPC
    const { data: paymentId, error: rpcError } = await supabase.rpc(
      "create_mp_subscription_record",
      {
        p_user_id: userId,
        p_plan_type: planType,
        p_amount: PLAN_PRICES[planType],
        p_mp_preapproval_id: preapprovalResult.id,
        p_environment: environment,
      }
    );

    if (rpcError) {
      console.error("Erro ao registrar pagamento:", rpcError);
      return NextResponse.json(
        { error: "Falha ao registrar no banco" },
        { status: 500 }
      );
    }

    // 7. Retorna dados pro frontend
    return NextResponse.json({
      success: true,
      paymentId,
      preapprovalId: preapprovalResult.id,
      initPoint: preapprovalResult.init_point,
      environment,
    });
  } catch (error) {
    console.error("Erro em create-checkout:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
