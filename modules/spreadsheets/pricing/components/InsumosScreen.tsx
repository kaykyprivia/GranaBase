"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ResponsiveTable } from "../../engine/ResponsiveTable";
import { SidePanel } from "../../engine/SidePanel";
import type { Column } from "../../engine/types";
import { useInsumos } from "../hooks/useInsumos";
import { InsumoDetailPanel } from "./InsumoDetailPanel";
import type { Insumo, InsumoInput } from "../types";

const NOVO_INSUMO: InsumoInput = {
  nome: "Novo insumo",
  unidadeMedida: "un",
  precoCompra: 0,
  quantidadeCompra: 1,
  pesoBruto: null,
  pesoLiquido: null,
  fornecedor: null,
  categoria: null,
  observacao: null,
};

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
  { id: "fornecedor", label: "Fornecedor", type: "text", editable: true, width: 160, getValue: (r) => r.fornecedor },
  { id: "categoria", label: "Categoria", type: "text", editable: true, width: 140, getValue: (r) => r.categoria },
];

export function InsumosScreen() {
  const { insumos, loading, create, update, remove } = useInsumos();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = insumos.find((i) => i.id === selectedId) ?? null;

  function handleCellChange(rowIndex: number, columnId: string, value: string | number) {
    const insumo = insumos[rowIndex];
    if (!insumo) return;
    void update(insumo.id, { [columnId]: value } as Partial<InsumoInput>);
  }

  async function handleCreate() {
    const created = await create(NOVO_INSUMO);
    setSelectedId(created.id);
  }

  if (loading) {
    return <div className="skeleton h-64 rounded-2xl" />;
  }

  return (
    <div className="flex h-full gap-4">
      <div className="flex flex-1 flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">{insumos.length} insumo(s)</p>
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-background hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            Novo insumo
          </button>
        </div>

        <ResponsiveTable
          rows={insumos}
          columns={columns}
          getRowId={(r) => r.id}
          onCellChange={handleCellChange}
          onRowClick={(row) => setSelectedId(row.id)}
          selectedRowId={selectedId ?? undefined}
        />
      </div>

      <SidePanel open={!!selected} onClose={() => setSelectedId(null)} title={selected?.nome ?? ""}>
        {selected && (
          <InsumoDetailPanel
            key={selected.id}
            insumo={selected}
            onUpdate={(patch) => void update(selected.id, patch)}
            onDelete={() => {
              void remove(selected.id);
              setSelectedId(null);
            }}
          />
        )}
      </SidePanel>
    </div>
  );
}
