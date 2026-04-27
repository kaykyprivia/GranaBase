"use client";

import { Crown, LogOut, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useState } from "react";
import type { PlanType } from "@/components/settings/types";

interface AccountSettingsProps {
  loading: boolean;
  plan: PlanType;
  email: string;
  loggingOut: boolean;
  deletingAccount: boolean;
  onLogout: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}

export function AccountSettings({
  loading,
  plan,
  email,
  loggingOut,
  deletingAccount,
  onLogout,
  onDeleteAccount,
}: AccountSettingsProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <>
      <Card className="border-border/80 bg-surface/95">
        <CardHeader>
          <CardTitle>Conta</CardTitle>
          <CardDescription>
            Gerencie seu plano, saia com seguranca e controle a permanencia da sua conta.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Crown className="h-4 w-4 text-warning" />
                  Plano atual
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={plan === "pro" ? "warning" : "secondary"}>
                    {plan === "pro" ? "Plano Pro" : "Plano Free"}
                  </Badge>
                  <p className="text-sm text-text-secondary">{email || "Conta principal do GranaBase"}</p>
                </div>
                <div className="mt-4">
                  <Button type="button" variant="warning" disabled className="gap-2">
                    <Sparkles className="h-4 w-4" />
                    Upgrade para Pro em breve
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <LogOut className="h-4 w-4 text-accent" />
                  Sessao da conta
                </div>
                <p className="mb-4 text-sm text-text-secondary">
                  Saia deste dispositivo a qualquer momento mantendo seus dados protegidos.
                </p>
                <Button type="button" variant="outline" onClick={onLogout} loading={loggingOut} className="gap-2">
                  <LogOut className="h-4 w-4" />
                  Sair da conta
                </Button>
              </div>

              <div className="rounded-2xl border border-expense/25 bg-expense/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <ShieldAlert className="h-4 w-4 text-expense" />
                  Zona de perigo
                </div>
                <p className="mb-4 text-sm text-text-secondary">
                  Excluir a conta remove acesso e dados associados. Essa acao deve ser usada apenas quando necessario.
                </p>
                <Button type="button" variant="destructive" onClick={() => setDeleteDialogOpen(true)} className="gap-2">
                  <Trash2 className="h-4 w-4" />
                  Excluir conta
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Excluir conta"
        description="Essa acao encerra seu acesso e remove sua conta. Use apenas se tiver certeza."
        confirmLabel="Excluir conta"
        cancelLabel="Cancelar"
        loading={deletingAccount}
        onConfirm={async () => {
          try {
            await onDeleteAccount();
            setDeleteDialogOpen(false);
          } catch {
            return;
          }
        }}
      />
    </>
  );
}
