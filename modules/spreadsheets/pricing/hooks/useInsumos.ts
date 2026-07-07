"use client";

import { useCallback, useEffect, useState } from "react";
import { createPricingClient } from "../supabaseClient";
import type { Insumo, InsumoInput } from "../types";
import type { PricingDatabase } from "../supabaseSchema";
import { coerceData, coerceMutation } from "../supabaseCasts";

type InsumoRow = PricingDatabase["public"]["Tables"]["pricing_insumos"]["Row"];

function mapRow(row: InsumoRow): Insumo {
  return {
    id: row.id,
    userId: row.user_id,
    nome: row.nome,
    unidadeMedida: row.unidade_medida,
    precoCompra: row.preco_compra,
    quantidadeCompra: row.quantidade_compra,
    pesoBruto: row.peso_bruto,
    pesoLiquido: row.peso_liquido,
    fornecedor: row.fornecedor,
    categoria: row.categoria,
    observacao: row.observacao,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function byNome(a: Insumo, b: Insumo) {
  return a.nome.localeCompare(b.nome);
}

export function useInsumos() {
  const [supabase] = useState(() => createPricingClient());
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setInsumos([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("pricing_insumos")
      .select("*")
      .eq("user_id", user.id)
      .order("nome");
    setInsumos((data ?? []).map(mapRow));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: InsumoInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario nao autenticado");

      const { data, error } = await supabase
        .from("pricing_insumos")
        .insert(
          coerceMutation({
            user_id: user.id,
            nome: input.nome,
            unidade_medida: input.unidadeMedida,
            preco_compra: input.precoCompra,
            quantidade_compra: input.quantidadeCompra,
            peso_bruto: input.pesoBruto,
            peso_liquido: input.pesoLiquido,
            fornecedor: input.fornecedor,
            categoria: input.categoria,
            observacao: input.observacao,
          })
        )
        .select()
        .single();
      if (error) throw error;

      const created = mapRow(coerceData<InsumoRow>(data));
      setInsumos((current) => [...current, created].sort(byNome));
      return created;
    },
    [supabase]
  );

  const update = useCallback(
    async (id: string, patch: Partial<InsumoInput>) => {
      const { data, error } = await supabase
        .from("pricing_insumos")
        .update(
          coerceMutation({
            ...(patch.nome !== undefined && { nome: patch.nome }),
            ...(patch.unidadeMedida !== undefined && { unidade_medida: patch.unidadeMedida }),
            ...(patch.precoCompra !== undefined && { preco_compra: patch.precoCompra }),
            ...(patch.quantidadeCompra !== undefined && { quantidade_compra: patch.quantidadeCompra }),
            ...(patch.pesoBruto !== undefined && { peso_bruto: patch.pesoBruto }),
            ...(patch.pesoLiquido !== undefined && { peso_liquido: patch.pesoLiquido }),
            ...(patch.fornecedor !== undefined && { fornecedor: patch.fornecedor }),
            ...(patch.categoria !== undefined && { categoria: patch.categoria }),
            ...(patch.observacao !== undefined && { observacao: patch.observacao }),
          })
        )
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      const updated = mapRow(coerceData<InsumoRow>(data));
      setInsumos((current) => current.map((i) => (i.id === id ? updated : i)).sort(byNome));
      return updated;
    },
    [supabase]
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("pricing_insumos").delete().eq("id", id);
      if (error) throw error;
      setInsumos((current) => current.filter((i) => i.id !== id));
    },
    [supabase]
  );

  return { insumos, loading, create, update, remove, reload };
}
