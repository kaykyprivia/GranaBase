"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface CardInvoice {
  card_id: string;
  card_name: string;
  card_due_day: number;
  reference_month: string;
  total_amount: number;
  expense_count: number;
  is_paid: boolean;
  paid_at: string | null;
  invoice_payment_id: string | null;
}

export function useCardInvoices(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [supabase] = useState(() => createClient());
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setInvoices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("list_my_card_invoices");

    if (rpcError) {
      setError(rpcError.message);
      setInvoices([]);
      setLoading(false);
      return;
    }

    setInvoices((data ?? []) as CardInvoice[]);
    setLoading(false);
  }, [supabase, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const payInvoice = useCallback(
    async (cardId: string, referenceMonth: string) => {
      const { error: rpcError } = await supabase.rpc("pay_card_invoice", {
        p_card_id: cardId,
        p_reference_month: referenceMonth,
      });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
    },
    [supabase, refresh]
  );

  const unpayInvoice = useCallback(
    async (paymentId: string) => {
      const { error: rpcError } = await supabase.rpc("unpay_card_invoice", {
        p_payment_id: paymentId,
      });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
    },
    [supabase, refresh]
  );

  return { invoices, loading, error, refresh, payInvoice, unpayInvoice };
}
