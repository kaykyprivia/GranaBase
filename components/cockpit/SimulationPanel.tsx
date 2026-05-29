"use client";

import { useState, useMemo } from "react";
import { Plus, Trash2, Zap, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { runSimulation, PRESET_SCENARIOS } from "@/lib/simulation-engine";
import type { SimulationScenario, SimulationResult } from "@/lib/simulation-engine";
import type { ProjectionInput } from "@/lib/projection-engine";

interface SimulationPanelProps {
  rawInput: ProjectionInput | null;
}

type ScenarioForm = {
  type: SimulationScenario["type"];
  label: string;
  amount: string;
  installments: string;
};

const DEFAULT_FORM: ScenarioForm = {
  type: "new_expense",
  label: "",
  amount: "",
  installments: "1",
};

const TYPE_LABELS: Record<SimulationScenario["type"], string> = {
  new_expense:         "Gasto único",
  new_installment:     "Parcelado",
  income_boost:        "Renda extra",
  subscription_cancel: "Cancelar assinatura",
  pay_bill_now:        "Pagar conta",
  reduce_spending:     "Cortar categoria",
};

function DeltaValue({ delta, prefix = "", suffix = "", inverse = false }: {
  delta: number;
  prefix?: string;
  suffix?: string;
  inverse?: boolean;
}) {
  const positive = inverse ? delta < 0 : delta > 0;
  const formatted = `${delta >= 0 ? "+" : ""}${prefix}${Math.abs(delta).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}${suffix}`;
  const color = positive ? "text-profit" : delta === 0 ? "text-text-muted" : "text-expense";

  return <span className={cn("font-bold tabular-nums", color)}>{formatted}</span>;
}

function ResultCard({ result }: { result: SimulationResult }) {
  const { delta, isViable } = result;
  const s = result.simulated;

  return (
    <div className={cn(
      "rounded-xl border p-4 space-y-3",
      isViable ? "border-profit/25 bg-profit/5" : "border-expense/30 bg-expense/8"
    )}>
      {/* Viability */}
      <div className="flex items-center gap-2">
        {isViable
          ? <CheckCircle2 className="h-4 w-4 text-profit shrink-0" />
          : <AlertTriangle className="h-4 w-4 text-expense shrink-0" />}
        <p className={cn("text-sm font-bold", isViable ? "text-profit" : "text-expense")}>
          {isViable ? "Cenário viável — sem novos riscos" : "Cenário cria risco financeiro"}
        </p>
      </div>

      {/* Metrics comparison */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-border/20">
          <p className="text-xs text-text-muted mb-1">Dinheiro livre</p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            {formatCurrency(s.freeMoneyReal)}
          </p>
          <DeltaValue delta={delta.freeMoneyReal} prefix="R$ " />
        </div>
        <div className="p-3 rounded-lg bg-border/20">
          <p className="text-xs text-text-muted mb-1">Pressão financeira</p>
          <p className="text-sm font-semibold text-text-primary">{s.pressureScore}%</p>
          <DeltaValue delta={delta.pressureScore} suffix="%" inverse />
        </div>
        <div className="p-3 rounded-lg bg-border/20">
          <p className="text-xs text-text-muted mb-1">Sobra projetada</p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            {formatCurrency(s.surplusProjected)}
          </p>
          <DeltaValue delta={delta.surplusProjected} prefix="R$ " />
        </div>
        <div className="p-3 rounded-lg bg-border/20">
          <p className="text-xs text-text-muted mb-1">Comprometido 30d</p>
          <p className="text-sm font-semibold text-text-primary tabular-nums">
            {formatCurrency(s.committedNext30Days)}
          </p>
          <DeltaValue delta={delta.committedNext30Days} prefix="R$ " inverse />
        </div>
      </div>

      {/* Risk date */}
      {s.nextRiskDate && (
        <div className="flex items-center gap-2 text-expense text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Saldo negativo projetado: <strong>{s.nextRiskDate}</strong></span>
        </div>
      )}
    </div>
  );
}

export function SimulationPanel({ rawInput }: SimulationPanelProps) {
  const [scenarios, setScenarios] = useState<SimulationScenario[]>([]);
  const [form, setForm] = useState<ScenarioForm>(DEFAULT_FORM);
  const [showForm, setShowForm] = useState(false);

  const result = useMemo<SimulationResult | null>(() => {
    if (!rawInput || scenarios.length === 0) return null;
    return runSimulation(rawInput, scenarios);
  }, [rawInput, scenarios]);

  function addPreset(presetId: string) {
    const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
    if (!preset) return;
    const id = `${preset.id}-${Date.now()}`;
    setScenarios((prev) => [...prev, { id, ...preset.scenario }]);
  }

  function addCustom() {
    const amount = parseFloat(form.amount.replace(",", "."));
    if (!form.label || isNaN(amount) || amount <= 0) return;
    const id = `custom-${Date.now()}`;
    setScenarios((prev) => [
      ...prev,
      {
        id,
        type: form.type,
        label: form.label,
        amount,
        installments: parseInt(form.installments) || 1,
      },
    ]);
    setForm(DEFAULT_FORM);
    setShowForm(false);
  }

  function remove(id: string) {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }

  function clearAll() {
    setScenarios([]);
  }

  if (!rawInput) {
    return (
      <div className="cockpit-card p-6 text-center">
        <Zap className="h-8 w-8 text-text-muted mx-auto mb-2" />
        <p className="text-sm text-text-muted">Carregando dados para simulação...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-text-primary">Simulador &ldquo;E se&hellip;&rdquo;</h3>
          <p className="text-xs text-text-muted mt-0.5">
            Simule decisões e veja o impacto imediato no seu fluxo
          </p>
        </div>
        {scenarios.length > 0 && (
          <button
            onClick={clearAll}
            className="text-xs text-text-muted hover:text-expense transition-colors flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" /> Limpar
          </button>
        )}
      </div>

      {/* Presets */}
      <div className="grid grid-cols-2 gap-2">
        {PRESET_SCENARIOS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => addPreset(preset.id)}
            className="text-left p-3 rounded-xl border border-border/40 bg-border/15 hover:border-accent/30 hover:bg-accent/5 transition-all"
          >
            <p className="text-sm font-semibold text-text-primary">{preset.label}</p>
            <p className="text-xs text-text-muted mt-0.5">{preset.description}</p>
          </button>
        ))}
      </div>

      {/* Custom scenario form */}
      {showForm ? (
        <div className="cockpit-card p-4 space-y-3">
          <p className="text-sm font-semibold text-text-primary">Cenário personalizado</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-text-muted block mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as SimulationScenario["type"] }))}
                className="w-full text-sm rounded-lg border border-border bg-surface p-2 text-text-primary"
              >
                {(Object.keys(TYPE_LABELS) as SimulationScenario["type"][]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Valor (R$)</label>
              <input
                type="number"
                placeholder="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full text-sm rounded-lg border border-border bg-surface p-2 text-text-primary"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-text-muted block mb-1">Descrição</label>
            <input
              type="text"
              placeholder="Ex: iPhone 16"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              className="w-full text-sm rounded-lg border border-border bg-surface p-2 text-text-primary"
            />
          </div>
          {form.type === "new_installment" && (
            <div>
              <label className="text-xs text-text-muted block mb-1">Número de parcelas</label>
              <input
                type="number"
                min="1" max="48"
                value={form.installments}
                onChange={(e) => setForm((f) => ({ ...f, installments: e.target.value }))}
                className="w-full text-sm rounded-lg border border-border bg-surface p-2 text-text-primary"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={addCustom}
              className="flex-1 py-2 rounded-lg bg-accent/20 text-accent text-sm font-semibold hover:bg-accent/30 transition-colors"
            >
              Adicionar
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border border-border/40 text-text-muted text-sm hover:text-text-primary transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border/50 text-sm text-text-muted hover:border-accent/40 hover:text-accent transition-all"
        >
          <Plus className="h-4 w-4" /> Cenário personalizado
        </button>
      )}

      {/* Active scenarios */}
      {scenarios.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Cenários ativos ({scenarios.length})
          </p>
          {scenarios.map((s) => (
            <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-border/15 border border-border/30">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary truncate">{s.label}</p>
                <p className="text-xs text-text-muted">
                  {TYPE_LABELS[s.type]}
                  {s.type === "new_installment" && ` · ${s.installments}x`}
                  {" · "}
                  {formatCurrency(s.amount)}
                </p>
              </div>
              <button onClick={() => remove(s.id)} className="text-text-muted hover:text-expense transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Result */}
      {result && <ResultCard result={result} />}

      {scenarios.length === 0 && (
        <p className="text-xs text-text-muted text-center py-2">
          Adicione um cenário acima para ver o impacto no seu fluxo financeiro
        </p>
      )}
    </div>
  );
}
