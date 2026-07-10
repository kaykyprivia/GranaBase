"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { ResponsiveTable } from "../../engine/ResponsiveTable";
import { SidePanel } from "../../engine/SidePanel";
import type { Column } from "../../engine/types";
import { useInsumos } from "../hooks/useInsumos";
import { InsumoDetailPanel } from "./InsumoDetailPanel";
import { runMutation } from "../runMutation";
import { useCellUndoRedo } from "../useCellUndoRedo";
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

  const selected = insumos.find((i) => i.id === selectedId) ?? null;

  const filteredInsumos = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return insumos;
    return insumos.filter(
      (i) => i.nome.toLowerCase().includes(query) || (i.categoria ?? "").toLowerCase().includes(query)
    );
  }, [insumos, search]);

  const { record } = useCellUndoRedo((id, patch) =>
    void runMutation(update(id, patch as Partial<InsumoInput>), {
      errorMessage: "Não foi possível desfazer/refazer a alteração. Tente novamente.",
    })
  );

  function handleCellChange(rowIndex: number, columnId: string, value: string | number) {
    const insumo = filteredInsumos[rowIndex];
    if (!insumo) return;
    record(insumo.id, columnId, insumo[columnId as keyof Insumo] as string | number | null, value);
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            {filteredInsumos.length !== insumos.length
              ? `${filteredInsumos.length} de ${insumos.length} insumo(s)`
              : `${insumos.length} insumo(s)`}
          </p>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar insumo..."
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-12 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:border-accent"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-text-secondary">
              Ctrl K
            </kbd>
          </div>
        </div>

        {insumos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-2/30 px-4 py-10 text-center">
            <p className="text-sm font-medium text-text-primary">Nenhum insumo cadastrado ainda</p>
            <p className="mt-1 text-xs text-text-secondary">
              Insumos são os ingredientes e matérias-primas que compõem seus produtos. Digite um nome no
              campo abaixo para começar.
            </p>
          </div>
        ) : filteredInsumos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-2/30 px-4 py-10 text-center">
            <p className="text-sm font-medium text-text-primary">Nenhum insumo encontrado para &quot;{search}&quot;</p>
          </div>
        ) : null}

        <ResponsiveTable
          rows={filteredInsumos}
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
