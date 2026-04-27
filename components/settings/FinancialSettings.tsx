"use client";

import { Download, Landmark, RotateCcw, Save, Wallet } from "lucide-react";
import { EXPENSE_CATEGORIES } from "@/lib/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import type { FinancialFormState } from "@/components/settings/types";

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
  return (
    <Card className="border-border/80 bg-surface/95">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Financeiro</CardTitle>
            <CardDescription>
              Ajuste padroes que aceleram seus lancamentos e mantenha uma copia dos seus dados quando precisar.
            </CardDescription>
          </div>
          {dirty && <Badge variant="warning">Alteracoes nao salvas</Badge>}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-xl" />
            ))}
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <FormField label="Moeda principal" hint="Base para preferencia financeira da conta.">
                <Select
                  value={value.primaryCurrency}
                  onValueChange={(nextValue) =>
                    onFieldChange("primaryCurrency", nextValue as FinancialFormState["primaryCurrency"])
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
                  onValueChange={(nextValue) => onFieldChange("defaultExpenseCategory", nextValue)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField label="Meta mensal padrao" hint="Valor sugerido como referencia para planejamentos e metas futuras.">
              <CurrencyInput
                value={value.monthlyGoalDefault}
                onChange={(nextValue) => onFieldChange("monthlyGoalDefault", nextValue)}
              />
            </FormField>

            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-primary">
                <Landmark className="h-4 w-4 text-warning" />
                Backup e portabilidade
              </div>
              <p className="mb-4 text-sm text-text-secondary">
                Exporte seus dados em CSV para manter um backup local ou analisar informacoes fora do app.
              </p>
              <Button type="button" variant="outline" onClick={onExport} loading={exporting} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar dados
              </Button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={onSave} loading={saving} className="gap-2">
                <Save className="h-4 w-4" />
                Salvar preferencias financeiras
              </Button>
              <Button type="button" variant="outline" onClick={onReset} disabled={saving || !dirty} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Descartar mudancas
              </Button>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                <Wallet className="h-4 w-4 text-accent" />
                Operacao mais rapida
              </div>
              <p className="text-sm text-text-secondary">
                Seus lancamentos futuros podem usar esses padroes para reduzir cliques e manter consistencia financeira.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
