"use client";

import { RotateCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField } from "@/components/shared/FormField";
import type { PreferenceFormState } from "@/components/settings/types";

interface PreferenceSettingsProps {
  value: PreferenceFormState;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  onFieldChange: <K extends keyof PreferenceFormState>(field: K, fieldValue: PreferenceFormState[K]) => void;
  onSave: () => void;
  onReset: () => void;
}

export function PreferenceSettings({
  value,
  loading,
  saving,
  dirty,
  onFieldChange,
  onSave,
  onReset,
}: PreferenceSettingsProps) {
  return (
    <Card className="border-border/80 bg-surface/95">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Preferencias do app</CardTitle>
            <CardDescription>
              Defina como o produto deve apresentar valores, agenda e sinais visuais no dia a dia.
            </CardDescription>
          </div>
          {dirty && <Badge variant="warning">Alteracoes nao salvas</Badge>}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <FormField label="Tema preferido" hint="Preferencia salva para futuras variacoes de interface.">
                <Select
                  value={value.themePreference}
                  onValueChange={(nextValue) =>
                    onFieldChange("themePreference", nextValue as PreferenceFormState["themePreference"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Escuro</SelectItem>
                    <SelectItem value="light">Claro</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Formato de moeda" hint="Usado para exibicoes e exportacoes futuras.">
                <Select
                  value={value.currencyFormat}
                  onValueChange={(nextValue) =>
                    onFieldChange("currencyFormat", nextValue as PreferenceFormState["currencyFormat"])
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
            </div>

            <FormField label="Primeiro dia da semana">
              <Select
                value={value.weekStart}
                onValueChange={(nextValue) =>
                  onFieldChange("weekStart", nextValue as PreferenceFormState["weekStart"])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monday">Segunda-feira</SelectItem>
                  <SelectItem value="sunday">Domingo</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

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
