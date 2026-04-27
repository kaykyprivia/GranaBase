"use client";

import { ImageIcon, Mail, Phone, RotateCcw, Save, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

function toTitleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getDisplayName(value: ProfileFormState) {
  if (value.fullName.trim()) {
    return toTitleCase(value.fullName);
  }

  const emailPrefix = value.email.split("@")[0] ?? "Granabase";
  return toTitleCase(emailPrefix.replace(/[._-]+/g, " "));
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "GB";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
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
  const displayName = getDisplayName(value);
  const initials = getInitials(displayName);

  return (
    <Card id="profile" className="border-border/80 bg-surface/95">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Perfil</CardTitle>
            <CardDescription>
              Atualize seus dados principais e mantenha sua conta sempre identificada do seu jeito.
            </CardDescription>
          </div>
          {dirty && <Badge variant="warning">Alteracoes nao salvas</Badge>}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-background/40 p-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-background/40 p-4 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent via-sky-400 to-cyan-300 text-lg font-bold text-slate-950 shadow-sm">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text-primary">{displayName}</p>
                <p className="truncate text-sm text-text-secondary">{value.email || "Sem email principal"}</p>
                <p className="mt-1 text-xs text-text-secondary">
                  O avatar pode ser definido por URL e os demais dados ficam salvos na sua conta.
                </p>
              </div>
            </div>

            <div className="grid gap-4">
              <FormField label="Nome completo" required>
                <Input
                  value={value.fullName}
                  onChange={(event) => onFieldChange("fullName", event.target.value)}
                  leftIcon={<UserRound className="h-4 w-4" />}
                  placeholder="Seu nome completo"
                />
              </FormField>

              <FormField label="Email" hint="Seu email principal de acesso.">
                <Input value={value.email} disabled leftIcon={<Mail className="h-4 w-4" />} />
              </FormField>

              <div className="grid gap-4 lg:grid-cols-2">
                <FormField label="Telefone" hint="Opcional para contato e futuras notificacoes.">
                  <Input
                    value={value.phone}
                    onChange={(event) => onFieldChange("phone", event.target.value)}
                    leftIcon={<Phone className="h-4 w-4" />}
                    placeholder="(11) 99999-9999"
                  />
                </FormField>

                <FormField label="Avatar (URL opcional)" hint="Use uma imagem publica se quiser personalizar seu perfil.">
                  <Input
                    value={value.avatarUrl}
                    onChange={(event) => onFieldChange("avatarUrl", event.target.value)}
                    leftIcon={<ImageIcon className="h-4 w-4" />}
                    placeholder="https://..."
                  />
                </FormField>
              </div>
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
