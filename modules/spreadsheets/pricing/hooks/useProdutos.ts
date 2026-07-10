"use client";

import { useCallback, useEffect, useState } from "react";
import { createPricingClient } from "../supabaseClient";
import type { Produto, ProdutoInput, ProdutoInsumo } from "../types";
import type { PricingDatabase } from "../supabaseSchema";
import { coerceData, coerceMutation } from "../supabaseCasts";

type ProdutoRow = PricingDatabase["public"]["Tables"]["pricing_produtos"]["Row"];
type FichaRow = PricingDatabase["public"]["Tables"]["pricing_produto_insumos"]["Row"];

function mapFichaRow(row: FichaRow): ProdutoInsumo {
  return {
    id: row.id,
    produtoId: row.produto_id,
    insumoId: row.insumo_id,
    quantidadeUsada: row.quantidade_usada,
  };
}

function mapProdutoRow(row: ProdutoRow, fichaTecnica: ProdutoInsumo[]): Produto {
  return {
    id: row.id,
    userId: row.user_id,
    nome: row.nome,
    categoria: row.categoria,
    rendimentoPorcoes: row.rendimento_porcoes,
    despesasVariaveisPct: row.despesas_variaveis_pct,
    despesasFixasPct: row.despesas_fixas_pct,
    impostosPct: row.impostos_pct,
    margemDesejadaPct: row.margem_desejada_pct,
    precoPraticado: row.preco_praticado,
    observacao: row.observacao,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fichaTecnica,
  };
}

function byNome(a: Produto, b: Produto) {
  return a.nome.localeCompare(b.nome);
}

export function useProdutos() {
  const [supabase] = useState(() => createPricingClient());
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setProdutos([]);
      setLoading(false);
      return;
    }

    const [produtosRes, fichaRes] = await Promise.all([
      supabase.from("pricing_produtos").select("*").eq("user_id", user.id).order("nome"),
      supabase.from("pricing_produto_insumos").select("*").eq("user_id", user.id),
    ]);

    const fichaPorProduto = new Map<string, ProdutoInsumo[]>();
    for (const row of coerceData<FichaRow[]>(fichaRes.data ?? [])) {
      const mapped = mapFichaRow(row);
      const list = fichaPorProduto.get(mapped.produtoId) ?? [];
      list.push(mapped);
      fichaPorProduto.set(mapped.produtoId, list);
    }

    setProdutos(
      coerceData<ProdutoRow[]>(produtosRes.data ?? []).map((row) =>
        mapProdutoRow(row, fichaPorProduto.get(row.id) ?? [])
      )
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: ProdutoInput) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario nao autenticado");

      const { data, error } = await supabase
        .from("pricing_produtos")
        .insert(
          coerceMutation({
            user_id: user.id,
            nome: input.nome,
            categoria: input.categoria,
            rendimento_porcoes: input.rendimentoPorcoes,
            despesas_variaveis_pct: input.despesasVariaveisPct,
            despesas_fixas_pct: input.despesasFixasPct,
            impostos_pct: input.impostosPct,
            margem_desejada_pct: input.margemDesejadaPct,
            preco_praticado: input.precoPraticado,
            observacao: input.observacao,
          })
        )
        .select()
        .single();
      if (error) throw error;

      const created = mapProdutoRow(coerceData<ProdutoRow>(data), []);
      setProdutos((current) => [...current, created].sort(byNome));
      return created;
    },
    [supabase]
  );

  const update = useCallback(
    async (id: string, patch: Partial<ProdutoInput>) => {
      const { data, error } = await supabase
        .from("pricing_produtos")
        .update(
          coerceMutation({
            ...(patch.nome !== undefined && { nome: patch.nome }),
            ...(patch.categoria !== undefined && { categoria: patch.categoria }),
            ...(patch.rendimentoPorcoes !== undefined && { rendimento_porcoes: patch.rendimentoPorcoes }),
            ...(patch.despesasVariaveisPct !== undefined && {
              despesas_variaveis_pct: patch.despesasVariaveisPct,
            }),
            ...(patch.despesasFixasPct !== undefined && { despesas_fixas_pct: patch.despesasFixasPct }),
            ...(patch.impostosPct !== undefined && { impostos_pct: patch.impostosPct }),
            ...(patch.margemDesejadaPct !== undefined && { margem_desejada_pct: patch.margemDesejadaPct }),
            ...(patch.precoPraticado !== undefined && { preco_praticado: patch.precoPraticado }),
            ...(patch.observacao !== undefined && { observacao: patch.observacao }),
          })
        )
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      const updatedRow = coerceData<ProdutoRow>(data);
      setProdutos((current) =>
        current.map((p) => (p.id === id ? mapProdutoRow(updatedRow, p.fichaTecnica) : p)).sort(byNome)
      );
    },
    [supabase]
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("pricing_produtos").delete().eq("id", id);
      if (error) throw error;
      setProdutos((current) => current.filter((p) => p.id !== id));
    },
    [supabase]
  );

  const addInsumoNaFicha = useCallback(
    async (produtoId: string, insumoId: string, quantidadeUsada: number) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario nao autenticado");

      const { data, error } = await supabase
        .from("pricing_produto_insumos")
        .insert(
          coerceMutation({
            user_id: user.id,
            produto_id: produtoId,
            insumo_id: insumoId,
            quantidade_usada: quantidadeUsada,
          })
        )
        .select()
        .single();
      if (error) throw error;

      const item = mapFichaRow(coerceData<FichaRow>(data));
      setProdutos((current) =>
        current.map((p) => (p.id === produtoId ? { ...p, fichaTecnica: [...p.fichaTecnica, item] } : p))
      );
      return item;
    },
    [supabase]
  );

  const updateQuantidadeNaFicha = useCallback(
    async (fichaItemId: string, produtoId: string, quantidadeUsada: number) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario nao autenticado");

      const { data, error } = await supabase
        .from("pricing_produto_insumos")
        .update(coerceMutation({ quantidade_usada: quantidadeUsada }))
        .eq("id", fichaItemId)
        .eq("user_id", user.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Item da ficha tecnica nao encontrado.");

      setProdutos((current) =>
        current.map((p) =>
          p.id === produtoId
            ? {
                ...p,
                fichaTecnica: p.fichaTecnica.map((f) =>
                  f.id === fichaItemId ? { ...f, quantidadeUsada } : f
                ),
              }
            : p
        )
      );
    },
    [supabase]
  );

  const removeInsumoDaFicha = useCallback(
    async (fichaItemId: string, produtoId: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuario nao autenticado");

      const { data, error } = await supabase
        .from("pricing_produto_insumos")
        .delete()
        .eq("id", fichaItemId)
        .eq("user_id", user.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Item da ficha tecnica nao encontrado.");

      setProdutos((current) =>
        current.map((p) =>
          p.id === produtoId
            ? { ...p, fichaTecnica: p.fichaTecnica.filter((f) => f.id !== fichaItemId) }
            : p
        )
      );
    },
    [supabase]
  );

  const duplicate = useCallback(
    async (produtoId: string) => {
      const original = produtos.find((p) => p.id === produtoId);
      if (!original) throw new Error("Produto nao encontrado.");

      const created = await create({
        nome: `${original.nome} (cópia)`,
        categoria: original.categoria,
        rendimentoPorcoes: original.rendimentoPorcoes,
        despesasVariaveisPct: original.despesasVariaveisPct,
        despesasFixasPct: original.despesasFixasPct,
        impostosPct: original.impostosPct,
        margemDesejadaPct: original.margemDesejadaPct,
        precoPraticado: original.precoPraticado,
        observacao: original.observacao,
      });

      for (const item of original.fichaTecnica) {
        await addInsumoNaFicha(created.id, item.insumoId, item.quantidadeUsada);
      }

      return created;
    },
    [produtos, create, addInsumoNaFicha]
  );

  return {
    produtos,
    loading,
    create,
    update,
    remove,
    reload,
    addInsumoNaFicha,
    updateQuantidadeNaFicha,
    removeInsumoDaFicha,
    duplicate,
  };
}
