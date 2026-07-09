"use client";

import { useMemo, useState } from "react";
import { ResponsiveTable } from "../../engine/ResponsiveTable";
import { SidePanel } from "../../engine/SidePanel";
import type { Column } from "../../engine/types";
import { useProdutos } from "../hooks/useProdutos";
import { useInsumos } from "../hooks/useInsumos";
import { calcularPrecificacao, type InsumoNaFichaTecnica } from "../calculations";
import { ProdutoDetailPanel } from "./ProdutoDetailPanel";
import { runMutation } from "../runMutation";
import type { Produto, ProdutoInput } from "../types";

function buildNovoProduto(nome: string): ProdutoInput {
  return {
    nome,
    categoria: null,
    rendimentoPorcoes: 1,
    despesasVariaveisPct: 0,
    despesasFixasPct: 0,
    impostosPct: 0,
    margemDesejadaPct: 0,
    precoPraticado: null,
    observacao: null,
  };
}

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
    void runMutation(update(produto.id, { [columnId]: value } as Partial<ProdutoInput>), {
      errorMessage: "Não foi possível salvar o produto. Tente novamente.",
    });
  }

  function handleCreate(nome: string) {
    void runMutation(create(buildNovoProduto(nome)), {
      errorMessage: "Não foi possível criar o produto. Tente novamente.",
    });
  }

  if (loadingProdutos || loadingInsumos) {
    return <div className="skeleton h-64 rounded-2xl" />;
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <p className="text-sm text-text-secondary">{produtos.length} produto(s)</p>

        <ResponsiveTable
          rows={produtos}
          columns={columns}
          getRowId={(r) => r.id}
          onCellChange={handleCellChange}
          onRowClick={(row) => setSelectedId(row.id)}
          selectedRowId={selectedId ?? undefined}
          onCreateRow={handleCreate}
          createPlaceholder="Adicionar produto..."
        />
      </div>

      <SidePanel open={!!selected} onClose={() => setSelectedId(null)} title={selected?.nome ?? ""}>
        {selected && (
          <ProdutoDetailPanel
            key={selected.id}
            produto={selected}
            insumos={insumos}
            onUpdate={(patch) =>
              void runMutation(update(selected.id, patch), {
                errorMessage: "Não foi possível salvar o produto. Tente novamente.",
              })
            }
            onDelete={() => {
              void runMutation(remove(selected.id), {
                successMessage: "Produto excluído.",
                errorMessage: "Não foi possível excluir o produto. Tente novamente.",
              });
              setSelectedId(null);
            }}
            onAddInsumo={(insumoId, quantidade) =>
              void runMutation(addInsumoNaFicha(selected.id, insumoId, quantidade), {
                errorMessage: "Não foi possível adicionar o insumo. Tente novamente.",
              })
            }
            onUpdateQuantidade={(fichaItemId, quantidade) =>
              void runMutation(updateQuantidadeNaFicha(fichaItemId, selected.id, quantidade), {
                errorMessage: "Não foi possível atualizar a quantidade. Tente novamente.",
              })
            }
            onRemoveInsumo={(fichaItemId) =>
              void runMutation(removeInsumoDaFicha(fichaItemId, selected.id), {
                errorMessage: "Não foi possível remover o insumo da ficha técnica. Tente novamente.",
              })
            }
          />
        )}
      </SidePanel>
    </div>
  );
}
