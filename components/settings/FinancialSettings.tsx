"use client";

import { useState } from "react";
import { Archive, Download, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import type { FinancialFormState } from "@/components/settings/types";

const KNOWN_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c !== "Outro");

interface FinancialSettingsProps {
  value: FinancialFormState;
  loading: boolean;
  saving: boolean;
  exporting: boolean;
  dirty: boolean;
  onFieldChange: <K extends keyof FinancialFormState>(field: K, fieldValue: FinancialFormState[K]) => void;
  onSave: () => void;
  onReset: () => void;
  onExport: () => void;
}

export function FinancialSettings({
  value,
  loading,
  saving,
  exporting,
  dirty,
  onFieldChange,
  onSave,
  onReset,
  onExport,
}: FinancialSettingsProps) {
  const [newCategoryText, setNewCategoryText] = useState("");

  const handleAddCategory = () => {
    const trimmed = newCategoryText.trim();
    if (!trimmed) return;
    const exists = [...EXPENSE_CATEGORIES, ...value.customCategories].some(
      (cat) => cat.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setNewCategoryText("");
      return;
    }
    onFieldChange("customCategories", [...value.customCategories, trimmed]);
    setNewCategoryText("");
  };

  const handleRemoveCategory = (cat: string) => {
    onFieldChange("customCategories", value.customCategories.filter((c) => c !== cat));
    if (value.defaultExpenseCategory === cat) {
      onFieldChange("defaultExpenseCategory", "Outro");
    }
  };

  return (
    <Card className="border-border/80 bg-surface/95">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle>Financeiro</CardTitle>
          {dirty && <Badge variant="warning">Nao salvo</Badge>}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <FormField label="Moeda principal">
                <Select
                  value={value.primaryCurrency}
                  onValueChange={(next) =>
                    onFieldChange("primaryCurrency", next as FinancialFormState["primaryCurrency"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL - Real brasileiro</SelectItem>
                    <SelectItem value="USD">USD - Dolar americano</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Categoria padrao ao lancar gasto">
                <Select
                  value={value.defaultExpenseCategory}
                  onValueChange={(next) => onFieldChange("defaultExpenseCategory", next)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWN_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    {value.customCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField
              label="Categorias personalizadas"
              hint="Crie categorias proprias para usar ao lancar gastos."
            >
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={newCategoryText}
                    onChange={(e) => setNewCategoryText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCategory();
                      }
                    }}
                    placeholder="Ex: Academia, Pets, Farmacia..."
                  />
                  <Button type="button" variant="outline" onClick={handleAddCategory} className="gap-2 shrink-0">
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>

                {value.customCategories.length > 0 && (
                  <ul className="space-y-1.5">
                    {value.customCategories.map((cat) => (
                      <li
                        key={cat}
                        className="flex items-center justify-between rounded-xl border border-border/70 bg-background/40 px-3 py-2 text-sm text-text-primary"
                      >
                        <span className="truncate">{cat}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemoveCategory(cat)}
                          className="text-text-secondary hover:text-expense hover:bg-expense/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </FormField>

            <FormField
              label="Controle de gastos mensais"
              hint="Se seus gastos do mes ultrapassarem esse valor, voce sera alertado."
            >
              <CurrencyInput
                value={value.monthlyGoalDefault}
                onChange={(next) => onFieldChange("monthlyGoalDefault", next)}
              />
            </FormField>

            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
                <Archive className="h-4 w-4 text-accent" />
                Backup e portabilidade
              </div>
              <p className="mb-4 text-sm text-text-secondary">
                Exporte seus dados em CSV para manter um backup local ou analisar fora do app.
              </p>
              <Button type="button" variant="outline" onClick={onExport} loading={exporting} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar dados
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={onSave} loading={saving} className="gap-2">
                <Save className="h-4 w-4" />
                Salvar preferencias
              </Button>
              <Button type="button" variant="outline" onClick={onReset} disabled={saving || !dirty} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Descartar mudancas
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
