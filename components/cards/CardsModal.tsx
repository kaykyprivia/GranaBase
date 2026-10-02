"use client";

import { useState } from "react";
import { CreditCard, Pencil, Plus, Trash2, Power, CheckCircle2, CircleDollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatMonth } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { useCards, type Card, type CardInput } from "@/lib/hooks/useCards";
import { useCardInvoices, type CardInvoice } from "@/lib/hooks/useCardInvoices";

function safeFormatDateTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

interface CardsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CardFormState = {
  name: string;
  due_day: string;
  closing_day: string;
  credit_limit: number | null;
  active: boolean;
};

const EMPTY_FORM: CardFormState = {
  name: "",
  due_day: "10",
  closing_day: "3",
  credit_limit: null,
  active: true,
};

function validate(input: CardFormState): string | null {
  if (!input.name.trim()) return "Informe o nome do cartao";
  const due = Number(input.due_day);
  const closing = Number(input.closing_day);
  if (!input.due_day || !Number.isFinite(due) || due < 1 || due > 31)
    return "Dia de vencimento deve ser 1-31";
  if (!input.closing_day || !Number.isFinite(closing) || closing < 1 || closing > 31)
    return "Dia de fechamento deve ser 1-31";
  if (input.credit_limit != null && input.credit_limit < 0)
    return "Limite nao pode ser negativo";
  return null;
}

export function CardsModal({ open, onOpenChange }: CardsModalProps) {
  const { cards, loading, createCard, updateCard, deleteCard } = useCards();
  const {
    invoices,
    loading: invoicesLoading,
    payInvoice,
    unpayInvoice,
    refresh: refreshInvoices,
  } = useCardInvoices({ enabled: open });
  const [payingInvoice, setPayingInvoice] = useState<{
    cardId: string;
    referenceMonth: string;
    total: number;
    cardName: string;
  } | null>(null);
  const [unpayingInvoice, setUnpayingInvoice] = useState<CardInvoice | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CardFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Card | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (card: Card) => {
    setEditingId(card.id);
    setForm({
      name: card.name,
      due_day: String(card.due_day),
      closing_day: String(card.closing_day),
      credit_limit: card.credit_limit,
      active: card.active,
    });
  };

  const handleSubmit = async () => {
    const validationError = validate(form);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const payload: CardInput = {
        name: form.name,
        due_day: Number(form.due_day),
        closing_day: Number(form.closing_day),
        credit_limit: form.credit_limit,
        active: form.active,
      };
      if (editingId) {
        await updateCard(editingId, payload);
        toast.success("Cartao atualizado");
      } else {
        await createCard(payload);
        toast.success("Cartao criado");
      }
      resetForm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar cartao");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSubmitting(true);
    try {
      await deleteCard(confirmDelete.id);
      toast.success("Cartao removido");
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover cartao");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmPay = async () => {
    if (!payingInvoice) return;
    setSubmitting(true);
    try {
      await payInvoice(payingInvoice.cardId, payingInvoice.referenceMonth);
      await refreshInvoices();
      toast.success("Fatura marcada como paga");
      setPayingInvoice(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao pagar fatura");
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmUnpay = async () => {
    if (!unpayingInvoice || !unpayingInvoice.invoice_payment_id) return;
    setSubmitting(true);
    try {
      await unpayInvoice(unpayingInvoice.invoice_payment_id);
      await refreshInvoices();
      toast.success("Pagamento desfeito");
      setUnpayingInvoice(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desfazer pagamento");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) resetForm();
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Meus cartoes
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-text-secondary">Carregando...</p>
            ) : cards.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Nenhum cartao cadastrado.
              </p>
            ) : (
              cards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {card.name}
                      </p>
                      {!card.active && <Badge variant="paused">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-text-secondary">
                      Vence dia {card.due_day} - Fecha dia {card.closing_day}
                      {card.credit_limit != null &&
                        ` - Limite ${card.credit_limit}`}
                      {card.expense_count > 0 &&
                        ` - ${card.expense_count} gasto(s)`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => startEdit(card)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setConfirmDelete(card)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-lg border border-border p-3 space-y-3">
            <p className="text-sm font-semibold text-text-primary">
              {editingId ? "Editar cartao" : "Novo cartao"}
            </p>

            <FormField label="Nome" required>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Ex: Nubank"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Dia vencimento" required>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.due_day}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, due_day: e.target.value }))
                  }
                />
              </FormField>
              <FormField label="Dia fechamento" required>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.closing_day}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      closing_day: e.target.value,
                    }))
                  }
                />
              </FormField>
            </div>

            <FormField label="Limite (opcional)">
              <CurrencyInput
                value={form.credit_limit ?? 0}
                onChange={(v) =>
                  setForm((f) => ({ ...f, credit_limit: v || null }))
                }
              />
            </FormField>

            {editingId && (
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.active ?? true}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, active: e.target.checked }))
                  }
                />
                <Power className="h-3.5 w-3.5" />
                Cartao ativo
              </label>
            )}

            <div className="flex justify-end gap-2">
              {editingId && (
                <Button variant="outline" onClick={resetForm} disabled={submitting}>
                  Cancelar
                </Button>
              )}
              <Button onClick={handleSubmit} disabled={submitting}>
                <Plus className="h-4 w-4" />
                {editingId ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </div>
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-4 w-4 text-accent" />
              <p className="text-sm font-semibold text-text-primary">Faturas</p>
            </div>

            {invoicesLoading ? (
              <p className="text-sm text-text-secondary">Carregando...</p>
            ) : invoices.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Nenhuma fatura registrada ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv) => {
                  const monthLabel = inv.reference_month
                    ? formatMonth(inv.reference_month)
                    : "—";
                  return (
                    <div
                      key={`${inv.card_id}-${inv.reference_month}`}
                      className={`rounded-lg border p-3 ${inv.is_paid ? "border-border/50 bg-surface-2/50" : "border-border bg-surface-2"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium text-text-primary">
                              {inv.card_name}
                            </p>
                            {inv.is_paid && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-profit">
                                <CheckCircle2 className="h-3 w-3" />
                                Paga
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {monthLabel} &middot; {inv.expense_count} gasto
                            {inv.expense_count === 1 ? "" : "s"}
                            {inv.is_paid && inv.paid_at ? (
                              <> &middot; paga em {safeFormatDateTime(inv.paid_at)}</>
                            ) : null}
                          </p>
                          <p className="mt-1 text-base font-semibold text-text-primary">
                            {formatCurrency(inv.total_amount)}
                          </p>
                        </div>

                        {inv.is_paid ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={submitting}
                            onClick={() => setUnpayingInvoice(inv)}
                          >
                            Desfazer
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={submitting}
                            onClick={() =>
                              setPayingInvoice({
                                cardId: inv.card_id,
                                referenceMonth: inv.reference_month,
                                total: inv.total_amount,
                                cardName: inv.card_name,
                              })
                            }
                          >
                            Pagar fatura
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Excluir cartao"
        description={
          confirmDelete
            ? `Tem certeza que deseja excluir "${confirmDelete.name}"? Esta acao nao pode ser desfeita.`
            : ""
        }
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        loading={submitting}
      />

      <ConfirmDialog
        open={!!payingInvoice}
        onOpenChange={(o) => !o && setPayingInvoice(null)}
        title="Pagar fatura"
        description={
          payingInvoice
            ? `Confirmar pagamento da fatura do ${payingInvoice.cardName} no valor de ${formatCurrency(payingInvoice.total)}?`
            : ""
        }
        confirmLabel="Pagar"
        variant="default"
        onConfirm={handleConfirmPay}
        loading={submitting}
      />

      <ConfirmDialog
        open={!!unpayingInvoice}
        onOpenChange={(o) => !o && setUnpayingInvoice(null)}
        title="Desfazer pagamento"
        description={
          unpayingInvoice
            ? `Desfazer o pagamento da fatura do ${unpayingInvoice.card_name}? Os gastos voltarao a ficar pendentes.`
            : ""
        }
        confirmLabel="Desfazer"
        onConfirm={handleConfirmUnpay}
        loading={submitting}
      />
    </>
  );
}
