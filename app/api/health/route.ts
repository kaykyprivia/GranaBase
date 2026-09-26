import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMercadoPagoEnvironment } from "@/lib/mercado-pago/client";

export const dynamic = "force-dynamic";

type CheckResult = {
  status: "ok" | "degraded" | "down";
  latency_ms: number;
  detail?: string;
};

async function checkSupabase(): Promise<CheckResult> {
  const started = Date.now();
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return {
        status: "down",
        latency_ms: 0,
        detail: "missing_env",
      };
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false },
    });

    // Query leve: apenas 1 registro da tabela de webhooks (sempre existe migração)
    const { error } = await supabase
      .from("webhook_events")
      .select("id")
      .limit(1);

    const latency = Date.now() - started;

    if (error) {
      return { status: "down", latency_ms: latency, detail: error.message };
    }
    return { status: "ok", latency_ms: latency };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Date.now() - started,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}

function checkMercadoPago(): CheckResult {
  const started = Date.now();
  try {
    const env = getMercadoPagoEnvironment();
    const token =
      env === "production"
        ? process.env.MERCADO_PAGO_ACCESS_TOKEN_PROD
        : process.env.MERCADO_PAGO_ACCESS_TOKEN_TEST;

    if (!token) {
      return {
        status: "down",
        latency_ms: 0,
        detail: `missing_token_${env}`,
      };
    }

    return {
      status: "ok",
      latency_ms: Date.now() - started,
      detail: env,
    };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Date.now() - started,
      detail: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function GET() {
  const [supabase, mercadoPago] = await Promise.all([
    checkSupabase(),
    Promise.resolve(checkMercadoPago()),
  ]);

  const allOk = supabase.status === "ok" && mercadoPago.status === "ok";
  const anyDown = supabase.status === "down" || mercadoPago.status === "down";

  const overall = allOk ? "ok" : anyDown ? "down" : "degraded";
  const httpStatus = overall === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      checks: {
        supabase,
        mercado_pago: mercadoPago,
      },
    },
    { status: httpStatus }
  );
}
