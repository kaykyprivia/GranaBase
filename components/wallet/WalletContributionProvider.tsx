"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { getSupabaseErrorMessage } from "@/lib/settings";
import { walletContributionSchema, type WalletContributionFormData } from "@/lib/validations";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";

interface WalletContributionContextValue {
  openContributionDialog: () => void;
}

interface WalletContributionProviderProps {
  children: React.ReactNode;
}

const WalletContributionContext = createContext<WalletContributionContextValue | null>(null);

const EMPTY_FORM: WalletContributionFormData = {
  amount: 0,
  type: "deposit",
  description: "",
};

export function WalletContributionProvider({ children }: WalletContributionProviderProps) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WalletContributionFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof WalletContributionFormData, string>>>({});

  const resetForm = useCallback(() => {
    setForm(EMPTY_FORM);
    setErrors({});
  }, []);

  const openContributionDialog = useCallback(() => {
    resetForm();
    setOpen(true);
  }, [resetForm]);

  const contextValue = useMemo(
    () => ({ openContributionDialog }),
    [openContributionDialog]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});

    const parsed = walletContributionSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof WalletContributionFormData, string>> = {};
      parsed.error.errors.forEach((issue) => {
        const key = issue.path[0] as keyof WalletContributionFormData;
        nextErrors[key] = issue.message;
      });
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("record_investment_contribution", coerceMutation({
        p_amount: parsed.data.amount,
        p_type: parsed.data.type,
        p_description: parsed.data.description || null,
      }));

      if (error) {
        throw error;
      }

      toast.success(parsed.data.type === "deposit" ? "Aporte registrado" : "Retirada registrada");
      setOpen(false);
      resetForm();
      window.dispatchEvent(new Event("wallet:changed"));
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error) || "Nao foi possivel registrar a movimentacao");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WalletContributionContext.Provider value={contextValue}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo aporte</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Valor" error={errors.amount} required>
                <CurrencyInput
                  key={open ? "contribution-open" : "contribution-closed"}
                  value={form.amount}
                  onChange={(value) => setForm((current) => ({ ...current, amount: value }))}
                  error={errors.amount}
                />
              </FormField>

              <FormField label="Tipo" error={errors.type} required>
                <Select
                  value={form.type}
                  onValueChange={(value) => setForm((current) => ({ ...current, type: value as WalletContributionFormData["type"] }))}
                >
                  <SelectTrigger error={errors.type}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">Aporte</SelectItem>
                    <SelectItem value="withdraw">Retirada</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField label="Descricao">
              <Textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Ex: aporte mensal, resgate parcial..."
              />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Confirmar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </WalletContributionContext.Provider>
  );
}

export function useWalletContributionDialog() {
  const context = useContext(WalletContributionContext);

  if (!context) {
    throw new Error("useWalletContributionDialog must be used inside WalletContributionProvider");
  }

  return context;
}

export function GlobalContributionButton({
  children = "Novo aporte",
  className,
  onClick,
  ...props
}: ButtonProps) {
  const { openContributionDialog } = useWalletContributionDialog();

  return (
    <Button
      className={className}
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          openContributionDialog();
        }
      }}
    >
      <PlusCircle className="h-4 w-4" />
      {children}
    </Button>
  );
}
