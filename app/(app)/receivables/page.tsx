"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Calendar, Check, ChevronDown, HandCoins, Pencil, Plus, RotateCcw, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { cn, formatCurrency, formatDate, getDaysUntilDue } from "@/lib/utils";
import { getEffectiveReceivableStatus } from "@/lib/finance";
import { receivableSchema, type ReceivableFormData } from "@/lib/validations";
import { isDateOnHolidayList, type BrasilApiHoliday } from "@/lib/brasilapi";
import type { Receivable } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import { StatCard } from "@/components/shared/StatCard";

const RECEIVABLE_CATEGORIES = ["Trabalho", "Freela", "Empréstimo", "Venda", "Reembolso", "Outro"];
type StatusFilter = "all" | "pending" | "overdue" | "received";

const EMPTY_FORM: ReceivableFormData = { description: "", amount: 0, expected_date: "", category: "", notes: "" };

export default function ReceivablesPage() {
  const supabase = createClient();

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingReceivable, setEditingReceivable] = useState<Receivable | null>(null);
  const [form, setForm] = useState<ReceivableFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ReceivableFormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [markingReceivedId, setMarkingReceivedId] = useState<string | null>(null);
  const [receivedSectionOpen, setReceivedSectionOpen] = useState(false);
  const [holidaysByYear, setHolidaysByYear] = useState<Record<string, BrasilApiHoliday[]>>({});

  const fetchReceivables = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const { data, error } = await supabase.from("receivables").select("*").eq("user_id", user.id).order("expected_date");
    if (error) {
      toast.error("Erro ao carregar recebíveis");
      setLoading(false);
      return;
    }

    setReceivables(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchReceivables();
  }, [fetchReceivables]);

  useEffect(() => {
    const years = [...new Set(receivables.map((r) => r.expected_date.slice(0, 4)))].filter(
      (year) => !(year in holidaysByYear)
    );
    if (years.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        years.map(async (year) => {
          try {
            const response = await fetch(`/api/brasilapi/holidays?year=${year}`);
            if (!response.ok) return [year, [] as BrasilApiHoliday[]] as const;
            const data = (await response.json()) as BrasilApiHoliday[];
            return [year, Array.isArray(data) ? data : []] as const;
          } catch {
            return [year, [] as BrasilApiHoliday[]] as const;
          }
        })
      );
      if (cancelled) return;
      setHolidaysByYear((current) => {
        const next = { ...current };
        for (const [year, holidays] of entries) {
          next[year] = holidays;
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [receivables, holidaysByYear]);

  const openCreate = () => {
    setEditingReceivable(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (receivable: Receivable) => {
    setEditingReceivable(receivable);
    setForm({
      description: receivable.description,
      amount: receivable.amount,
      expected_date: receivable.expected_date,
      category: receivable.category,
      notes: receivable.notes ?? "",
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormErrors({});
    const result = receivableSchema.safeParse(form);

    if (!result.success) {
      const errs: Partial<Record<keyof ReceivableFormData, string>> = {};
      result.error.errors.forEach((err) => {
        errs[err.path[0] as keyof ReceivableFormData] = err.message;
      });
      setFormErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        description: result.data.description,
        amount: result.data.amount,
        expected_date: result.data.expected_date,
        category: result.data.category,
        notes: result.data.notes || null,
      };

      if (editingReceivable) {
        const { error } = await supabase.from("receivables").update(coerceMutation(payload)).eq("id", editingReceivable.id);
        if (error) throw error;
        toast.success("Recebível atualizado");
      } else {
        const { error } = await supabase
          .from("receivables")
          .insert(coerceMutation({ ...payload, user_id: userId, status: "pending" as const }));
        if (error) throw error;
        toast.success("Recebível criado");
      }

      setModalOpen(false);
      await fetchReceivables();
    } catch {
      toast.error("Erro ao salvar recebível");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkReceived = async (id: string) => {
    setMarkingReceivedId(id);
    try {
      const { error } = await supabase
        .from("receivables")
        .update(coerceMutation({ status: "received" as const, received_at: new Date().toISOString() }))
        .eq("id", id);
      if (error) throw error;
      toast.success("Recebível marcado como recebido! Já aparece em Entradas.");
      await fetchReceivables();
    } catch {
      toast.error("Erro ao marcar recebível");
    } finally {
      setMarkingReceivedId(null);
    }
  };

  const handleUnmarkReceived = async (id: string) => {
    setMarkingReceivedId(id);
    try {
      const { error } = await supabase
        .from("receivables")
        .update(coerceMutation({ status: "pending" as const, received_at: null }))
        .eq("id", id);
      if (error) throw error;
      toast.success("Recebível voltou para pendente");
      await fetchReceivables();
    } catch {
      toast.error("Erro ao desmarcar recebível");
    } finally {
      setMarkingReceivedId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("receivables").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Recebível excluído");
      setReceivables((prev) => prev.filter((r) => r.id !== deleteId));
    } catch {
      toast.error("Erro ao excluir");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const pendingTotal = receivables.filter((r) => getEffectiveReceivableStatus(r) === "pending").reduce((sum, r) => sum + r.amount, 0);
  const overdueTotal = receivables.filter((r) => getEffectiveReceivableStatus(r) === "overdue").reduce((sum, r) => sum + r.amount, 0);
  const receivedThisMonth = receivables
    .filter((r) => {
      if (r.status !== "received" || !r.received_at) return false;
      const receivedDate = new Date(r.received_at);
      return receivedDate.getMonth() === currentMonth && receivedDate.getFullYear() === currentYear;
    })
    .reduce((sum, r) => sum + r.amount, 0);
  const uniqueCategories = [...new Set(receivables.map((r) => r.category))].sort();
  const filteredReceivables = receivables.filter((r) => {
    const effective = getEffectiveReceivableStatus(r);
    return (statusFilter === "all" || effective === statusFilter) && (categoryFilter === "all" || r.category === categoryFilter);
  });

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-profit/20 p-2.5">
            <HandCoins className="h-5 w-5 text-profit" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">A Receber</h1>
            <p className="text-sm text-text-secondary">Dinheiro que ainda vai entrar: trabalhos, empréstimos, etc.</p>
          </div>
        </div>

        <Button onClick={openCreate} size="sm" variant="profit" className="shrink-0 gap-1.5">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Recebível</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="overdue">Atrasados</TabsTrigger>
            <TabsTrigger value="received">Recebidos</TabsTrigger>
          </TabsList>
        </Tabs>

        {uniqueCategories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Todas as categorias" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {uniqueCategories.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {statusFilter !== "all" && (
        <div className="mb-6 grid grid-cols-1 gap-3">
          {statusFilter === "pending" && (
            <StatCard title="Pendentes" value={formatCurrency(pendingTotal)} icon={HandCoins} variant="warning" loading={loading} />
          )}
          {statusFilter === "overdue" && (
            <StatCard title="Atrasados" value={formatCurrency(overdueTotal)} icon={AlertCircle} variant="expense" loading={loading} />
          )}
          {statusFilter === "received" && (
            <StatCard title="Recebidos este mês" value={formatCurrency(receivedThisMonth)} icon={Check} variant="profit" loading={loading} />
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredReceivables.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nenhum recebível encontrado"
          description={statusFilter !== "all" ? "Tente outro filtro." : "Registre o primeiro dinheiro que você tem a receber."}
          actionLabel={statusFilter === "all" ? "+ Novo Recebível" : undefined}
          onAction={statusFilter === "all" ? openCreate : undefined}
        />
      ) : (() => {
        const overdue = filteredReceivables.filter(r => getEffectiveReceivableStatus(r) === "overdue");
        const today = filteredReceivables.filter(r => getEffectiveReceivableStatus(r) === "pending" && getDaysUntilDue(r.expected_date) === 0);
        const week = filteredReceivables.filter(r => getEffectiveReceivableStatus(r) === "pending" && getDaysUntilDue(r.expected_date) > 0 && getDaysUntilDue(r.expected_date) <= 7);
        const upcoming = filteredReceivables.filter(r => getEffectiveReceivableStatus(r) === "pending" && getDaysUntilDue(r.expected_date) > 7);
        const received = filteredReceivables.filter(r => getEffectiveReceivableStatus(r) === "received");

        const ReceivableCard = ({ receivable }: { receivable: Receivable }) => {
          const effective = getEffectiveReceivableStatus(receivable);
          const daysUntil = getDaysUntilDue(receivable.expected_date);
          const holiday = effective !== "received"
            ? isDateOnHolidayList(receivable.expected_date, holidaysByYear[receivable.expected_date.slice(0, 4)] ?? [])
            : null;
          return (
            <div className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-border/20",
              effective === "overdue" ? "border-expense/30 bg-expense/5" : "border-border/50"
            )}>
              <div className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                effective === "overdue" ? "bg-expense/15" : effective === "received" ? "bg-profit/15" : "bg-warning/15"
              )}>
                {effective === "received"
                  ? <CheckCircle2 className="h-4 w-4 text-profit" />
                  : effective === "overdue"
                  ? <AlertCircle className="h-4 w-4 text-expense" />
                  : <Clock className="h-4 w-4 text-warning" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="break-words text-sm font-semibold text-text-primary">{receivable.description}</span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{receivable.category}</Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />{formatDate(receivable.expected_date)}
                  </span>
                  {holiday && (
                    <span className="text-text-secondary">🎉 Feriado: {holiday.name}</span>
                  )}
                  {effective === "overdue" && (
                    <span className="font-medium text-expense">{Math.abs(daysUntil)} dia{Math.abs(daysUntil) !== 1 ? "s" : ""} de atraso</span>
                  )}
                  {effective === "pending" && daysUntil === 0 && <span className="font-medium text-warning">Previsto para hoje!</span>}
                  {effective === "pending" && daysUntil > 0 && daysUntil <= 7 && (
                    <span className="font-medium text-warning">Previsto em {daysUntil} dia{daysUntil !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
                <p className={cn("text-sm font-bold tabular-nums",
                  effective === "overdue" ? "text-expense" : effective === "received" ? "text-profit" : "text-warning"
                )}>{formatCurrency(receivable.amount)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {(effective === "pending" || effective === "overdue") && (
                  <Button variant="ghost" size="icon-sm" onClick={() => handleMarkReceived(receivable.id)}
                    disabled={markingReceivedId === receivable.id} className="text-profit hover:bg-profit/10 hover:text-profit" title="Marcar como recebido">
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                {effective === "received" && (
                  <Button variant="ghost" size="icon-sm" onClick={() => handleUnmarkReceived(receivable.id)}
                    disabled={markingReceivedId === receivable.id} className="text-warning hover:bg-warning/10 hover:text-warning" title="Desmarcar como recebido">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={() => openEdit(receivable)} className="text-text-secondary hover:text-text-primary">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(receivable.id)} className="text-text-secondary hover:bg-expense/10 hover:text-expense">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        };

        const Section = ({ title, color, items }: { title: string; color: string; items: Receivable[] }) => {
          if (items.length === 0) return null;
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{title}</p>
                <span className="text-xs text-text-secondary">({items.length})</span>
                <div className="h-px flex-1 bg-border/40" />
                <span className="text-xs font-semibold" style={{ color }}>
                  {formatCurrency(items.reduce((s, r) => s + r.amount, 0))}
                </span>
              </div>
              {items.map(r => <ReceivableCard key={r.id} receivable={r} />)}
            </div>
          );
        };

        const ReceivedSection = ({ items }: { items: Receivable[] }) => {
          if (items.length === 0) return null;
          const total = items.reduce((s, r) => s + r.amount, 0);
          return (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setReceivedSectionOpen((o) => !o)}
                className="flex w-full items-center gap-2 text-left"
              >
                <span className="h-2 w-2 rounded-full shrink-0 bg-profit" />
                <p className="text-xs font-semibold uppercase tracking-wider text-profit">Recebidos</p>
                <span className="text-xs text-text-secondary">({items.length})</span>
                <div className="h-px flex-1 bg-border/40" />
                <span className="text-xs font-semibold text-profit">{formatCurrency(total)}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 text-text-secondary transition-transform duration-200", receivedSectionOpen && "rotate-180")} />
              </button>
              <div className={cn("grid transition-all duration-300 ease-in-out", receivedSectionOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                <div className="overflow-hidden">
                  <div className="space-y-2 pt-1">
                    {items.map(r => <ReceivableCard key={r.id} receivable={r} />)}
                  </div>
                </div>
              </div>
            </div>
          );
        };

        return (
          <div className="space-y-5">
            <Section title="Atrasados" color="#EF4444" items={overdue} />
            <Section title="Previsto hoje" color="#FACC15" items={today} />
            <Section title="Previsto esta semana" color="#F97316" items={week} />
            <Section title="Próximos" color="#38BDF8" items={upcoming} />
            <ReceivedSection items={received} />
          </div>
        );
      })()}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReceivable ? "Editar Recebível" : "Novo Recebível"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <FormField label="Descrição" error={formErrors.description} required>
              <Input
                placeholder="Ex: Trabalho freelance para Empresa X"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                error={formErrors.description}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Valor" error={formErrors.amount} required>
                <CurrencyInput value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} error={formErrors.amount} />
              </FormField>
              <FormField label="Previsão de recebimento" error={formErrors.expected_date} required>
                <Input
                  type="date"
                  value={form.expected_date}
                  onChange={(event) => setForm((current) => ({ ...current, expected_date: event.target.value }))}
                  error={formErrors.expected_date}
                />
              </FormField>
            </div>

            <FormField label="Categoria" error={formErrors.category} required>
              <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                <SelectTrigger error={formErrors.category}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {RECEIVABLE_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Observações">
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
              <Button type="submit" variant="profit" loading={saving}>
                {editingReceivable ? "Salvar" : "Criar recebível"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir recebível"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
