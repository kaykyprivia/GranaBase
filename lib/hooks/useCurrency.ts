"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { coerceData } from "@/lib/supabase/casts";

export type CurrencyCode = "BRL" | "USD";

/**
 * Busca a moeda principal (`user_settings.primary_currency`) do usuario logado.
 * Enquanto carrega, expoe "BRL" como fallback seguro.
 */
export function useCurrency(): CurrencyCode {
  const [currency, setCurrency] = useState<CurrencyCode>("BRL");

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data } = await supabase
        .from("user_settings")
        .select("primary_currency")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      const row = coerceData<{ primary_currency?: CurrencyCode } | null>(data ?? null);
      if (row?.primary_currency === "USD" || row?.primary_currency === "BRL") {
        setCurrency(row.primary_currency);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return currency;
}
