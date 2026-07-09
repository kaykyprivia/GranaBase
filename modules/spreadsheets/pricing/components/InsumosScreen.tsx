"use client";

import { useState } from "react";
import { ResponsiveTable } from "../../engine/ResponsiveTable";
import { SidePanel } from "../../engine/SidePanel";
import type { Column } from "../../engine/types";
import { useInsumos } from "../hooks/useInsumos";
import { InsumoDetailPanel } from "./InsumoDetailPanel";
import { runMutation } from "../runMutation";
import type { Insumo, InsumoInput } from "../types";

function buildNovoInsumo(nome: string): InsumoInput {
  return {
    nome,
    unidadeMedida: "un",
    precoCompra: 0,
    quantidadeCompra: 1,
    pesoBruto: null,
    pesoLiquido: null,
    categoria: null,
    observacao: null,
  };
}

const columns: Column<Insumo>[] = [
  { id: "nome", label: "Insumo", type: "text", editable: true, width: 220, getValue: (r) => r.nome },
  {
    id: "unidadeMedida",
    label: "Unidade",
    type: "select",
    editable: false,
    width: 90,
    getValue: (r) => r.unidadeMedida,
  },
  {
    id: "precoCompra",
    label: "Preço compra",
    type: "currency",
    editable: true,
    width: 130,
    getValue: (r) => r.precoCompra,
  },
  {
    id: "quantidadeCompra",
    label: "Qtd. compra",
    type: "number",
    editable: true,
    width: 110,
    getValue: (r) => r.quantidadeCompra,
  },
  { id: "categoria", label: "Categoria", type: "text", editable: true, width: 140, getValue: (r) => r.categoria },
];

export function InsumosScreen() {
  const { insumos, loading, create, update, remove } = useInsumos();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = insumos.find((i) => i.id === selectedId) ?? null;

  function handleCellChange(rowIndex: number, columnId: string, value: string | number) {
    const insumo = insumos[rowIndex];
    if (!insumo) return;
    void runMutation(update(insumo.id, { [columnId]: value } as Partial<InsumoInput>), {
      errorMessage: "Não foi possível salvar o insumo. Tente novamente.",
    });
  }

  function handleCreate(nome: string) {
    void runMutation(create(buildNovoInsumo(nome)), {
      errorMessage: "Não foi possível criar o insumo. Tente novamente.",
    });
  }

  if (loading) {
    return <div className="skeleton h-64 rounded-2xl" />;
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <p className="text-sm text-text-secondary">{insumos.length} insumo(s)</p>

        <ResponsiveTable
          rows={insumos}
          columns={columns}
          getRowId={(r) => r.id}
          onCellChange={handleCellChange}
          onRowClick={(row) => setSelectedId(row.id)}
          selectedRowId={selectedId ?? undefined}
          onCreateRow={handleCreate}
          createPlaceholder="Adicionar insumo..."
        />
      </div>

      <SidePanel open={!!selected} onClose={() => setSelectedId(null)} title={selected?.nome ?? ""}>
        {selected && (
          <InsumoDetailPanel
            key={selected.id}
            insumo={selected}
            onUpdate={(patch) =>
              void runMutation(update(selected.id, patch), {
                errorMessage: "Não foi possível salvar o insumo. Tente novamente.",
              })
            }
            onDelete={() => {
              void runMutation(remove(selected.id), {
                successMessage: "Insumo excluído.",
                errorMessage: "Não foi possível excluir o insumo. Tente novamente.",
              });
              setSelectedId(null);
            }}
          />
        )}
      </SidePanel>
    </div>
  );
}
