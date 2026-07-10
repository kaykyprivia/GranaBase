"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { Insumo, InsumoInput, UnidadeMedida } from "../types";
import { calcularFatorCorrecao } from "../calculations";
import { cn } from "../../engine/cn";
import { useAutosave } from "../../engine/useAutosave";
import { Field, NumberField, inputClass } from "./FormFields";

const UNIDADES: UnidadeMedida[] = ["g", "kg", "ml", "L", "un"];

export interface InsumoDetailPanelProps {
  insumo: Insumo;
  onUpdate: (patch: Partial<InsumoInput>) => void;
  onDelete: () => void;
}

export function InsumoDetailPanel({ insumo, onUpdate, onDelete }: InsumoDetailPanelProps) {
  const [local, setLocal] = useState(insumo);

  function commit(patch: Partial<InsumoInput>) {
    setLocal((current) => ({ ...current, ...patch }));
    onUpdate(patch);
  }

  function setText(patch: Partial<Pick<InsumoInput, "nome" | "categoria" | "observacao">>) {
    setLocal((current) => ({ ...current, ...patch }));
  }

  const textFields = useMemo(
    () => ({ nome: local.nome, categoria: local.categoria, observacao: local.observacao }),
    [local.nome, local.categoria, local.observacao]
  );
  const autosaveStatus = useAutosave(textFields, async (value) => onUpdate(value));

  const fatorCorrecao = calcularFatorCorrecao(local.pesoBruto, local.pesoLiquido);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <Field label="Nome" className="flex-1">
          <input
            className={inputClass}
            value={local.nome}
            onChange={(e) => setText({ nome: e.target.value })}
          />
        </Field>
        {autosaveStatus === "saving" && (
          <span className="ml-2 shrink-0 text-xs text-text-secondary">Salvando…</span>
        )}
        {autosaveStatus === "saved" && (
          <span className="ml-2 shrink-0 text-xs text-text-secondary">Salvo</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo (unidade)">
          <select
            className={inputClass}
            value={local.unidadeMedida}
            onChange={(e) => commit({ unidadeMedida: e.target.value as UnidadeMedida })}
          >
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Categoria">
          <input
            className={inputClass}
            value={local.categoria ?? ""}
            onChange={(e) => setText({ categoria: e.target.value || null })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Valor de compra (R$)"
          value={local.precoCompra}
          min={0}
          onCommit={(value) => value !== null && commit({ precoCompra: value })}
        />
        <NumberField
          label={`Quantidade comprada (${local.unidadeMedida})`}
          value={local.quantidadeCompra}
          step="0.001"
          min={0.001}
          onCommit={(value) => value !== null && commit({ quantidadeCompra: value })}
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Perda / rendimento (opcional)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Peso bruto (comprado)"
            value={local.pesoBruto}
            step="0.001"
            min={0}
            allowNull
            onCommit={(value) => commit({ pesoBruto: value })}
          />
          <NumberField
            label="Peso líquido (aproveitável)"
            value={local.pesoLiquido}
            step="0.001"
            min={0}
            allowNull
            onCommit={(value) => commit({ pesoLiquido: value })}
          />
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          Fator de correção: <span className="font-semibold text-text-primary">{fatorCorrecao.toFixed(3)}</span>
          {fatorCorrecao > 1 && " — o custo real por unidade aproveitável é maior que o preço de compra."}
        </p>
      </div>

      <Field label="Observação">
        <textarea
          className={cn(inputClass, "min-h-[72px] resize-none")}
          value={local.observacao ?? ""}
          onChange={(e) => setText({ observacao: e.target.value || null })}
        />
      </Field>

      <button
        type="button"
        onClick={onDelete}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-expense hover:bg-expense/10"
      >
        <Trash2 className="h-4 w-4" />
        Excluir insumo
      </button>
    </div>
  );
}
