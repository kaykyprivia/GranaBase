"use client";

import { useState } from "react";
import { X, Plus, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTER_COLORS } from "@/lib/filter-engine";
import type { CreateFilterData, UserFilter } from "@/lib/filter-engine";
import type { UseFiltersReturn } from "@/hooks/useFilters";

const PRESET_ICONS = ["🏠", "🛒", "🍕", "💊", "🚗", "💳", "📱", "🎮", "✈️", "💪", "🎓", "💼", "🐾", "🌱", "🎵"];

const PRESET_FILTERS: Array<Omit<CreateFilterData, "isPinned">> = [
  { name: "Água / Saneamento", color: "accent",  icon: "💧", terms: ["agua", "sabesp", "saneamento"], categories: [], statuses: [], target: "all" },
  { name: "Energia Elétrica",  color: "warning", icon: "⚡", terms: ["energia", "luz", "enel", "cemig"], categories: [], statuses: [], target: "all" },
  { name: "Delivery / Comida", color: "expense", icon: "🍕", terms: ["delivery", "ifood", "rappi"], categories: ["Alimentacao"], statuses: [], target: "all" },
  { name: "Streaming",         color: "growth",  icon: "📺", terms: ["netflix", "spotify", "disney", "streaming"], categories: ["Assinatura"], statuses: [], target: "all" },
  { name: "Supermercado",      color: "profit",  icon: "🛒", terms: ["mercado", "supermercado", "atacadao", "carrefour"], categories: ["Mercado"], statuses: [], target: "all" },
];

interface FilterBuilderProps {
  filtersHook: UseFiltersReturn;
  editingFilter?: UserFilter | null;
  onClose: () => void;
}

type FormState = {
  name: string;
  color: string;
  icon: string;
  terms: string[];
  categories: string[];
  termInput: string;
};

const DEFAULT_FORM: FormState = {
  name: "",
  color: "accent",
  icon: "🔍",
  terms: [],
  categories: [],
  termInput: "",
};

function formFromFilter(f: UserFilter): FormState {
  return { name: f.name, color: f.color, icon: f.icon, terms: f.terms, categories: f.categories, termInput: "" };
}

export function FilterBuilder({ filtersHook, editingFilter, onClose }: FilterBuilderProps) {
  const [form, setForm] = useState<FormState>(
    editingFilter ? formFromFilter(editingFilter) : DEFAULT_FORM
  );
  const [view, setView] = useState<"list" | "create">(editingFilter ? "create" : "list");

  function addTerm() {
    const t = form.termInput.trim();
    if (t && !form.terms.includes(t)) {
      setForm((f) => ({ ...f, terms: [...f.terms, t], termInput: "" }));
    }
  }

  function removeTerm(term: string) {
    setForm((f) => ({ ...f, terms: f.terms.filter((t) => t !== term) }));
  }

  function save() {
    if (!form.name.trim() && form.terms.length === 0) return;
    const data: CreateFilterData = {
      name: form.name || form.terms[0] || "Funil",
      color: form.color,
      icon: form.icon,
      terms: form.terms,
      categories: form.categories,
      statuses: [],
      target: "all",
      isPinned: false,
    };
    if (editingFilter) {
      filtersHook.updateFilter(editingFilter.id, data);
    } else {
      filtersHook.createFilter(data);
    }
    onClose();
  }

  function addPreset(preset: Omit<CreateFilterData, "isPinned">) {
    filtersHook.createFilter({ ...preset, isPinned: false });
  }

  if (view === "list") {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-text-primary">Meus Funis</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView("create")}
              className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              <Plus className="h-4 w-4" /> Novo funil
            </button>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Presets (when no filters exist) */}
        {filtersHook.filters.length === 0 && (
          <div>
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Sugestões rápidas
            </p>
            <div className="space-y-2">
              {PRESET_FILTERS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => addPreset(preset)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-border/10 hover:border-accent/30 hover:bg-accent/5 transition-all text-left"
                >
                  <span className="text-xl">{preset.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{preset.name}</p>
                    <p className="text-xs text-text-muted">{preset.terms.slice(0, 3).join(", ")}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Saved filters */}
        {filtersHook.filters.length > 0 && (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {filtersHook.filters.map((filter) => {
              const colorConfig = FILTER_COLORS.find((c) => c.key === filter.color) ?? FILTER_COLORS[0];
              const isActive = filter.id === filtersHook.activeId;
              return (
                <div
                  key={filter.id}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border transition-all",
                    isActive
                      ? cn(colorConfig.bg, colorConfig.border)
                      : "border-border/40 bg-border/10"
                  )}
                >
                  <span className="text-xl shrink-0">{filter.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-semibold truncate", isActive ? colorConfig.text : "text-text-primary")}>
                      {filter.name}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {filter.terms.join(", ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => filtersHook.toggleFilter(filter.id)}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        isActive ? colorConfig.text : "text-text-muted hover:text-text-primary"
                      )}
                    >
                      {isActive ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => filtersHook.deleteFilter(filter.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-expense transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Create / Edit view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-text-primary">
          {editingFilter ? "Editar funil" : "Novo funil"}
        </h3>
        <button onClick={() => setView("list")} className="text-text-muted hover:text-text-primary transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Icon + Name */}
      <div className="flex gap-3">
        {/* Icon picker */}
        <div className="relative">
          <button className="w-11 h-11 rounded-xl border border-border/40 bg-border/20 flex items-center justify-center text-xl hover:border-accent/40 transition-colors">
            {form.icon}
          </button>
          {/* Icon grid (shown inline for simplicity) */}
        </div>
        <input
          type="text"
          placeholder="Nome do funil"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="flex-1 rounded-xl border border-border/40 bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
      </div>

      {/* Icon picker row */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESET_ICONS.map((icon) => (
          <button
            key={icon}
            onClick={() => setForm((f) => ({ ...f, icon }))}
            className={cn(
              "w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-all",
              form.icon === icon
                ? "bg-accent/20 ring-1 ring-accent/50"
                : "bg-border/20 hover:bg-border/40"
            )}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Color */}
      <div>
        <p className="text-xs text-text-muted mb-2">Cor</p>
        <div className="flex gap-2">
          {FILTER_COLORS.map((c) => (
            <button
              key={c.key}
              onClick={() => setForm((f) => ({ ...f, color: c.key }))}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                c.bg, c.text, c.border,
                form.color === c.key ? "ring-2 ring-offset-1 ring-offset-surface" : "opacity-60 hover:opacity-100"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Terms */}
      <div>
        <p className="text-xs text-text-muted mb-2">
          Termos de busca <span className="text-text-muted">(OR: qualquer um faz match)</span>
        </p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            placeholder="Ex: netflix, delivery, sabesp"
            value={form.termInput}
            onChange={(e) => setForm((f) => ({ ...f, termInput: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") addTerm(); }}
            className="flex-1 rounded-lg border border-border/40 bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <button
            onClick={addTerm}
            className="px-3 py-2 rounded-lg bg-accent/20 text-accent text-sm font-semibold hover:bg-accent/30 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {form.terms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.terms.map((term) => (
              <span
                key={term}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-border/30 border border-border/50 text-xs text-text-secondary"
              >
                {term}
                <button onClick={() => removeTerm(term)} className="text-text-muted hover:text-text-primary">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={!form.name.trim() && form.terms.length === 0}
        className="w-full py-2.5 rounded-xl bg-accent/20 text-accent text-sm font-bold hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {editingFilter ? "Salvar alterações" : "Criar funil"}
      </button>
    </div>
  );
}
