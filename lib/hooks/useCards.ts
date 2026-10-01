"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface Card {
  id: string;
  name: string;
  due_day: number;
  closing_day: number;
  credit_limit: number | null;
  active: boolean;
  created_at: string;
  expense_count: number;
}

export interface CardInput {
  name: string;
  due_day: number;
  closing_day: number;
  credit_limit: number | null;
  active?: boolean;
}

export function useCards(options?: { onlyActive?: boolean }) {
  const onlyActive = options?.onlyActive ?? false;
  const [supabase] = useState(() => createClient());
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("list_my_cards");

    if (rpcError) {
      setError(rpcError.message);
      setCards([]);
      setLoading(false);
      return;
    }

    const all = (data ?? []) as Card[];
    setCards(onlyActive ? all.filter((c) => c.active) : all);
    setLoading(false);
  }, [supabase, onlyActive]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createCard = useCallback(
    async (input: CardInput) => {
      const { data, error: rpcError } = await supabase.rpc("create_my_card", {
        p_name: input.name,
        p_due_day: input.due_day,
        p_closing_day: input.closing_day,
        p_credit_limit: input.credit_limit ?? null,
      });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
      return data as string;
    },
    [supabase, refresh]
  );

  const updateCard = useCallback(
    async (id: string, input: CardInput) => {
      const { error: rpcError } = await supabase.rpc("update_my_card", {
        p_card_id: id,
        p_name: input.name,
        p_due_day: input.due_day,
        p_closing_day: input.closing_day,
        p_credit_limit: input.credit_limit ?? null,
        p_active: input.active ?? true,
      });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
    },
    [supabase, refresh]
  );

  const deleteCard = useCallback(
    async (id: string) => {
      const { error: rpcError } = await supabase.rpc("delete_my_card", {
        p_card_id: id,
      });
      if (rpcError) throw new Error(rpcError.message);
      await refresh();
    },
    [supabase, refresh]
  );

  return { cards, loading, error, refresh, createCard, updateCard, deleteCard };
}
