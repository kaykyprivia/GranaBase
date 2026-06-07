"use client";

import { useEffect, useState } from "react";
import { Archive, Download, RotateCcw, Save } from "lucide-react";
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

function isCustomCategory(cat: string) {
  return cat !== "" && !EXPENSE_CATEGORIES.includes(cat);
}

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
  const [customCategoryText, setCustomCategoryText] = useState(() =>
    isCustomCategory(value.defaultExpenseCategory) ? value.defaultExpenseCategory : ""
  );
  const [showCustomInput, setShowCustomInput] = useState(() =>
    isCustomCategory(value.defaultExpenseCategory) || value.defaultExpenseCategory === "Outro"
  );

  useEffect(() => {
    const custom = isCustomCategory(value.defaultExpenseCategory);
    setShowCustomInput(custom || value.defaultExpenseCategory === "Outro");
    if (custom) setCustomCategoryText(value.defaultExpenseCategory);
    else if (!showCustomInput) setCustomCategoryText("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.defaultExpenseCategory]);

  const selectValue = showCustomInput ? "Outro" : value.defaultExpenseCategory;

  const handleCategoryChange = (next: string) => {
    if (next === "Outro") {
      setShowCustomInput(true);
      setCustomCategoryText("");
      onFieldChange("defaultExpenseCategory", "Outro");
    } else {
      setShowCustomInput(false);
      setCustomCategoryText("");
      onFieldChange("defaultExpenseCategory", next);
    }
  };

  const handleCustomTextChange = (typed: string) => {
    setCustomCategoryText(typed);
    onFieldChange("defaultExpenseCategory", typed.trim() || "Outro");
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
                <Select value={selectValue} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWN_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="Outro">Outro (personalizado)</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            {showCustomInput && (
              <FormField label="Nome da categoria personalizada" hint="Esta sera salva como sua categoria padrao.">
                <Input
                  value={customCategoryText}
                  onChange={(e) => handleCustomTextChange(e.target.value)}
                  placeholder="Ex: Academia, Pets, Farmacia..."
                  autoFocus
                />
              </FormField>
            )}

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
