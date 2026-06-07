"use client";

import { Mail, Phone, RotateCcw, Save, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField } from "@/components/shared/FormField";
import type { ProfileFormState } from "@/components/settings/types";

interface ProfileSettingsProps {
  value: ProfileFormState;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  onFieldChange: <K extends keyof ProfileFormState>(field: K, fieldValue: ProfileFormState[K]) => void;
  onSave: () => void;
  onReset: () => void;
}

export function ProfileSettings({
  value,
  loading,
  saving,
  dirty,
  onFieldChange,
  onSave,
  onReset,
}: ProfileSettingsProps) {
  return (
    <Card id="profile" className="border-border/80 bg-surface/95">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle>Perfil</CardTitle>
          {dirty && <Badge variant="warning">Nao salvo</Badge>}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4">
              <FormField label="Nome completo" required>
                <Input
                  value={value.fullName}
                  onChange={(event) => onFieldChange("fullName", event.target.value)}
                  leftIcon={<UserRound className="h-4 w-4" />}
                  placeholder="Seu nome completo"
                />
              </FormField>

              <FormField label="Email" hint="Email principal de acesso — nao editavel.">
                <Input value={value.email} disabled leftIcon={<Mail className="h-4 w-4" />} />
              </FormField>

              <FormField label="Telefone" hint="Opcional.">
                <Input
                  value={value.phone}
                  onChange={(event) => onFieldChange("phone", event.target.value)}
                  leftIcon={<Phone className="h-4 w-4" />}
                  placeholder="(11) 99999-9999"
                />
              </FormField>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={onSave} loading={saving} className="gap-2">
                <Save className="h-4 w-4" />
                Salvar alteracoes
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
