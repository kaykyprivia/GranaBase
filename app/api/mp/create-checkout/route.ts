import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getMercadoPagoResources } from "@/lib/mercado-pago/client";

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json(
        { error: "Supabase nao configurado" },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();
    const supabaseSSR = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });

    const { data: userData, error: userError } =
      await supabaseSSR.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Nao autenticado" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    const body = await request.json();
    const planType = body?.planType as PlanType;

    if (!planType || !PLAN_PRICES[planType]) {
      return NextResponse.json(
        { error: "Plano invalido" },
        { status: 400 }
      );
    }

    const { preApproval, environment } = getMercadoPagoResources();
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://granabase.vercel.app";

    const preapprovalResult = await preApproval.create({
      body: {
        reason: PLAN_TITLES[planType],
        external_reference: userId,
        payer_email: userData.user.email ?? undefined,
        back_url: `${baseUrl}/my-plan`,
        status: "pending",
        auto_recurring: {
          frequency:
            planType === "monthly" ? 1 : planType === "semiannual" ? 6 : 12,
          frequency_type: "months",
          transaction_amount: PLAN_PRICES[planType],
          currency_id: "BRL",
        },
      },
    });

    if (!preapprovalResult.id) {
      return NextResponse.json(
        { error: "Falha ao criar assinatura" },
        { status: 500 }
      );
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: paymentId, error: rpcError } = await supabaseAdmin.rpc(
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

    return NextResponse.json({
      success: true,
      paymentId,
      preapprovalId: preapprovalResult.id,
      initPoint: preapprovalResult.init_point,
      environment,
    });
  } catch (error) {
    console.error("Erro em create-checkout:", error);
    const msg =
      error instanceof Error ? error.message : "Erro interno do servidor";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
