"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ResponsiveTable } from "../../engine/ResponsiveTable";
import { SidePanel } from "../../engine/SidePanel";
import type { Column } from "../../engine/types";
import { useProdutos } from "../hooks/useProdutos";
import { useInsumos } from "../hooks/useInsumos";
import { calcularPrecificacao, type InsumoNaFichaTecnica } from "../calculations";
import { ProdutoDetailPanel } from "./ProdutoDetailPanel";
import type { Produto, ProdutoInput } from "../types";

const NOVO_PRODUTO: ProdutoInput = {
  nome: "Novo produto",
  categoria: null,
  rendimentoPorcoes: 1,
  despesasVariaveisPct: 0,
  despesasFixasPct: 0,
  impostosPct: 0,
  margemDesejadaPct: 0,
  precoPraticado: null,
  observacao: null,
};

export function ProdutosScreen() {
  const { produtos, loading: loadingProdutos, create, update, remove, addInsumoNaFicha, updateQuantidadeNaFicha, removeInsumoDaFicha } =
    useProdutos();
  const { insumos, loading: loadingInsumos } = useInsumos();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = produtos.find((p) => p.id === selectedId) ?? null;

  const columns: Column<Produto>[] = useMemo(
    () => [
      { id: "nome", label: "Produto", type: "text", editable: true, width: 220, getValue: (r) => r.nome },
      { id: "categoria", label: "Categoria", type: "text", editable: true, width: 140, getValue: (r) => r.categoria },
      {
        id: "precoSugerido",
        label: "Preço sugerido",
        type: "currency",
        editable: false,
        width: 140,
        getValue: (produto) => {
          const fichaTecnica: InsumoNaFichaTecnica[] = produto.fichaTecnica
            .map((item) => {
              const insumo = insumos.find((i) => i.id === item.insumoId);
              if (!insumo) return null;
              return {
                precoCompra: insumo.precoCompra,
                quantidadeCompra: insumo.quantidadeCompra,
                pesoBruto: insumo.pesoBruto,
                pesoLiquido: insumo.pesoLiquido,
                quantidadeUsada: item.quantidadeUsada,
              };
            })
            .filter((v): v is InsumoNaFichaTecnica => v !== null);

          return calcularPrecificacao({
            fichaTecnica,
            rendimentoPorcoes: produto.rendimentoPorcoes,
            despesasVariaveisPct: produto.despesasVariaveisPct,
            despesasFixasPct: produto.despesasFixasPct,
            impostosPct: produto.impostosPct,
            margemDesejadaPct: produto.margemDesejadaPct,
          }).precoSugerido;
        },
      },
      {
        id: "precoPraticado",
        label: "Preço praticado",
        type: "currency",
        editable: true,
        width: 140,
        getValue: (r) => r.precoPraticado,
      },
    ],
    [insumos]
  );

  function handleCellChange(rowIndex: number, columnId: string, value: string | number) {
    const produto = produtos[rowIndex];
    if (!produto || columnId === "precoSugerido") return;
    void update(produto.id, { [columnId]: value } as Partial<ProdutoInput>);
  }

  async function handleCreate() {
    const created = await create(NOVO_PRODUTO);
    setSelectedId(created.id);
  }

  if (loadingProdutos || loadingInsumos) {
    return <div className="skeleton h-64 rounded-2xl" />;
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">{produtos.length} produto(s)</p>
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Novo produto
          </button>
        </div>

        <ResponsiveTable
          rows={produtos}
          columns={columns}
          getRowId={(r) => r.id}
          onCellChange={handleCellChange}
          onRowClick={(row) => setSelectedId(row.id)}
          selectedRowId={selectedId ?? undefined}
        />
      </div>

      <SidePanel open={!!selected} onClose={() => setSelectedId(null)} title={selected?.nome ?? ""}>
        {selected && (
          <ProdutoDetailPanel
            key={selected.id}
            produto={selected}
            insumos={insumos}
            onUpdate={(patch) => void update(selected.id, patch)}
            onDelete={() => {
              void remove(selected.id);
              setSelectedId(null);
            }}
            onAddInsumo={(insumoId, quantidade) => void addInsumoNaFicha(selected.id, insumoId, quantidade)}
            onUpdateQuantidade={(fichaItemId, quantidade) =>
              void updateQuantidadeNaFicha(fichaItemId, selected.id, quantidade)
            }
            onRemoveInsumo={(fichaItemId) => void removeInsumoDaFicha(fichaItemId, selected.id)}
          />
        )}
      </SidePanel>
    </div>
  );
}
