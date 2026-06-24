"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { AlertCircle, Calendar, Check, ChevronDown, FileText, Loader2, Pencil, RefreshCw, RotateCcw, Search, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { addMonths, cn, formatCurrency, formatDate, getDaysUntilDue, isOverdue, toLocalDateString } from "@/lib/utils";
import { billSchema, type BillFormData } from "@/lib/validations";
import { appliesMaeFilter, isMaeName, type MaeFilterMode } from "@/lib/mae";
import { isDateOnHolidayList, type BrasilApiHoliday } from "@/lib/brasilapi";
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

const BILL_CATEGORIES = ["Aluguel", "Energia", "Água", "Internet", "Telefone", "Cartão", "Empréstimo", "Seguro", "Mensalidade", "Outro"];
type StatusFilter = "all" | "pending" | "overdue" | "paid";

function getEffectiveStatus(bill: Bill): Bill["status"] {
  if (bill.status === "pending" && isOverdue(bill.due_date)) return "overdue";
  return bill.status;
}

const EMPTY_FORM: BillFormData = { name: "", amount: 0, due_date: "", category: "", is_recurring: false, notes: "" };

export interface BillsManagerHandle {
  openCreateModal: () => void;
}

interface BillsManagerProps {
  mode?: MaeFilterMode;
}

export const BillsManager = forwardRef<BillsManagerHandle, BillsManagerProps>(function BillsManager({ mode = "exclude-mae" }, ref) {
  const supabase = createClient();

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
  const [cnpjInput, setCnpjInput] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [holidaysByYear, setHolidaysByYear] = useState<Record<string, BrasilApiHoliday[]>>({});

  const ensureModeName = (name: string) =>
    mode === "only-mae" && !isMaeName(name) ? `Mãe - ${name}` : name;

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

    const allBills: Bill[] = ((data ?? []) as Bill[]).filter((bill) => appliesMaeFilter(user.id, mode, bill.name));

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
          due_date: toLocalDateString(nextDate),
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
      setBills(((refreshed ?? []) as Bill[]).filter((bill) => appliesMaeFilter(user.id, mode, bill.name)));
    } else {
      setBills(allBills);
    }

    setLoading(false);
  }, [supabase, mode]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  useEffect(() => {
    const years = [...new Set(bills.map((bill) => bill.due_date.slice(0, 4)))].filter(
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
  }, [bills, holidaysByYear]);

  const openCreate = () => {
    setEditingBill(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setCnpjInput("");
    setModalOpen(true);
  };

  useImperativeHandle(ref, () => ({
    openCreateModal: openCreate,
  }));

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
    setCnpjInput("");
    setModalOpen(true);
  };

  const handleCnpjLookup = async () => {
    const digits = cnpjInput.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ inválido");
      return;
    }

    setCnpjLoading(true);
    try {
      const response = await fetch(`/api/brasilapi/cnpj?cnpj=${digits}`);
      const data = await response.json();
      if (!response.ok || data?.error) {
        toast.error("CNPJ não encontrado");
        return;
      }

      const name = data?.nome_fantasia || data?.razao_social;
      if (!name) {
        toast.error("CNPJ não encontrado");
        return;
      }

      setForm((current) => ({ ...current, name }));
      toast.success(`Conta encontrada: ${name}`);
    } catch {
      toast.error("CNPJ não encontrado");
    } finally {
      setCnpjLoading(false);
    }
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
        name: ensureModeName(result.data.name),
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
        const nextDueDateStr = toLocalDateString(nextDate);
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

  const handleUnmarkPaid = async (id: string) => {
    setMarkingPaidId(id);
    try {
      const { error } = await supabase
        .from("bills")
        .update(coerceMutation({ status: "pending" as const, paid_at: null }))
        .eq("id", id);
      if (error) throw error;
      toast.success("Conta voltou para pendente");
      await fetchBills();
    } catch {
      toast.error("Erro ao desmarcar conta");
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
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
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

      {statusFilter !== "all" && (
        <div className="mb-6 grid grid-cols-1 gap-3">
          {statusFilter === "pending" && (
            <StatCard title="Pendentes" value={formatCurrency(pendingTotal)} icon={FileText} variant="warning" loading={loading} />
          )}
          {statusFilter === "overdue" && (
            <StatCard title="Atrasadas" value={formatCurrency(overdueTotal)} icon={AlertCircle} variant="expense" loading={loading} />
          )}
          {statusFilter === "paid" && (
            <StatCard title="Pagas este mês" value={formatCurrency(paidThisMonth)} icon={Check} variant="profit" loading={loading} />
          )}
        </div>
      )}

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
          const holiday = effective !== "paid"
            ? isDateOnHolidayList(bill.due_date, holidaysByYear[bill.due_date.slice(0, 4)] ?? [])
            : null;
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
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="break-words text-sm font-semibold text-text-primary">{bill.name}</span>
                  {bill.is_recurring && <RefreshCw className="h-3 w-3 shrink-0 text-accent" />}
                  <Badge variant="secondary" className="shrink-0 text-[10px]">{bill.category}</Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />{formatDate(bill.due_date)}
                  </span>
                  {holiday && (
                    <span className="text-text-secondary">🎉 Feriado: {holiday.name}</span>
                  )}
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
                      Próximo: {formatDate(toLocalDateString(addMonths(new Date(bill.due_date + "T00:00:00"), 1)))}
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
                {effective === "paid" && (
                  <Button variant="ghost" size="icon-sm" onClick={() => handleUnmarkPaid(bill.id)}
                    disabled={markingPaidId === bill.id} className="text-warning hover:bg-warning/10 hover:text-warning" title="Desmarcar como paga">
                    <RotateCcw className="h-4 w-4" />
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

      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBill ? "Editar Conta" : "Nova Conta"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <FormField label="CNPJ (opcional)" hint="Busque o nome da empresa automaticamente">
              <div className="flex gap-2">
                <Input
                  placeholder="00.000.000/0000-00"
                  value={cnpjInput}
                  onChange={(event) => setCnpjInput(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCnpjLookup}
                  disabled={cnpjLoading}
                  className="shrink-0 gap-1.5"
                >
                  {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Buscar
                </Button>
              </div>
            </FormField>

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
    </>
  );
});
