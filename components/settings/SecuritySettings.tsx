"use client";

import { useState } from "react";
import { Clock3, KeyRound, SmartphoneNfc, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FormField } from "@/components/shared/FormField";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";

interface SecuritySettingsProps {
  loading: boolean;
  changingPassword: boolean;
  endingSessions: boolean;
  lastAccess: string | null;
  onChangePassword: (nextPassword: string) => Promise<void>;
  onEndSessions: () => Promise<void>;
}

function formatLastAccess(value: string | null) {
  if (!value) {
    return "Sem registro recente";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function SecuritySettings({
  loading,
  changingPassword,
  endingSessions,
  lastAccess,
  onChangePassword,
  onEndSessions,
}: SecuritySettingsProps) {
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handlePasswordSubmit = async () => {
    if (password.length < 6) {
      setPasswordError("Use pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("As senhas precisam ser iguais.");
      return;
    }

    setPasswordError(null);
    try {
      await onChangePassword(password);
      setPassword("");
      setConfirmPassword("");
      setPasswordDialogOpen(false);
    } catch {
      return;
    }
  };

  return (
    <>
      <Card className="border-border/80 bg-surface/95">
        <CardHeader>
          <CardTitle>Seguranca</CardTitle>
          <CardDescription>
            Revise acessos importantes e mantenha sua conta protegida sem sair do fluxo do dia a dia.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <KeyRound className="h-4 w-4 text-warning" />
                  Alterar senha
                </div>
                <p className="mb-4 text-sm text-text-secondary">
                  Atualize sua senha sempre que quiser reforcar a seguranca da conta.
                </p>
                <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(true)}>
                  Alterar senha
                </Button>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Unplug className="h-4 w-4 text-accent" />
                  Encerrar sessoes ativas
                </div>
                <p className="mb-4 text-sm text-text-secondary">
                  Desconecte outros dispositivos para recuperar controle da conta rapidamente.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSessionsDialogOpen(true)}
                  loading={endingSessions}
                >
                  Encerrar sessoes
                </Button>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <SmartphoneNfc className="h-4 w-4 text-profit" />
                  Autenticacao em dois fatores
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-text-secondary">
                    Recurso reservado para a proxima camada de protecao da plataforma.
                  </p>
                  <Badge variant="secondary">Em breve</Badge>
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                  <Clock3 className="h-4 w-4 text-text-primary" />
                  Ultimo acesso
                </div>
                <p className="text-sm text-text-secondary">{formatLastAccess(lastAccess)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar senha</DialogTitle>
            <DialogDescription>
              Escolha uma nova senha para sua conta. Ela sera aplicada na proxima autenticacao.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="Nova senha" error={passwordError ?? undefined}>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimo de 6 caracteres"
              />
            </FormField>

            <FormField label="Confirmar nova senha">
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repita a nova senha"
              />
            </FormField>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)} disabled={changingPassword}>
              Cancelar
            </Button>
            <Button type="button" onClick={handlePasswordSubmit} loading={changingPassword}>
              Salvar nova senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={sessionsDialogOpen}
        onOpenChange={setSessionsDialogOpen}
        title="Encerrar outras sessoes"
        description="Voce sera mantido neste dispositivo, mas os outros acessos ativos serao desconectados."
        confirmLabel="Encerrar sessoes"
        cancelLabel="Cancelar"
        loading={endingSessions}
        variant="default"
        onConfirm={async () => {
          try {
            await onEndSessions();
            setSessionsDialogOpen(false);
          } catch {
            return;
          }
        }}
      />
    </>
  );
}
