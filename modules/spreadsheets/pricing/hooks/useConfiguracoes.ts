"use client";

import { useCallback, useEffect, useState } from "react";
import { createPricingClient } from "../supabaseClient";
import type { Configuracoes, ConfiguracoesInput } from "../types";
import type { PricingDatabase } from "../supabaseSchema";
import { coerceData, coerceMutation } from "../supabaseCasts";

type ConfiguracoesRow = PricingDatabase["public"]["Tables"]["pricing_configuracoes"]["Row"];

const DEFAULT_CONFIGURACOES: Omit<Configuracoes, "userId"> = {
  impostosPctPadrao: 0,
  despesasFixasPctPadrao: 0,
  despesasVariaveisPctPadrao: 0,
  margemDesejadaPctPadrao: 0,
  regimeTributario: null,
};

export function useConfiguracoes() {
  const [supabase] = useState(() => createPricingClient());
  const [configuracoes, setConfiguracoes] = useState<Configuracoes | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setConfiguracoes(null);
      setLoading(false);
      return;
    }

    const { data: rawData } = await supabase
      .from("pricing_configuracoes")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    const data = coerceData<ConfiguracoesRow | null>(rawData);

    setConfiguracoes(
      data
        ? {
            userId: data.user_id,
            impostosPctPadrao: data.impostos_pct_padrao,
            despesasFixasPctPadrao: data.despesas_fixas_pct_padrao,
            despesasVariaveisPctPadrao: data.despesas_variaveis_pct_padrao,
            margemDesejadaPctPadrao: data.margem_desejada_pct_padrao,
            regimeTributario: data.regime_tributario,
          }
        : { userId: user.id, ...DEFAULT_CONFIGURACOES }
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(
    async (input: ConfiguracoesInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario nao autenticado");

      const { data: rawData, error } = await supabase
        .from("pricing_configuracoes")
        .upsert(
          coerceMutation({
            user_id: user.id,
            impostos_pct_padrao: input.impostosPctPadrao,
            despesas_fixas_pct_padrao: input.despesasFixasPctPadrao,
            despesas_variaveis_pct_padrao: input.despesasVariaveisPctPadrao,
            margem_desejada_pct_padrao: input.margemDesejadaPctPadrao,
            regime_tributario: input.regimeTributario,
          })
        )
        .select()
        .single();
      if (error) throw error;
      const data = coerceData<ConfiguracoesRow>(rawData);

      setConfiguracoes({
        userId: data.user_id,
        impostosPctPadrao: data.impostos_pct_padrao,
        despesasFixasPctPadrao: data.despesas_fixas_pct_padrao,
        despesasVariaveisPctPadrao: data.despesas_variaveis_pct_padrao,
        margemDesejadaPctPadrao: data.margem_desejada_pct_padrao,
        regimeTributario: data.regime_tributario,
      });
    },
    [supabase]
  );

  return { configuracoes, loading, save, reload };
}
