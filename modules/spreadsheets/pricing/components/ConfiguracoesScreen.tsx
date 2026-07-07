"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useConfiguracoes } from "../hooks/useConfiguracoes";
import type { ConfiguracoesInput, RegimeTributario } from "../types";

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
      await save(form);
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
        <Field label="Imposto efetivo sobre venda (%)">
          <input
            type="number"
            step="0.1"
            className={inputClass}
            value={form.impostosPctPadrao}
            onChange={(e) => setForm({ ...form, impostosPctPadrao: Number(e.target.value) })}
          />
        </Field>
        <Field label="Despesas fixas rateadas (%)">
          <input
            type="number"
            step="0.1"
            className={inputClass}
            value={form.despesasFixasPctPadrao}
            onChange={(e) => setForm({ ...form, despesasFixasPctPadrao: Number(e.target.value) })}
          />
        </Field>
        <Field label="Despesas variáveis / comissão (%)">
          <input
            type="number"
            step="0.1"
            className={inputClass}
            value={form.despesasVariaveisPctPadrao}
            onChange={(e) => setForm({ ...form, despesasVariaveisPctPadrao: Number(e.target.value) })}
          />
        </Field>
        <Field label="Margem de lucro desejada (%)">
          <input
            type="number"
            step="0.1"
            className={inputClass}
            value={form.margemDesejadaPctPadrao}
            onChange={(e) => setForm({ ...form, margemDesejadaPctPadrao: Number(e.target.value) })}
          />
        </Field>
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
