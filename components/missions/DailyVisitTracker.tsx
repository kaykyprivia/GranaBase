"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Chama record_daily_visit() uma vez por sessao ao carregar.
 * O backend e idempotente (por data), entao chamadas duplicadas nao
 * fazem mal — mas evitamos multiplas chamadas no mesmo mount via ref.
 */
export function DailyVisitTracker() {
  const called = useRef(false);
  const supabase = createClient();

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    supabase
      .rpc("record_daily_visit")
      .then(({ error }) => {
        if (error) {
          // Falha silenciosa: tracking de streak nao deve quebrar UI
          console.warn("record_daily_visit falhou:", error.message);
        }
      });
  }, [supabase]);

  return null;
}
