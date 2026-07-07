"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { Insumo, InsumoInput, UnidadeMedida } from "../types";
import { calcularFatorCorrecao } from "../calculations";
import { cn } from "../../engine/cn";

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

  const fatorCorrecao = calcularFatorCorrecao(local.pesoBruto, local.pesoLiquido);

  return (
    <div className="space-y-4 text-sm">
      <Field label="Nome">
        <input
          className={inputClass}
          value={local.nome}
          onChange={(e) => commit({ nome: e.target.value })}
        />
      </Field>

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
            onChange={(e) => commit({ categoria: e.target.value || null })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor de compra (R$)">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={local.precoCompra}
            onChange={(e) => commit({ precoCompra: Number(e.target.value) })}
          />
        </Field>
        <Field label={`Quantidade comprada (${local.unidadeMedida})`}>
          <input
            type="number"
            step="0.001"
            className={inputClass}
            value={local.quantidadeCompra}
            onChange={(e) => commit({ quantidadeCompra: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Perda / rendimento (opcional)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Peso bruto (comprado)">
            <input
              type="number"
              step="0.001"
              className={inputClass}
              value={local.pesoBruto ?? ""}
              onChange={(e) => commit({ pesoBruto: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
          <Field label="Peso líquido (aproveitável)">
            <input
              type="number"
              step="0.001"
              className={inputClass}
              value={local.pesoLiquido ?? ""}
              onChange={(e) => commit({ pesoLiquido: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-text-secondary">
          Fator de correção: <span className="font-semibold text-text-primary">{fatorCorrecao.toFixed(3)}</span>
          {fatorCorrecao > 1 && " — o custo real por unidade aproveitável é maior que o preço de compra."}
        </p>
      </div>

      <Field label="Fornecedor">
        <input
          className={inputClass}
          value={local.fornecedor ?? ""}
          onChange={(e) => commit({ fornecedor: e.target.value || null })}
        />
      </Field>

      <Field label="Observação">
        <textarea
          className={cn(inputClass, "min-h-[72px] resize-none")}
          value={local.observacao ?? ""}
          onChange={(e) => commit({ observacao: e.target.value || null })}
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

const inputClass =
  "w-full rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-text-primary outline-none focus:border-accent/60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}
