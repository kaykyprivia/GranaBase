"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useConfiguracoes } from "../hooks/useConfiguracoes";
import type { ConfiguracoesInput, RegimeTributario } from "../types";
import { Field, NumberField, inputClass } from "./FormFields";
import { runMutation } from "../runMutation";

const REGIMES: { value: RegimeTributario; label: string }[] = [
  { value: "mei", label: "MEI" },
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
  { value: "outro", label: "Outro" },
];

export function ConfiguracoesScreen() {
  const { configuracoes, loading, save } = useConfiguracoes();
  const [form, setForm] = useState<ConfiguracoesInput | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (configuracoes) {
      setForm({
        impostosPctPadrao: configuracoes.impostosPctPadrao,
        despesasFixasPctPadrao: configuracoes.despesasFixasPctPadrao,
        despesasVariaveisPctPadrao: configuracoes.despesasVariaveisPctPadrao,
        margemDesejadaPctPadrao: configuracoes.margemDesejadaPctPadrao,
        regimeTributario: configuracoes.regimeTributario,
      });
    }
  }, [configuracoes]);

  if (loading || !form) {
    return <div className="skeleton h-64 rounded-2xl" />;
  }

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    try {
      await runMutation(save(form), {
        successMessage: "Preferências salvas.",
        errorMessage: "Não foi possível salvar as preferências. Tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-sm text-text-secondary">
        Esses valores pré-preenchem produtos novos — cada produto pode sobrescrever individualmente.
      </p>

      <Field label="Regime tributário">
        <select
          className={inputClass}
          value={form.regimeTributario ?? ""}
          onChange={(e) =>
            setForm({ ...form, regimeTributario: (e.target.value || null) as RegimeTributario | null })
          }
        >
          <option value="">Selecione…</option>
          {REGIMES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="Imposto efetivo sobre venda (%)"
          value={form.impostosPctPadrao}
          step="0.1"
          min={0}
          onCommit={(value) => value !== null && setForm({ ...form, impostosPctPadrao: value })}
        />
        <NumberField
          label="Despesas fixas rateadas (%)"
          value={form.despesasFixasPctPadrao}
          step="0.1"
          min={0}
          onCommit={(value) => value !== null && setForm({ ...form, despesasFixasPctPadrao: value })}
        />
        <NumberField
          label="Despesas variáveis / comissão (%)"
          value={form.despesasVariaveisPctPadrao}
          step="0.1"
          min={0}
          onCommit={(value) => value !== null && setForm({ ...form, despesasVariaveisPctPadrao: value })}
        />
        <NumberField
          label="Margem de lucro desejada (%)"
          value={form.margemDesejadaPctPadrao}
          step="0.1"
          min={0}
          onCommit={(value) => value !== null && setForm({ ...form, margemDesejadaPctPadrao: value })}
        />
      </div>

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background hover:brightness-110 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? "Salvando…" : "Salvar padrões"}
      </button>
    </div>
  );
}
