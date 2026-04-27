"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Check, ChevronDown, ChevronUp, CreditCard, Pencil, Trash2 } from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { StatCard } from "@/components/shared/StatCard";

interface InstallmentWithPayments extends Installment {
  payments: InstallmentPayment[];
}

type StatusFilter = "all" | "pending" | "overdue" | "paid";

const EMPTY_FORM: InstallmentFormData = {
  description: "",
  installment_amount: 0,
  installment_count: 0,
  first_due_date: "",
  notes: "",
};

const calculateTotalAmount = (installmentAmount: number, installmentCount: number) =>
  Math.round(installmentAmount * installmentCount * 100) / 100;

function getSupabaseErrorMessage(error: unknown): string {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const err = error as { message?: string; code?: string; details?: string; hint?: string };
    return [err.message, err.code ? `code=${err.code}` : null, err.details, err.hint]
      .filter(Boolean)
      .join(" | ");
  }
  return "Erro inesperado.";
}

export interface InstallmentsPanelHandle {
  openCreateModal: () => void;
}

export const InstallmentsPanel = forwardRef<InstallmentsPanelHandle>(function InstallmentsPanel(_, ref) {
  const supabase = createClient();
  const [items, setItems] = useState<InstallmentWithPayments[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingInstallment, setEditingInstallment] = useState<InstallmentWithPayments | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [form, setForm] = useState<InstallmentFormData>(EMPTY_FORM);
  const [installmentCountInput, setInstallmentCountInput] = useState("");
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof InstallmentFormData, string>>>({});

  const installmentCount = Number(installmentCountInput);
  const isValidInstallmentCount = Number.isInteger(installmentCount) && installmentCount > 0;
  const totalAmount = form.installment_amount > 0 && isValidInstallmentCount
    ? calculateTotalAmount(form.installment_amount, installmentCount)
    : 0;

  const resetFormState = () => {
    setForm(EMPTY_FORM);
    setInstallmentCountInput("");
    setFormErrors({});
    setEditingInstallment(null);
    setFormMode("create");
  };

  const openCreateModal = () => {
    resetFormState();
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    resetFormState();
  };

  useImperativeHandle(ref, () => ({
    openCreateModal,
  }));

  const createInstallmentPayments = (installmentId: string, firstDueDate: string, unitAmount: number, count: number) =>
    Array.from({ length: count }, (_, index) => {
      const dueDate = addMonths(new Date(`${firstDueDate}T00:00:00`), index);
      return {
        user_id: userId,
        installment_id: installmentId,
        installment_number: index + 1,
        due_date: dueDate.toISOString().split("T")[0],
        amount: unitAmount,
        status: "pending" as const,
      };
    });

  const getValidatedFormData = () => {
    setFormErrors({});

    if (!isValidInstallmentCount) {
      setFormErrors({ installment_count: "Quantidade de parcelas deve ser positiva" });
      toast.error("Informe uma quantidade de parcelas valida.");
      return null;
    }

    const result = installmentSchema.safeParse({
      ...form,
      installment_count: installmentCount,
    });

    if (!result.success) {
      const nextErrors: Partial<Record<keyof InstallmentFormData, string>> = {};
      result.error.errors.forEach((issue) => {
        nextErrors[issue.path[0] as keyof InstallmentFormData] = issue.message;
      });
      setFormErrors(nextErrors);
      return null;
    }

    return result.data;
  };

  const openEditModal = (item: InstallmentWithPayments) => {
    const hasPaidPayments = item.payments.some((payment) => payment.status === "paid");

    if (hasPaidPayments) {
      toast.error("Este parcelamento ja possui parcelas pagas. Para evitar inconsistencias, edite apenas observacoes ou exclua/recrie manualmente.");
      return;
    }

    setFormMode("edit");
    setEditingInstallment(item);
    setForm({
      description: item.description,
      installment_amount: item.installment_amount,
      installment_count: item.installment_count,
      first_due_date: item.first_due_date,
      notes: item.notes ?? "",
    });
    setInstallmentCountInput(String(item.installment_count));
    setFormErrors({});
    setModalOpen(true);
  };

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const { data: installmentsData, error: installmentsError } = await supabase
      .from("installments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    const { data: paymentsData, error: paymentsError } = await supabase
      .from("installment_payments")
      .select("*")
      .eq("user_id", user.id)
      .order("installment_number");

    if (installmentsError || paymentsError) {
      toast.error(getSupabaseErrorMessage(installmentsError ?? paymentsError));
      setLoading(false);
      return;
    }

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
    void fetchData();
  }, [fetchData]);

  const handleCreate = async (values: InstallmentFormData) => {
    setSaving(true);
    try {
      const unitAmount = values.installment_amount;
      const computedTotalAmount = calculateTotalAmount(values.installment_amount, values.installment_count);
      const { data: createdData, error } = await supabase
        .from("installments")
        .insert(coerceMutation({
          user_id: userId,
          description: values.description,
          total_amount: computedTotalAmount,
          installment_count: values.installment_count,
          installment_amount: unitAmount,
          first_due_date: values.first_due_date,
          notes: values.notes || null,
        }))
        .select()
        .single();

      const created = createdData ? coerceData<Installment>(createdData) : null;
      if (error || !created) {
        throw error ?? new Error("Nao foi possivel criar o parcelamento.");
      }

      const payments = createInstallmentPayments(created.id, values.first_due_date, unitAmount, values.installment_count);
      const { error: paymentsError } = await supabase.from("installment_payments").insert(coerceMutation(payments));

      if (paymentsError) {
        throw paymentsError;
      }

      toast.success(`Parcelamento criado com ${values.installment_count} parcelas`);
      closeModal();
      await fetchData();
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (values: InstallmentFormData) => {
    if (!editingInstallment) {
      toast.error("Parcelamento nao encontrado.");
      return;
    }

    const hasPaidPayments = editingInstallment.payments.some((payment) => payment.status === "paid");

    if (hasPaidPayments) {
      toast.error("Este parcelamento ja possui parcelas pagas. Para evitar inconsistencias, edite apenas observacoes ou exclua/recrie manualmente.");
      return;
    }

    setSaving(true);
    try {
      const unitAmount = values.installment_amount;
      const computedTotalAmount = calculateTotalAmount(values.installment_amount, values.installment_count);

      const { error: updateError } = await supabase
        .from("installments")
        .update(coerceMutation({
          description: values.description,
          installment_amount: unitAmount,
          installment_count: values.installment_count,
          total_amount: computedTotalAmount,
          first_due_date: values.first_due_date,
          notes: values.notes || null,
        }))
        .eq("id", editingInstallment.id)
        .eq("user_id", userId);

      if (updateError) {
        throw updateError;
      }

      const { error: deletePaymentsError } = await supabase
        .from("installment_payments")
        .delete()
        .eq("installment_id", editingInstallment.id)
        .eq("user_id", userId);

      if (deletePaymentsError) {
        throw deletePaymentsError;
      }

      const payments = createInstallmentPayments(editingInstallment.id, values.first_due_date, unitAmount, values.installment_count);
      const { error: insertPaymentsError } = await supabase
        .from("installment_payments")
        .insert(coerceMutation(payments));

      if (insertPaymentsError) {
        throw insertPaymentsError;
      }

      toast.success("Parcelamento atualizado");
      closeModal();
      await fetchData();
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const values = getValidatedFormData();

    if (!values) {
      return;
    }

    if (formMode === "edit") {
      await handleUpdate(values);
      return;
    }

    await handleCreate(values);
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
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
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
    } catch (error) {
      toast.error(getSupabaseErrorMessage(error));
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const isPaymentOverdue = (payment: InstallmentPayment) => {
    if (payment.status === "paid") {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueDate = new Date(`${payment.due_date}T00:00:00`);
    dueDate.setHours(0, 0, 0, 0);

    return dueDate < today;
  };

  const totalPending = items
    .flatMap((item) => item.payments)
    .filter((payment) => getEffectiveInstallmentStatus(payment) !== "paid")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const totalPaid = items
    .flatMap((item) => item.payments)
    .filter((payment) => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const filteredItems = items.filter((item) => {
    const payments = item.payments ?? [];

    if (statusFilter === "all") {
      return true;
    }

    if (statusFilter === "pending") {
      return payments.some((payment) => payment.status !== "paid" && !isPaymentOverdue(payment));
    }

    if (statusFilter === "overdue") {
      return payments.some((payment) => isPaymentOverdue(payment));
    }

    if (statusFilter === "paid") {
      return payments.length > 0 && payments.every((payment) => payment.status === "paid");
    }

    return true;
  });
  const emptyFilteredDescription =
    statusFilter === "pending"
      ? "Nenhum parcelamento com parcelas pendentes no momento."
      : statusFilter === "overdue"
        ? "Nenhum parcelamento com parcelas atrasadas no momento."
        : "Nenhum parcelamento totalmente pago no momento.";

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
            <TabsTrigger value="paid">Pagas</TabsTrigger>
          </TabsList>
        </Tabs>
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
          onAction={openCreateModal}
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="Nenhum parcelamento encontrado"
          description={emptyFilteredDescription}
        />
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
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
                        onClick={() => openEditModal(item)}
                        className="text-text-secondary hover:bg-accent/10 hover:text-accent"
                        title="Editar parcelamento"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
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

      <Dialog open={modalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{formMode === "edit" ? "Editar parcelamento" : "Novo parcelamento"}</DialogTitle>
            <DialogDescription>
              {formMode === "edit"
                ? "Atualize a compra parcelada e regenere as parcelas automaticamente."
                : "Crie uma compra parcelada e gere as parcelas automaticamente."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Descricao" error={formErrors.description} required>
              <Input
                placeholder="Ex: Notebook Samsung"
                value={form.description}
                onChange={(event) => {
                  setForm((current) => ({ ...current, description: event.target.value }));
                  if (formErrors.description) {
                    setFormErrors((current) => ({ ...current, description: undefined }));
                  }
                }}
                error={formErrors.description}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Valor da parcela" error={formErrors.installment_amount} required>
                <CurrencyInput
                  value={form.installment_amount}
                  onChange={(value) => {
                    setForm((current) => ({ ...current, installment_amount: value }));
                    if (formErrors.installment_amount) {
                      setFormErrors((current) => ({ ...current, installment_amount: undefined }));
                    }
                  }}
                  error={formErrors.installment_amount}
                />
              </FormField>
              <FormField label="Quantidade de parcelas" error={formErrors.installment_count} required>
                <Input
                  type="number"
                  min={1}
                  max={360}
                  placeholder="Ex: 9"
                  value={installmentCountInput}
                  onChange={(event) => {
                    setInstallmentCountInput(event.target.value);
                    if (formErrors.installment_count) {
                      setFormErrors((current) => ({ ...current, installment_count: undefined }));
                    }
                  }}
                  error={formErrors.installment_count}
                />
              </FormField>
            </div>

            {form.installment_amount > 0 && isValidInstallmentCount && (
              <div className="rounded-lg border border-accent/20 bg-accent/10 p-3">
                <p className="text-sm text-accent">Valor da parcela: {formatCurrency(form.installment_amount)}</p>
                <p className="text-sm text-accent">Quantidade: {installmentCount}</p>
                <p className="text-sm font-medium text-accent">{installmentCount}x de {formatCurrency(form.installment_amount)}</p>
                <p className="text-sm font-medium text-accent">Total: {formatCurrency(totalAmount)}</p>
              </div>
            )}

            <FormField label="Vencimento da primeira parcela" error={formErrors.first_due_date} required>
              <Input
                type="date"
                value={form.first_due_date}
                onChange={(event) => {
                  setForm((current) => ({ ...current, first_due_date: event.target.value }));
                  if (formErrors.first_due_date) {
                    setFormErrors((current) => ({ ...current, first_due_date: undefined }));
                  }
                }}
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
              <Button type="button" variant="outline" onClick={closeModal} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                {formMode === "edit" ? "Salvar alteracoes" : "Criar parcelamento"}
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
    </>
  );
});
