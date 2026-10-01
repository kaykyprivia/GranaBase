"use client";

import { useState } from "react";
import { CreditCard, Pencil, Plus, Trash2, Power } from "lucide-react";
import { toast } from "sonner";
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

interface CardsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EMPTY_FORM: CardInput = {
  name: "",
  due_day: 10,
  closing_day: 3,
  credit_limit: null,
  active: true,
};

function validate(input: CardInput): string | null {
  if (!input.name.trim()) return "Informe o nome do cartao";
  if (input.due_day < 1 || input.due_day > 31)
    return "Dia de vencimento deve ser 1-31";
  if (input.closing_day < 1 || input.closing_day > 31)
    return "Dia de fechamento deve ser 1-31";
  if (input.credit_limit != null && input.credit_limit < 0)
    return "Limite nao pode ser negativo";
  return null;
}

export function CardsModal({ open, onOpenChange }: CardsModalProps) {
  const { cards, loading, createCard, updateCard, deleteCard } = useCards();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CardInput>(EMPTY_FORM);
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
      due_day: card.due_day,
      closing_day: card.closing_day,
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
      if (editingId) {
        await updateCard(editingId, form);
        toast.success("Cartao atualizado");
      } else {
        await createCard(form);
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
                    setForm((f) => ({ ...f, due_day: Number(e.target.value) }))
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
                      closing_day: Number(e.target.value),
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
    </>
  );
}
