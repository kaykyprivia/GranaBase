"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Calendar, Check, ChevronDown, FileText, Pencil, Plus, RefreshCw, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { addMonths, cn, formatCurrency, formatDate, getDaysUntilDue, isOverdue } from "@/lib/utils";
import { billSchema, type BillFormData } from "@/lib/validations";
import type { Bill } from "@/types/database";
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
import { InstallmentsPanel, type InstallmentsPanelHandle } from "@/components/installments/InstallmentsPanel";

const BILL_CATEGORIES = ["Aluguel", "Energia", "Água", "Internet", "Telefone", "Cartão", "Empréstimo", "Seguro", "Mensalidade", "Outro"];
type StatusFilter = "all" | "pending" | "overdue" | "paid";
type ActiveTab = "bills" | "installments";

function getEffectiveStatus(bill: Bill): Bill["status"] {
  if (bill.status === "pending" && isOverdue(bill.due_date)) return "overdue";
  return bill.status;
}

const EMPTY_FORM: BillFormData = { name: "", amount: 0, due_date: "", category: "", is_recurring: false, notes: "" };

export default function BillsPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const installmentsPanelRef = useRef<InstallmentsPanelHandle>(null);

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [form, setForm] = useState<BillFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof BillFormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [paidSectionOpen, setPaidSectionOpen] = useState(false);

  const activeTab: ActiveTab = searchParams.get("tab") === "installments" ? "installments" : "bills";

  const fetchBills = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const { data, error } = await supabase.from("bills").select("*").eq("user_id", user.id).order("due_date");
    if (error) {
      toast.error("Erro ao carregar contas");
      setLoading(false);
      return;
    }

    const allBills: Bill[] = data ?? [];

    // Backfill: for each paid recurring bill, if no future pending bill
    // with the same name+category exists, auto-create next month's bill.
    const paidRecurring = allBills.filter((b) => b.is_recurring && b.status === "paid");
    const activeBills = allBills.filter((b) => b.status === "pending");

    const seen = new Set<string>();
    const toCreate: Array<Parameters<typeof coerceMutation>[0]> = [];

    for (const bill of [...paidRecurring].sort((a, b) => b.due_date.localeCompare(a.due_date))) {
      const key = `${bill.name}|${bill.category}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const hasPending = activeBills.some((b) => b.name === bill.name && b.category === bill.category);
      if (!hasPending) {
        const nextDate = addMonths(new Date(bill.due_date + "T00:00:00"), 1);
        toCreate.push({
          user_id: user.id,
          name: bill.name,
          amount: bill.amount,
          due_date: nextDate.toISOString().slice(0, 10),
          status: "pending" as const,
          category: bill.category,
          is_recurring: true,
          notes: bill.notes ?? null,
        });
      }
    }

    if (toCreate.length > 0) {
      await supabase.from("bills").insert(toCreate.map((b) => coerceMutation(b)));
      const { data: refreshed } = await supabase.from("bills").select("*").eq("user_id", user.id).order("due_date");
      setBills(refreshed ?? []);
    } else {
      setBills(allBills);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  const handleSectionChange = (nextTab: ActiveTab) => {
    const params = new URLSearchParams(searchParams.toString());

    if (nextTab === "installments") {
      params.set("tab", "installments");
    } else {
      params.delete("tab");
    }

    const nextUrl = params.toString() ? `/bills?${params.toString()}` : "/bills";
    router.replace(nextUrl, { scroll: false });
  };

  const openCreate = () => {
    setEditingBill(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (bill: Bill) => {
    setEditingBill(bill);
    setForm({
      name: bill.name,
      amount: bill.amount,
      due_date: bill.due_date,
      category: bill.category,
      is_recurring: bill.is_recurring,
      notes: bill.notes ?? "",
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormErrors({});
    const result = billSchema.safeParse(form);

    if (!result.success) {
      const errs: Partial<Record<keyof BillFormData, string>> = {};
      result.error.errors.forEach((err) => {
        errs[err.path[0] as keyof BillFormData] = err.message;
      });
      setFormErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: result.data.name,
        amount: result.data.amount,
        due_date: result.data.due_date,
        category: result.data.category,
        is_recurring: result.data.is_recurring,
        notes: result.data.notes || null,
      };

      if (editingBill) {
        const { error } = await supabase.from("bills").update(coerceMutation(payload)).eq("id", editingBill.id);
        if (error) throw error;
        toast.success("Conta atualizada");
      } else {
        const { error } = await supabase
          .from("bills")
          .insert(coerceMutation({ ...payload, user_id: userId, status: "pending" as const }));
        if (error) throw error;
        toast.success("Conta criada");
      }

      setModalOpen(false);
      await fetchBills();
    } catch {
      toast.error("Erro ao salvar conta");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    setMarkingPaidId(id);
    try {
      const bill = bills.find((b) => b.id === id);

      const { error } = await supabase
        .from("bills")
        .update(coerceMutation({ status: "paid" as const, paid_at: new Date().toISOString() }))
        .eq("id", id);
      if (error) throw error;

      if (bill?.is_recurring) {
        const nextDate = addMonths(new Date(bill.due_date + "T00:00:00"), 1);
        const nextDueDateStr = nextDate.toISOString().slice(0, 10);
        await supabase.from("bills").insert(coerceMutation({
          user_id: userId,
          name: bill.name,
          amount: bill.amount,
          due_date: nextDueDateStr,
          status: "pending" as const,
          category: bill.category,
          is_recurring: true,
          notes: bill.notes ?? null,
        }));
        toast.success("Conta paga! Próximo mês já gerado automaticamente.");
      } else {
        toast.success("Conta marcada como paga!");
      }

      await fetchBills();
    } catch {
      toast.error("Erro ao marcar conta");
    } finally {
      setMarkingPaidId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("bills").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Conta excluída");
      setBills((prev) => prev.filter((bill) => bill.id !== deleteId));
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
  const pendingTotal = bills.filter((bill) => getEffectiveStatus(bill) === "pending").reduce((sum, bill) => sum + bill.amount, 0);
  const overdueTotal = bills.filter((bill) => getEffectiveStatus(bill) === "overdue").reduce((sum, bill) => sum + bill.amount, 0);
  const paidThisMonth = bills
    .filter((bill) => {
      if (bill.status !== "paid") return false;
      const dueDate = new Date(`${bill.due_date}T00:00:00`);
      return dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear;
    })
    .reduce((sum, bill) => sum + bill.amount, 0);
  const uniqueCategories = [...new Set(bills.map((bill) => bill.category))].sort();
  const filteredBills = bills.filter((bill) => {
    const effective = getEffectiveStatus(bill);
    return (statusFilter === "all" || effective === statusFilter) && (categoryFilter === "all" || bill.category === categoryFilter);
  });

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-warning/20 p-2.5">
            <FileText className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Contas</h1>
            <p className="text-sm text-text-secondary">Contas, recorrências e parcelamentos.</p>
          </div>
        </div>

        {activeTab === "bills" ? (
          <Button onClick={openCreate} size="sm" variant="warning" className="shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nova Conta</span>
            <span className="sm:hidden">Nova</span>
          </Button>
        ) : (
          <Button onClick={() => installmentsPanelRef.current?.openCreateModal()} size="sm" className="shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo parcelamento</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-3">
        <Tabs value={activeTab} onValueChange={(value) => handleSectionChange(value as ActiveTab)}>
          <TabsList className="h-auto rounded-xl border-border/80 bg-surface/80 p-1.5">
            <TabsTrigger
              value="bills"
              className={cn(
                "min-w-[120px] border border-transparent px-4 py-2",
                activeTab === "bills"
                  ? "!border-warning/70 !bg-warning !text-slate-950 !shadow-sm"
                  : "hover:bg-background/70"
              )}
            >
              Contas
            </TabsTrigger>
            <TabsTrigger
              value="installments"
              className={cn(
                "min-w-[140px] border border-transparent px-4 py-2",
                activeTab === "installments"
                  ? "!border-accent/70 !bg-accent !text-slate-950 !shadow-sm"
                  : "hover:bg-background/70"
              )}
            >
              Parcelamentos
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "bills" && (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Tabs value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="all">Todas</TabsTrigger>
                <TabsTrigger value="pending">Pendentes</TabsTrigger>
                <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
                <TabsTrigger value="paid">Pagas</TabsTrigger>
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
        )}
      </div>

      {activeTab === "bills" ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard title="Pendentes" value={formatCurrency(pendingTotal)} icon={FileText} variant="warning" loading={loading} />
            <StatCard title="Atrasadas" value={formatCurrency(overdueTotal)} icon={AlertCircle} variant="expense" loading={loading} />
            <StatCard title="Pagas este mês" value={formatCurrency(paidThisMonth)} icon={Check} variant="profit" loading={loading} />
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-20 w-full rounded-xl" />
              ))}
            </div>
          ) : filteredBills.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhuma conta encontrada"
              description={statusFilter !== "all" ? "Tente outro filtro." : "Adicione sua primeira conta."}
              actionLabel={statusFilter === "all" ? "+ Nova Conta" : undefined}
              onAction={statusFilter === "all" ? openCreate : undefined}
            />
          ) : (() => {
            const overdue = filteredBills.filter(b => getEffectiveStatus(b) === "overdue");
            const today = filteredBills.filter(b => getEffectiveStatus(b) === "pending" && getDaysUntilDue(b.due_date) === 0);
            const week = filteredBills.filter(b => getEffectiveStatus(b) === "pending" && getDaysUntilDue(b.due_date) > 0 && getDaysUntilDue(b.due_date) <= 7);
            const upcoming = filteredBills.filter(b => getEffectiveStatus(b) === "pending" && getDaysUntilDue(b.due_date) > 7);
            const paid = filteredBills.filter(b => getEffectiveStatus(b) === "paid");

            const BillCard = ({ bill }: { bill: Bill }) => {
              const effective = getEffectiveStatus(bill);
              const daysUntil = getDaysUntilDue(bill.due_date);
              return (
                <div className={cn(
                  "flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-border/20",
                  effective === "overdue" ? "border-expense/30 bg-expense/5" : "border-border/50"
                )}>
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    effective === "overdue" ? "bg-expense/15" : effective === "paid" ? "bg-profit/15" : "bg-warning/15"
                  )}>
                    {effective === "paid"
                      ? <CheckCircle2 className="h-4 w-4 text-profit" />
                      : effective === "overdue"
                      ? <AlertCircle className="h-4 w-4 text-expense" />
                      : <Clock className="h-4 w-4 text-warning" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-text-primary">{bill.name}</span>
                      {bill.is_recurring && <RefreshCw className="h-3 w-3 shrink-0 text-accent" />}
                      <Badge variant="secondary" className="shrink-0 text-[10px]">{bill.category}</Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{formatDate(bill.due_date)}
                      </span>
                      {effective === "overdue" && (
                        <span className="font-medium text-expense">{Math.abs(daysUntil)} dia{Math.abs(daysUntil) !== 1 ? "s" : ""} de atraso</span>
                      )}
                      {effective === "pending" && daysUntil === 0 && <span className="font-medium text-warning">Vence hoje!</span>}
                      {effective === "pending" && daysUntil > 0 && daysUntil <= 7 && (
                        <span className="font-medium text-warning">Vence em {daysUntil} dia{daysUntil !== 1 ? "s" : ""}</span>
                      )}
                      {bill.is_recurring && effective !== "paid" && (
                        <span className="flex items-center gap-1 text-accent">
                          <RefreshCw className="h-3 w-3" />
                          Próximo: {formatDate(addMonths(new Date(bill.due_date + "T00:00:00"), 1).toISOString().slice(0, 10))}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
                    <p className={cn("text-sm font-bold tabular-nums",
                      effective === "overdue" ? "text-expense" : effective === "paid" ? "text-profit" : "text-warning"
                    )}>{formatCurrency(bill.amount)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {(effective === "pending" || effective === "overdue") && (
                      <Button variant="ghost" size="icon-sm" onClick={() => handleMarkPaid(bill.id)}
                        disabled={markingPaidId === bill.id} className="text-profit hover:bg-profit/10 hover:text-profit" title="Marcar como paga">
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(bill)} className="text-text-secondary hover:text-text-primary">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(bill.id)} className="text-text-secondary hover:bg-expense/10 hover:text-expense">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            };

            const Section = ({ title, color, bills: sectionBills }: { title: string; color: string; bills: Bill[] }) => {
              if (sectionBills.length === 0) return null;
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>{title}</p>
                    <span className="text-xs text-text-secondary">({sectionBills.length})</span>
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="text-xs font-semibold" style={{ color }}>
                      {formatCurrency(sectionBills.reduce((s, b) => s + b.amount, 0))}
                    </span>
                  </div>
                  {sectionBills.map(b => <BillCard key={b.id} bill={b} />)}
                </div>
              );
            };

            const PaidSection = ({ bills: sectionBills }: { bills: Bill[] }) => {
              if (sectionBills.length === 0) return null;
              const total = sectionBills.reduce((s, b) => s + b.amount, 0);
              return (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setPaidSectionOpen((o) => !o)}
                    className="flex w-full items-center gap-2 text-left"
                  >
                    <span className="h-2 w-2 rounded-full shrink-0 bg-profit" />
                    <p className="text-xs font-semibold uppercase tracking-wider text-profit">Pagas</p>
                    <span className="text-xs text-text-secondary">({sectionBills.length})</span>
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="text-xs font-semibold text-profit">{formatCurrency(total)}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 text-text-secondary transition-transform duration-200", paidSectionOpen && "rotate-180")} />
                  </button>
                  <div className={cn("grid transition-all duration-300 ease-in-out", paidSectionOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                    <div className="overflow-hidden">
                      <div className="space-y-2 pt-1">
                        {sectionBills.map(b => <BillCard key={b.id} bill={b} />)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            };

            return (
              <div className="space-y-5">
                <Section title="Atrasadas" color="#EF4444" bills={overdue} />
                <Section title="Vence hoje" color="#FACC15" bills={today} />
                <Section title="Vence esta semana" color="#F97316" bills={week} />
                <Section title="Próximas" color="#38BDF8" bills={upcoming} />
                <PaidSection bills={paid} />
              </div>
            );
          })()}
        </>
      ) : (
        <InstallmentsPanel ref={installmentsPanelRef} />
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBill ? "Editar Conta" : "Nova Conta"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <FormField label="Nome da conta" error={formErrors.name} required>
              <Input
                placeholder="Ex: Aluguel de agosto"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                error={formErrors.name}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Valor" error={formErrors.amount} required>
                <CurrencyInput value={form.amount} onChange={(value) => setForm((current) => ({ ...current, amount: value }))} error={formErrors.amount} />
              </FormField>
              <FormField label="Vencimento" error={formErrors.due_date} required>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
                  error={formErrors.due_date}
                />
              </FormField>
            </div>

            <FormField label="Categoria" error={formErrors.category} required>
              <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                <SelectTrigger error={formErrors.category}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {BILL_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <label className="flex cursor-pointer items-center gap-3">
              <div
                onClick={() => setForm((current) => ({ ...current, is_recurring: !current.is_recurring }))}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all",
                  form.is_recurring ? "border-accent bg-accent" : "border-border"
                )}
              >
                {form.is_recurring && <Check className="h-3 w-3 text-background" />}
              </div>
              <span className="text-sm font-medium text-text-primary">Conta recorrente mensal</span>
            </label>

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
              <Button type="submit" loading={saving}>
                {editingBill ? "Salvar" : "Criar conta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir conta"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
