"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ResponsiveTable } from "../../engine/ResponsiveTable";
import { SidePanel } from "../../engine/SidePanel";
import type { Column } from "../../engine/types";
import { useProdutos } from "../hooks/useProdutos";
import { useInsumos } from "../hooks/useInsumos";
import { calcularPrecificacao, type InsumoNaFichaTecnica } from "../calculations";
import { ProdutoDetailPanel } from "./ProdutoDetailPanel";
import { runMutation } from "../runMutation";
import { useCellUndoRedo } from "../useCellUndoRedo";
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
  const {
    produtos,
    loading: loadingProdutos,
    create,
    update,
    remove,
    addInsumoNaFicha,
    updateQuantidadeNaFicha,
    removeInsumoDaFicha,
    duplicate,
  } = useProdutos();
  const { insumos, loading: loadingInsumos } = useInsumos();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selected = produtos.find((p) => p.id === selectedId) ?? null;

  const filteredProdutos = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return produtos;
    return produtos.filter(
      (p) => p.nome.toLowerCase().includes(query) || (p.categoria ?? "").toLowerCase().includes(query)
    );
  }, [produtos, search]);

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
      {
        id: "margemDesejadaPct",
        label: "Margem desejada",
        type: "percentage",
        editable: true,
        width: 130,
        getValue: (r) => r.margemDesejadaPct,
      },
    ],
    [insumos]
  );

  const { record } = useCellUndoRedo((id, patch) =>
    void runMutation(update(id, patch as Partial<ProdutoInput>), {
      errorMessage: "Não foi possível desfazer/refazer a alteração. Tente novamente.",
    })
  );

  function handleCellChange(rowIndex: number, columnId: string, value: string | number) {
    const produto = filteredProdutos[rowIndex];
    if (!produto || columnId === "precoSugerido") return;
    record(produto.id, columnId, produto[columnId as keyof Produto] as string | number | null, value);
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            {filteredProdutos.length !== produtos.length
              ? `${filteredProdutos.length} de ${produtos.length} produto(s)`
              : `${produtos.length} produto(s)`}
          </p>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produto..."
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-12 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary">
              Ctrl K
            </kbd>
          </div>
        </div>

        {produtos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-2/30 px-4 py-10 text-center">
            <p className="text-sm font-medium text-text-primary">Nenhum produto cadastrado ainda</p>
            <p className="mt-1 text-xs text-text-secondary">
              {insumos.length === 0
                ? "Comece cadastrando os insumos na outra aba e depois monte a ficha técnica do produto aqui."
                : "Digite um nome no campo abaixo para criar um produto e montar a ficha técnica."}
            </p>
          </div>
        ) : filteredProdutos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-2/30 px-4 py-10 text-center">
            <p className="text-sm font-medium text-text-primary">Nenhum produto encontrado para &quot;{search}&quot;</p>
          </div>
        ) : null}

        <ResponsiveTable
          rows={filteredProdutos}
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
            onDuplicate={async () => {
              const created = await runMutation(duplicate(selected.id), {
                successMessage: "Produto duplicado.",
                errorMessage: "Não foi possível duplicar o produto. Tente novamente.",
              });
              if (created) setSelectedId(created.id);
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
