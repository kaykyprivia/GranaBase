"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, CreditCard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { getEffectiveInstallmentStatus } from "@/lib/finance";
import { addMonths, cn, formatCurrency, formatDate } from "@/lib/utils";
import { installmentSchema, type InstallmentFormData } from "@/lib/validations";
import type { Installment, InstallmentPayment } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { StatCard } from "@/components/shared/StatCard";

interface InstallmentWithPayments extends Installment {
  payments: InstallmentPayment[];
}

const EMPTY_FORM: InstallmentFormData = {
  description: "",
  total_amount: 0,
  installment_count: 1,
  first_due_date: "",
  notes: "",
};

export default function InstallmentsPage() {
  const supabase = createClient();
  const [items, setItems] = useState<InstallmentWithPayments[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [form, setForm] = useState<InstallmentFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof InstallmentFormData, string>>>({});

  const installmentAmount = form.installment_count > 0 ? form.total_amount / form.installment_count : 0;

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const { data: installmentsData } = await supabase
      .from("installments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const { data: paymentsData } = await supabase
      .from("installment_payments")
      .select("*")
      .eq("user_id", user.id)
      .order("installment_number");

    const installments = coerceData<Installment[]>(installmentsData ?? []);
    const payments = coerceData<InstallmentPayment[]>(paymentsData ?? []);

    const grouped = installments.map((installment) => ({
      ...installment,
      payments: payments.filter((payment) => payment.installment_id === installment.id),
    }));

    setItems(grouped);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormErrors({});
    const result = installmentSchema.safeParse(form);

    if (!result.success) {
      const nextErrors: Partial<Record<keyof InstallmentFormData, string>> = {};
      result.error.errors.forEach((issue) => {
        nextErrors[issue.path[0] as keyof InstallmentFormData] = issue.message;
      });
      setFormErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      const unitAmount = result.data.total_amount / result.data.installment_count;
      const { data: createdData, error } = await supabase
        .from("installments")
        .insert(coerceMutation({
          user_id: userId,
          description: result.data.description,
          total_amount: result.data.total_amount,
          installment_count: result.data.installment_count,
          installment_amount: unitAmount,
          first_due_date: result.data.first_due_date,
          notes: result.data.notes || null,
        }))
        .select()
        .single();

      const created = createdData ? coerceData<Installment>(createdData) : null;
      if (error || !created) {
        throw error;
      }

      const payments = Array.from({ length: result.data.installment_count }, (_, index) => {
        const dueDate = addMonths(new Date(`${result.data.first_due_date}T00:00:00`), index);
        return {
          user_id: userId,
          installment_id: created.id,
          installment_number: index + 1,
          due_date: dueDate.toISOString().split("T")[0],
          amount: unitAmount,
          status: "pending" as const,
        };
      });

      await supabase.from("installment_payments").insert(coerceMutation(payments));
      toast.success(`Parcelamento criado com ${result.data.installment_count} parcelas`);
      setForm(EMPTY_FORM);
      setModalOpen(false);
      await fetchData();
    } catch {
      toast.error("Erro ao criar parcelamento");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaymentPaid = async (paymentId: string) => {
    setMarkingPaidId(paymentId);
    try {
      const { error } = await supabase
        .from("installment_payments")
        .update(coerceMutation({ status: "paid" as const, paid_at: new Date().toISOString() }))
        .eq("id", paymentId);

      if (error) {
        throw error;
      }

      toast.success("Parcela marcada como paga");
      await fetchData();
    } catch {
      toast.error("Erro ao marcar parcela");
    } finally {
      setMarkingPaidId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }

    setDeleting(true);
    try {
      await supabase.from("installment_payments").delete().eq("installment_id", deleteId);
      const { error } = await supabase.from("installments").delete().eq("id", deleteId);
      if (error) {
        throw error;
      }
      setItems((current) => current.filter((item) => item.id !== deleteId));
      toast.success("Parcelamento excluido");
    } catch {
      toast.error("Erro ao excluir parcelamento");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const totalPending = items
    .flatMap((item) => item.payments)
    .filter((payment) => getEffectiveInstallmentStatus(payment) !== "paid")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalPaid = items
    .flatMap((item) => item.payments)
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-accent/20 p-2.5">
            <CreditCard className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Parcelas</h1>
            <p className="text-sm text-text-secondary">Controle compras parceladas, prazos e saldo restante.</p>
          </div>
        </div>
        <Button
          onClick={() => {
            setForm(EMPTY_FORM);
            setFormErrors({});
            setModalOpen(true);
          }}
          size="sm"
          className="gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo parcelamento</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard title="A pagar" value={formatCurrency(totalPending)} icon={CreditCard} variant="warning" loading={loading} />
        <StatCard title="Ja pago" value={formatCurrency(totalPaid)} icon={Check} variant="profit" loading={loading} />
        <StatCard title="Parcelamentos" value={String(items.length)} icon={CreditCard} variant="default" loading={loading} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum parcelamento"
          description="Registre uma compra parcelada para acompanhar pagas, faltantes, proxima e restante."
          actionLabel="+ Novo parcelamento"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const paidCount = item.payments.filter((payment) => payment.status === "paid").length;
            const progress = item.installment_count > 0 ? (paidCount / item.installment_count) * 100 : 0;
            const nextPayment = item.payments.find((payment) => getEffectiveInstallmentStatus(payment) !== "paid");
            const paidAmount = item.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
            const remainingCount = item.installment_count - paidCount;
            const remainingAmount = item.total_amount - paidAmount;
            const expanded = expandedId === item.id;

            return (
              <Card key={item.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-text-primary">{item.description}</h3>
                      <p className="mt-0.5 text-sm text-text-secondary">
                        {formatCurrency(item.installment_amount)}/parcela · Total: {formatCurrency(item.total_amount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteId(item.id)}
                        className="text-text-secondary hover:bg-expense/10 hover:text-expense"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        className="text-text-secondary hover:text-text-primary"
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-text-secondary">{paidCount} de {item.installment_count} pagas</span>
                      <span className={cn("font-semibold", progress >= 80 ? "text-profit" : progress >= 40 ? "text-warning" : "text-accent")}>
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                    <Progress
                      value={progress}
                      className="h-1.5"
                      indicatorClassName={progress >= 80 ? "bg-profit" : progress >= 40 ? "bg-warning" : "bg-accent"}
                    />
                    <div className="mt-1 flex items-center justify-between text-xs text-text-secondary">
                      <span>Pago: {formatCurrency(paidAmount)}</span>
                      {nextPayment && <span>Proxima: {formatDate(nextPayment.due_date)}</span>}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                        <span className="block text-text-secondary">Faltantes</span>
                        <span className="mt-1 block font-semibold text-text-primary">{remainingCount}</span>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                        <span className="block text-text-secondary">Restante</span>
                        <span className="mt-1 block font-semibold text-text-primary">{formatCurrency(remainingAmount)}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {expanded && (
                  <CardContent className="pt-0">
                    <div className="space-y-2 border-t border-border pt-3">
                      {item.payments.map((payment) => {
                        const effectiveStatus = getEffectiveInstallmentStatus(payment);

                        return (
                          <div key={payment.id} className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2">
                            <div className="flex items-center gap-3">
                              <span className="w-14 text-xs font-medium text-text-secondary">
                                {payment.installment_number}/{item.installment_count}
                              </span>
                              <span className="text-sm text-text-primary">{formatDate(payment.due_date)}</span>
                              <Badge variant={effectiveStatus} className="text-[10px]">
                                {effectiveStatus === "paid" ? "Paga" : effectiveStatus === "overdue" ? "Atrasada" : "Pendente"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn("text-sm font-semibold", effectiveStatus === "paid" ? "text-profit" : "text-text-primary")}>
                                {formatCurrency(payment.amount)}
                              </span>
                              {effectiveStatus !== "paid" && (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleMarkPaymentPaid(payment.id)}
                                  disabled={markingPaidId === payment.id}
                                  className="text-profit hover:bg-profit/10"
                                  title="Marcar como paga"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo parcelamento</DialogTitle>
            <DialogDescription>Crie uma compra parcelada e gere as parcelas automaticamente.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <FormField label="Descricao" error={formErrors.description} required>
              <Input
                placeholder="Ex: Notebook Samsung"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                error={formErrors.description}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Valor total" error={formErrors.total_amount} required>
                <CurrencyInput
                  value={form.total_amount}
                  onChange={(value) => setForm((current) => ({ ...current, total_amount: value }))}
                  error={formErrors.total_amount}
                />
              </FormField>
              <FormField label="Numero de parcelas" error={formErrors.installment_count} required>
                <Input
                  type="number"
                  min={1}
                  max={360}
                  value={form.installment_count}
                  onChange={(event) => setForm((current) => ({ ...current, installment_count: parseInt(event.target.value, 10) || 1 }))}
                  error={formErrors.installment_count}
                />
              </FormField>
            </div>

            {form.total_amount > 0 && form.installment_count > 0 && (
              <div className="rounded-lg border border-accent/20 bg-accent/10 p-3">
                <p className="text-sm font-medium text-accent">
                  {form.installment_count}x de {formatCurrency(installmentAmount)}
                </p>
              </div>
            )}

            <FormField label="Vencimento da primeira parcela" error={formErrors.first_due_date} required>
              <Input
                type="date"
                value={form.first_due_date}
                onChange={(event) => setForm((current) => ({ ...current, first_due_date: event.target.value }))}
                error={formErrors.first_due_date}
              />
            </FormField>

            <FormField label="Observacoes">
              <Textarea
                placeholder="Notas opcionais..."
                value={form.notes ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={2}
              />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                Criar parcelamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir parcelamento"
        description="Todas as parcelas serao excluidas. Esta acao nao pode ser desfeita."
        confirmLabel="Excluir tudo"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
