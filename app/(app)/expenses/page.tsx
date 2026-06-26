"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BarChart, Bar, Cell, XAxis, Tooltip as RechartTooltip, ResponsiveContainer } from "recharts";
import { TrendingDown, Plus, Search, Pencil, Trash2, ChevronDown, Upload, Check, RotateCcw } from "lucide-react";
import { PageIntro } from "@/components/shared/PageIntro";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ImportStatementDialog } from "@/components/import/ImportStatementDialog";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { addMonths, cn, formatCurrency, formatDate, formatTime, isOverdue, toLocalDateString } from "@/lib/utils";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { billSchema, expenseSchema, installmentSchema, type BillFormData, type ExpenseFormData, type InstallmentFormData } from "@/lib/validations";
import { getEffectiveInstallmentStatus, getInstallmentPaidAmount, isInstallmentPaid, summarizeInstallmentPayments } from "@/lib/installments";
import { Progress } from "@/components/ui/progress";
import { appliesMaeFilter } from "@/lib/mae";
import type { Bill, ExpenseEntry, Installment, InstallmentPayment } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";

const BASE_EXPENSE_CATEGORIES = ["Alimentação", "Mercado", "Transporte", "Moradia", "Internet", "Lazer", "Assinatura", "Emergência", "Outro"];
const PAYMENT_METHODS = ["Dinheiro", "Pix", "Cartão Débito", "Cartão Crédito", "Transferência", "Outro"];
const INSTALLMENT_PAYMENT_METHODS = ["Cartão de Crédito", "Boleto"];
const BILL_CATEGORIES = ["Aluguel", "Energia", "Água", "Internet", "Telefone", "Cartão", "Empréstimo", "Seguro", "Mensalidade", "Outro"];

type ExpenseType = "normal" | "parcelado" | "fixa";

const installmentWithExtrasSchema = installmentSchema.extend({
  category: z.string().min(1, "Categoria é obrigatória"),
  payment_method: z.string().optional(),
});
type InstallmentExtrasFormData = z.infer<typeof installmentWithExtrasSchema>;
type InstallmentFormState = InstallmentFormData & { category: string; payment_method: string };

const EMPTY_INSTALLMENT_FORM: InstallmentFormState = {
  description: "",
  installment_amount: 0,
  installment_count: 0,
  first_due_date: "",
  category: "",
  payment_method: "",
  notes: "",
};

const EMPTY_BILL_FORM: BillFormData = {
  name: "",
  amount: 0,
  due_date: "",
  category: "",
  is_recurring: false,
  notes: "",
};

const calculateInstallmentTotal = (installmentAmount: number, installmentCount: number) =>
  Math.round(installmentAmount * installmentCount * 100) / 100;

function buildExpenseCategories(customCategories: string[]): string[] {
  const fixed = BASE_EXPENSE_CATEGORIES.filter((category) => category !== "Outro");
  const extra = customCategories.filter(
    (category) => category.trim() !== "" && !fixed.includes(category)
  );
  return [...fixed, ...extra, "Outro"];
}

const CATEGORY_COLORS: Record<string, string> = {
  Transporte:   "#F97316",
  Alimentação:  "#22C55E",
  Lazer:        "#A78BFA",
  Moradia:      "#38BDF8",
  Mercado:      "#14B8A6",
  Internet:     "#6366F1",
  Assinatura:   "#8B5CF6",
  Emergência:   "#EF4444",
  Outro:        "#94A3B8",
};

function formatMonthLabel(key: string) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(key + "-15"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface DisplayExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  spent_at: string;
  payment_method: string | null;
  created_at: string;
  source: "manual" | "bill" | "installment";
  status: "paid" | "pending" | "overdue";
  dueAmount?: number;
  actualDate?: string;
  dueDateRef?: string;
}

function withNewDate(originalIso: string, newDateStr: string) {
  const original = new Date(originalIso);
  const [year, month, day] = newDateStr.split("-").map(Number);
  original.setUTCFullYear(year, month - 1, day);
  return original.toISOString();
}

function dateTimeSortKey(entry: DisplayExpense) {
  const time = entry.created_at.includes("T") ? entry.created_at.slice(11) : "00:00:00";
  return `${entry.spent_at}T${time}`;
}

interface TrendTooltipProps { active?: boolean; payload?: Array<{ value: number }>; label?: string }
function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl">
      <p className="text-xs text-text-secondary">{label}</p>
      {value > 0 ? (
        <p className="text-sm font-bold text-expense">{formatCurrency(value)}</p>
      ) : (
        <p className="text-sm font-medium text-text-secondary">Sem registros</p>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  const supabase = createClient();
  const currency = useCurrency();
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<InstallmentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  const [expenseType, setExpenseType] = useState<ExpenseType>("normal");
  const [installmentForm, setInstallmentForm] = useState<InstallmentFormState>(EMPTY_INSTALLMENT_FORM);
  const [installmentCountInput, setInstallmentCountInput] = useState("");
  const [installmentFormErrors, setInstallmentFormErrors] = useState<Partial<Record<keyof InstallmentExtrasFormData, string>>>({});
  const [billForm, setBillForm] = useState<BillFormData>(EMPTY_BILL_FORM);
  const [billFormErrors, setBillFormErrors] = useState<Partial<Record<keyof BillFormData, string>>>({});
  const [creatingExtra, setCreatingExtra] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editPaidItem, setEditPaidItem] = useState<DisplayExpense | null>(null);
  const [editPaidAmount, setEditPaidAmount] = useState(0);
  const [editPaidDate, setEditPaidDate] = useState("");
  const [editPaidSaving, setEditPaidSaving] = useState(false);
  const [markPaidItem, setMarkPaidItem] = useState<DisplayExpense | null>(null);
  const [markPaidAmount, setMarkPaidAmount] = useState(0);
  const [markPaidDate, setMarkPaidDate] = useState("");
  const [markPaidSaving, setMarkPaidSaving] = useState(false);
  const [editPendingItem, setEditPendingItem] = useState<DisplayExpense | null>(null);
  const [editPendingName, setEditPendingName] = useState("");
  const [editPendingAmount, setEditPendingAmount] = useState(0);
  const [editPendingDueDate, setEditPendingDueDate] = useState("");
  const [editPendingCategory, setEditPendingCategory] = useState("");
  const [editPendingPaymentMethod, setEditPendingPaymentMethod] = useState("");
  const [editPendingRecurring, setEditPendingRecurring] = useState(false);
  const [editPendingNotes, setEditPendingNotes] = useState("");
  const [editPendingSaving, setEditPendingSaving] = useState(false);
  const [deletePendingItem, setDeletePendingItem] = useState<DisplayExpense | null>(null);
  const [deletingPending, setDeletingPending] = useState(false);
  const [revertItem, setRevertItem] = useState<DisplayExpense | null>(null);
  const [reverting, setReverting] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [installmentSummaryOpen, setInstallmentSummaryOpen] = useState(false);
  const [expandedInstallmentIds, setExpandedInstallmentIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const expenseCategories = useMemo(() => buildExpenseCategories(customCategories), [customCategories]);

  const { register, handleSubmit, control, reset, watch, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { description: "", amount: 0, category: "", spent_at: "", payment_method: "", card_due_date: "", notes: "" },
  });
  const paymentMethodValue = watch("payment_method");

  const fetchEntries = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const [expensesRes, billsRes, installmentsRes, paymentsRes, settingsRes] = await Promise.all([
      supabase.from("expense_entries").select("*").eq("user_id", user.id).order("spent_at", { ascending: false }),
      supabase.from("bills").select("*").eq("user_id", user.id),
      supabase.from("installments").select("*").eq("user_id", user.id),
      supabase.from("installment_payments").select("*").eq("user_id", user.id),
      supabase.from("user_settings").select("custom_categories").eq("user_id", user.id).maybeSingle(),
    ]);

    const settingsRow = coerceData<{ custom_categories?: string[] } | null>(settingsRes.data ?? null);
    setCustomCategories(Array.isArray(settingsRow?.custom_categories) ? settingsRow.custom_categories : []);

    if (expensesRes.error) { toast.error("Erro ao carregar gastos"); return; }
    setEntries(expensesRes.data ?? []);
    setBills(coerceData<Bill[]>(billsRes.data ?? []).filter((bill) => appliesMaeFilter(user.id, "exclude-mae", bill.name)));
    setInstallments(coerceData<Installment[]>(installmentsRes.data ?? []));
    setPayments(coerceData<InstallmentPayment[]>(paymentsRes.data ?? []));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const installmentsById = useMemo(() => new Map(installments.map((installment) => [installment.id, installment])), [installments]);

  const installmentSummaries = useMemo(() => {
    return installments
      .filter((installment) => appliesMaeFilter(userId, "exclude-mae", installment.description))
      .map((installment) => {
        const installmentPayments = payments.filter((p) => p.installment_id === installment.id);
        const summary = summarizeInstallmentPayments(installmentPayments, installment.installment_count, installment.total_amount);
        return { installment, ...summary };
      })
      .filter((s) => s.remainingCount > 0)
      .sort((a, b) => (a.nextPayment?.due_date ?? "").localeCompare(b.nextPayment?.due_date ?? ""));
  }, [installments, payments, userId]);

  const billsAndInstallmentsDisplay = useMemo<DisplayExpense[]>(() => {
    const billItems: DisplayExpense[] = bills.map((bill) => {
      const paid = bill.status === "paid";
      const status: DisplayExpense["status"] = paid ? "paid" : isOverdue(bill.due_date) ? "overdue" : "pending";
      return {
        id: bill.id,
        description: bill.name,
        amount: bill.amount,
        category: bill.category,
        spent_at: paid ? bill.paid_at!.slice(0, 10) : bill.due_date,
        payment_method: null,
        created_at: paid ? bill.paid_at! : bill.due_date,
        source: "bill" as const,
        status,
        dueAmount: bill.amount,
        dueDateRef: bill.due_date,
      };
    });

    const paymentItems: DisplayExpense[] = payments
      .filter((payment) => appliesMaeFilter(userId, "exclude-mae", installmentsById.get(payment.installment_id)?.description))
      .map((payment) => {
        const installment = installmentsById.get(payment.installment_id);
        const paid = isInstallmentPaid(payment.status);
        const effective = getEffectiveInstallmentStatus(payment);
        const status: DisplayExpense["status"] = paid ? "paid" : effective === "overdue" ? "overdue" : "pending";
        const description = installment
          ? `${installment.description} (${payment.installment_number}/${installment.installment_count})`
          : `Parcela ${payment.installment_number}`;
        return {
          id: payment.id,
          description,
          amount: paid ? getInstallmentPaidAmount(payment) : payment.amount,
          category: installment?.category || "Parcelamento",
          spent_at: paid ? payment.paid_at!.slice(0, 10) : payment.due_date,
          payment_method: installment?.payment_method ?? null,
          created_at: paid ? payment.paid_at! : payment.due_date,
          source: "installment" as const,
          status,
          dueAmount: payment.amount,
          dueDateRef: payment.due_date,
        };
      });

    return [...billItems, ...paymentItems];
  }, [bills, payments, installmentsById, userId]);

  const allEntries = useMemo<DisplayExpense[]>(() => [
    ...entries.map((e) => {
      const isCardWithDueDate = e.payment_method === "Cartão Crédito" && !!e.card_due_date;
      return {
        ...e,
        source: "manual" as const,
        status: "paid" as const,
        spent_at: isCardWithDueDate ? e.card_due_date! : e.spent_at,
        actualDate: isCardWithDueDate ? e.spent_at : undefined,
      };
    }),
    ...billsAndInstallmentsDisplay,
  ], [entries, billsAndInstallmentsDisplay]);

  const realizedEntries = useMemo(() => allEntries.filter((e) => e.status === "paid"), [allEntries]);

  const filterCategories = useMemo(() => {
    const used = allEntries.map((e) => e.category).filter((c) => !expenseCategories.includes(c));
    return [...expenseCategories, ...Array.from(new Set(used))];
  }, [expenseCategories, allEntries]);

  const filterPaymentMethods = useMemo(
    () => Array.from(new Set(allEntries.map((e) => e.payment_method).filter((m): m is string => !!m))).sort(),
    [allEntries]
  );

  const trendData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = d.toISOString().slice(0, 7);
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", "");
      const value = realizedEntries.filter(e => e.spent_at.startsWith(key)).reduce((s, e) => s + e.amount, 0);
      return { month: label, value };
    });
  }, [realizedEntries]);

  const filtered = useMemo(() => allEntries.filter(e => {
    const matchMonth = monthFilter === "all" || e.spent_at.startsWith(monthFilter);
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    const matchPaymentMethod = paymentMethodFilter === "all" || e.payment_method === paymentMethodFilter;
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchStatus && matchCat && matchPaymentMethod && matchSearch;
  }), [allEntries, monthFilter, statusFilter, categoryFilter, paymentMethodFilter, search]);

  const groupedByMonth = useMemo(() => {
    const grouped: Record<string, DisplayExpense[]> = {};
    [...filtered].forEach(e => {
      const key = e.spent_at.slice(0, 7);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    });
    return Object.entries(grouped)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, items]) => ({
        month, label: formatMonthLabel(month),
        items: [...items].sort((a, b) => dateTimeSortKey(b).localeCompare(dateTimeSortKey(a))),
        total: items.reduce((s, e) => s + e.amount, 0),
      }));
  }, [filtered]);

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (groupedByMonth.length === 0) return;
    const hasCurrentMonth = groupedByMonth.some((g) => g.month === currentMonth);
    setOpenMonths(new Set([hasCurrentMonth ? currentMonth : groupedByMonth[0].month]));
  }, [groupedByMonth.length, currentMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMonth = (month: string) => {
    setOpenMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month); else next.add(month);
      return next;
    });
  };

  const toggleInstallmentExpanded = (installmentId: string) => {
    setExpandedInstallmentIds(prev => {
      const next = new Set(prev);
      if (next.has(installmentId)) next.delete(installmentId); else next.add(installmentId);
      return next;
    });
  };

  const installmentPaymentsDisplay = useMemo(() => {
    const map = new Map<string, DisplayExpense[]>();
    payments.forEach((payment) => {
      const display = billsAndInstallmentsDisplay.find((d) => d.source === "installment" && d.id === payment.id);
      if (!display) return;
      const list = map.get(payment.installment_id) ?? [];
      list.push(display);
      map.set(payment.installment_id, list);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const pa = payments.find((p) => p.id === a.id);
        const pb = payments.find((p) => p.id === b.id);
        return (pa?.installment_number ?? 0) - (pb?.installment_number ?? 0);
      });
    });
    return map;
  }, [payments, billsAndInstallmentsDisplay]);

  const currentMonthGroup = useMemo(() => groupedByMonth.find((g) => g.month === currentMonth), [groupedByMonth, currentMonth]);
  const futureMonthGroups = useMemo(
    () => groupedByMonth.filter((g) => g.month > currentMonth).sort((a, b) => a.month.localeCompare(b.month)),
    [groupedByMonth, currentMonth]
  );
  const pastMonthGroups = useMemo(() => groupedByMonth.filter((g) => g.month < currentMonth), [groupedByMonth, currentMonth]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>(groupedByMonth.map((g) => g.month));
    const fallbackNow = new Date();
    for (let i = 0; i < 13; i++) {
      const d = new Date(fallbackNow.getFullYear(), fallbackNow.getMonth() - i, 1);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const future = Array.from(months).filter((m) => m > currentMonth).sort((a, b) => a.localeCompare(b));
    const presentAndPast = Array.from(months).filter((m) => m <= currentMonth).sort((a, b) => b.localeCompare(a));
    const sorted = [...future, ...presentAndPast];
    return [
      { value: "all", label: "Todos os meses" },
      ...sorted.map((m) => ({ value: m, label: formatMonthLabel(m) + (m > currentMonth ? " (futuro)" : "") })),
    ];
  }, [groupedByMonth, currentMonth]);

  const monthTotal = realizedEntries.filter(e => e.spent_at.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0);
  const totalAll = realizedEntries.reduce((s, e) => s + e.amount, 0);
  const topCategory = (() => {
    const map: Record<string, number> = {};
    realizedEntries.filter(e => e.spent_at.startsWith(currentMonth)).forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  })();

  const openCreate = () => {
    setEditingEntry(null);
    setExpenseType("normal");
    reset({ description: "", amount: 0, category: "", spent_at: toLocalDateString(), payment_method: "", card_due_date: "", notes: "" });
    setInstallmentForm(EMPTY_INSTALLMENT_FORM);
    setInstallmentCountInput("");
    setInstallmentFormErrors({});
    setBillForm(EMPTY_BILL_FORM);
    setBillFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (entry: ExpenseEntry) => {
    setEditingEntry(entry);
    setExpenseType("normal");
    reset({
      description: entry.description, amount: entry.amount, category: entry.category, spent_at: entry.spent_at,
      payment_method: entry.payment_method ?? "", card_due_date: entry.card_due_date ?? "", notes: entry.notes ?? "",
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: ExpenseFormData) => {
    try {
      if (editingEntry) {
        const { error } = await supabase.from("expense_entries").update(coerceMutation({
          description: data.description, amount: data.amount, category: data.category,
          spent_at: data.spent_at, payment_method: data.payment_method || null,
          card_due_date: data.payment_method === "Cartão Crédito" ? (data.card_due_date || null) : null,
          notes: data.notes || null,
        })).eq("id", editingEntry.id);
        if (error) throw error;
        toast.success("Gasto atualizado");
      } else {
        const { error } = await supabase.from("expense_entries").insert(coerceMutation({
          user_id: userId, description: data.description, amount: data.amount,
          category: data.category, spent_at: data.spent_at,
          payment_method: data.payment_method || null,
          card_due_date: data.payment_method === "Cartão Crédito" ? (data.card_due_date || null) : null,
          notes: data.notes || null,
        }));
        if (error) throw error;
        toast.success("Gasto registrado");
      }
      setModalOpen(false);
      await fetchEntries();
    } catch {
      toast.error("Erro ao salvar gasto. Tente novamente.");
    }
  };

  const handleCreateInstallment = async () => {
    setInstallmentFormErrors({});
    const count = Number(installmentCountInput);
    if (!Number.isInteger(count) || count <= 0) {
      setInstallmentFormErrors({ installment_count: "Quantidade de parcelas deve ser positiva" });
      return;
    }

    const result = installmentWithExtrasSchema.safeParse({ ...installmentForm, installment_count: count });
    if (!result.success) {
      const errs: Partial<Record<keyof InstallmentExtrasFormData, string>> = {};
      result.error.errors.forEach((err) => { errs[err.path[0] as keyof InstallmentExtrasFormData] = err.message; });
      setInstallmentFormErrors(errs);
      return;
    }

    setCreatingExtra(true);
    try {
      const unitAmount = result.data.installment_amount;
      const totalAmount = calculateInstallmentTotal(unitAmount, result.data.installment_count);
      const { data: createdData, error } = await supabase
        .from("installments")
        .insert(coerceMutation({
          user_id: userId,
          description: result.data.description,
          total_amount: totalAmount,
          installment_count: result.data.installment_count,
          installment_amount: unitAmount,
          first_due_date: result.data.first_due_date,
          category: result.data.category,
          payment_method: result.data.payment_method || null,
          notes: result.data.notes || null,
        }))
        .select()
        .single();

      const created = createdData ? coerceData<Installment>(createdData) : null;
      if (error || !created) throw error ?? new Error("Não foi possível criar o parcelamento.");

      const paymentsRows = Array.from({ length: result.data.installment_count }, (_, index) => {
        const dueDate = addMonths(new Date(`${result.data.first_due_date}T00:00:00`), index);
        return {
          user_id: userId,
          installment_id: created.id,
          installment_number: index + 1,
          due_date: toLocalDateString(dueDate),
          amount: unitAmount,
          status: "pending" as const,
        };
      });
      const { error: paymentsError } = await supabase.from("installment_payments").insert(coerceMutation(paymentsRows));
      if (paymentsError) throw paymentsError;

      toast.success(`Parcelamento criado com ${result.data.installment_count} parcelas`);
      setModalOpen(false);
      await fetchEntries();
    } catch {
      toast.error("Erro ao criar parcelamento. Tente novamente.");
    } finally {
      setCreatingExtra(false);
    }
  };

  const handleCreateBill = async () => {
    setBillFormErrors({});
    const result = billSchema.safeParse(billForm);
    if (!result.success) {
      const errs: Partial<Record<keyof BillFormData, string>> = {};
      result.error.errors.forEach((err) => { errs[err.path[0] as keyof BillFormData] = err.message; });
      setBillFormErrors(errs);
      return;
    }

    setCreatingExtra(true);
    try {
      const { error } = await supabase.from("bills").insert(coerceMutation({
        user_id: userId,
        name: result.data.name,
        amount: result.data.amount,
        due_date: result.data.due_date,
        category: result.data.category,
        is_recurring: result.data.is_recurring,
        notes: result.data.notes || null,
        status: "pending" as const,
      }));
      if (error) throw error;

      toast.success("Conta criada");
      setModalOpen(false);
      await fetchEntries();
    } catch {
      toast.error("Erro ao criar conta. Tente novamente.");
    } finally {
      setCreatingExtra(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("expense_entries").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Gasto excluído");
      setEntries(prev => prev.filter(e => e.id !== deleteId));
    } catch {
      toast.error("Erro ao excluir gasto");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const openEditPaid = (entry: DisplayExpense) => {
    setEditPaidItem(entry);
    setEditPaidAmount(entry.amount);
    setEditPaidDate(entry.spent_at);
  };

  const handleSaveEditPaid = async () => {
    if (!editPaidItem) return;
    setEditPaidSaving(true);
    try {
      const newPaidAt = withNewDate(editPaidItem.created_at, editPaidDate);

      if (editPaidItem.source === "bill") {
        const { error } = await supabase.from("bills").update(coerceMutation({
          amount: editPaidAmount, paid_at: newPaidAt,
        })).eq("id", editPaidItem.id);
        if (error) throw error;
      } else if (editPaidItem.source === "installment") {
        const dueAmount = editPaidItem.dueAmount ?? editPaidAmount;
        const status = editPaidAmount < dueAmount ? "paid_with_discount" : "paid";
        const { error } = await supabase.from("installment_payments").update(coerceMutation({
          paid_amount: editPaidAmount, paid_at: newPaidAt, status,
        })).eq("id", editPaidItem.id);
        if (error) throw error;
      }

      toast.success("Pagamento atualizado");
      setEditPaidItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao atualizar pagamento");
    } finally {
      setEditPaidSaving(false);
    }
  };

  const openMarkPaid = (entry: DisplayExpense) => {
    setMarkPaidItem(entry);
    setMarkPaidAmount(entry.dueAmount ?? entry.amount);
    setMarkPaidDate(toLocalDateString());
  };

  const handleConfirmMarkPaid = async () => {
    if (!markPaidItem) return;
    setMarkPaidSaving(true);
    try {
      const paidAtIso = withNewDate(new Date().toISOString(), markPaidDate);

      if (markPaidItem.source === "bill") {
        const bill = bills.find((b) => b.id === markPaidItem.id);
        const { error } = await supabase.from("bills").update(coerceMutation({
          status: "paid" as const, paid_at: paidAtIso, amount: markPaidAmount,
        })).eq("id", markPaidItem.id);
        if (error) throw error;

        if (bill?.is_recurring) {
          const nextDate = addMonths(new Date(bill.due_date + "T00:00:00"), 1);
          await supabase.from("bills").insert(coerceMutation({
            user_id: userId,
            name: bill.name,
            amount: bill.amount,
            due_date: toLocalDateString(nextDate),
            status: "pending" as const,
            category: bill.category,
            is_recurring: true,
            notes: bill.notes ?? null,
          }));
          toast.success("Conta paga! Próximo mês já gerado automaticamente.");
        } else {
          toast.success("Conta marcada como paga!");
        }
      } else if (markPaidItem.source === "installment") {
        const dueAmount = markPaidItem.dueAmount ?? markPaidAmount;
        const status = markPaidAmount < dueAmount ? "paid_with_discount" : "paid";
        const { error } = await supabase.from("installment_payments").update(coerceMutation({
          status, paid_amount: markPaidAmount, paid_at: paidAtIso,
        })).eq("id", markPaidItem.id);
        if (error) throw error;
        toast.success("Parcela paga!");
      }

      setMarkPaidItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao marcar como pago");
    } finally {
      setMarkPaidSaving(false);
    }
  };

  const openEditPending = (entry: DisplayExpense) => {
    setEditPendingItem(entry);
    setEditPendingAmount(entry.amount);
    setEditPendingDueDate(entry.spent_at);

    if (entry.source === "bill") {
      const bill = bills.find((b) => b.id === entry.id);
      setEditPendingName(bill?.name ?? entry.description);
      setEditPendingCategory(bill?.category ?? entry.category);
      setEditPendingPaymentMethod("");
      setEditPendingRecurring(bill?.is_recurring ?? false);
      setEditPendingNotes(bill?.notes ?? "");
    } else if (entry.source === "installment") {
      const payment = payments.find((p) => p.id === entry.id);
      const installment = payment ? installmentsById.get(payment.installment_id) : undefined;
      setEditPendingName(installment?.description ?? entry.description);
      setEditPendingCategory(installment?.category ?? entry.category);
      setEditPendingPaymentMethod(installment?.payment_method ?? "");
      setEditPendingRecurring(false);
      setEditPendingNotes(installment?.notes ?? "");
    }
  };

  const handleSaveEditPending = async () => {
    if (!editPendingItem) return;
    setEditPendingSaving(true);
    try {
      if (editPendingItem.source === "bill") {
        const { error } = await supabase.from("bills").update(coerceMutation({
          name: editPendingName, amount: editPendingAmount, due_date: editPendingDueDate,
          category: editPendingCategory, is_recurring: editPendingRecurring, notes: editPendingNotes || null,
        })).eq("id", editPendingItem.id);
        if (error) throw error;
      } else if (editPendingItem.source === "installment") {
        const payment = payments.find((p) => p.id === editPendingItem.id);
        const { error } = await supabase.from("installment_payments").update(coerceMutation({
          amount: editPendingAmount, due_date: editPendingDueDate,
        })).eq("id", editPendingItem.id);
        if (error) throw error;

        if (payment) {
          const { error: installmentError } = await supabase.from("installments").update(coerceMutation({
            description: editPendingName, category: editPendingCategory,
            payment_method: editPendingPaymentMethod || null, notes: editPendingNotes || null,
          })).eq("id", payment.installment_id);
          if (installmentError) throw installmentError;
        }
      }

      toast.success("Lançamento atualizado");
      setEditPendingItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao atualizar lançamento");
    } finally {
      setEditPendingSaving(false);
    }
  };

  const handleDeletePending = async () => {
    if (!deletePendingItem) return;
    setDeletingPending(true);
    try {
      if (deletePendingItem.source === "bill") {
        const { error } = await supabase.from("bills").delete().eq("id", deletePendingItem.id);
        if (error) throw error;
        toast.success("Conta excluída");
      } else if (deletePendingItem.source === "installment") {
        const payment = payments.find((p) => p.id === deletePendingItem.id);
        if (payment) {
          await supabase.from("installment_payments").delete().eq("installment_id", payment.installment_id);
          const { error } = await supabase.from("installments").delete().eq("id", payment.installment_id);
          if (error) throw error;
        }
        toast.success("Parcelamento excluído");
      }

      setDeletePendingItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao excluir");
    } finally {
      setDeletingPending(false);
    }
  };

  const handleRevert = async () => {
    if (!revertItem) return;
    setReverting(true);
    try {
      if (revertItem.source === "bill") {
        const { error } = await supabase.from("bills").update(coerceMutation({
          status: "pending", paid_at: null,
        })).eq("id", revertItem.id);
        if (error) throw error;
      } else if (revertItem.source === "installment") {
        const { error } = await supabase.from("installment_payments").update(coerceMutation({
          status: "pending", paid_at: null, paid_amount: null,
        })).eq("id", revertItem.id);
        if (error) throw error;
      }

      toast.success("Pagamento desfeito — volta para pendente");
      setRevertItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao desfazer pagamento");
    } finally {
      setReverting(false);
    }
  };

  const renderMonthGroup = (group: { month: string; label: string; items: DisplayExpense[]; total: number }, isCurrent: boolean) => {
    const { month, label, items, total } = group;
    const isOpen = openMonths.has(month);
    return (
      <div key={month} className={cn(
        "overflow-hidden rounded-2xl border",
        isCurrent ? "border-expense/40" : "border-border/50"
      )}>
        <button type="button" onClick={() => toggleMonth(month)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-border/20">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
            {isCurrent && <Badge variant="expense" className="text-[10px]">Atual</Badge>}
            <span className="rounded-full bg-expense/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-expense">{formatCurrency(total, currency)}</span>
            <span className="text-[10px] text-text-secondary">{items.length} {items.length === 1 ? "item" : "itens"}</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform duration-300", isOpen ? "rotate-180" : "rotate-0")} />
        </button>

        <div className={cn("grid transition-all duration-300 ease-in-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="border-t border-border/40">
              {items.map(entry => {
                const catColor = CATEGORY_COLORS[entry.category] ?? "#94A3B8";
                const isDiscounted = entry.status === "paid" && entry.source === "installment" && entry.dueAmount !== undefined && entry.amount < entry.dueAmount;
                const isGenericInstallmentCategory = entry.source === "installment" && entry.category === "Parcelamento";
                return (
                  <div key={entry.id}
                    className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 transition-colors hover:bg-border/20 border-b border-border/20 last:border-0">
                    <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `${catColor}18` }}>
                      <div className="h-2 w-2 rounded-full" style={{ background: catColor }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[13px] sm:text-sm font-medium text-text-primary">{entry.description}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5">
                        <Badge variant={entry.category === "Parcelamento" ? "secondary" : "expense"} className="text-[9px] px-1.5 py-0">{entry.category}</Badge>
                        {entry.source === "bill" && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Conta</Badge>}
                        {entry.source === "installment" && !isGenericInstallmentCategory && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">Parcela</Badge>}
                        {entry.status === "overdue" && <Badge variant="expense" className="text-[9px] px-1.5 py-0">Atrasada</Badge>}
                        {entry.status === "pending" && <Badge variant="pending" className="text-[9px] px-1.5 py-0">Pendente</Badge>}
                        {isDiscounted && <Badge variant="paid_with_discount" className="text-[9px] px-1.5 py-0">Pago com desconto</Badge>}
                        {entry.status === "paid" && entry.source !== "manual" && !isDiscounted && (
                          <Badge variant="paid" className="text-[9px] px-1.5 py-0">Pago</Badge>
                        )}
                        {entry.payment_method && <span className="text-[9px] text-text-secondary">{entry.payment_method}</span>}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {isDiscounted && entry.dueAmount !== undefined && (
                        <p className="text-[9px] text-text-secondary/70 line-through">{formatCurrency(entry.dueAmount, currency)}</p>
                      )}
                      <p className="text-[13px] sm:text-sm font-semibold tabular-nums text-expense">{formatCurrency(entry.amount, currency)}</p>
                      <p className="text-[9px] text-text-secondary">{formatDate(entry.spent_at)}</p>
                      {entry.actualDate ? (
                        <p className="text-[9px] text-text-secondary/60">Gasto em {formatDate(entry.actualDate)}</p>
                      ) : entry.status === "paid" && entry.dueDateRef && entry.dueDateRef !== entry.spent_at ? (
                        <p className="text-[9px] text-text-secondary/60">Vencia em {formatDate(entry.dueDateRef)}</p>
                      ) : (
                        entry.status === "paid" && <p className="text-[9px] text-text-secondary/60">{formatTime(entry.created_at)}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {entry.status !== "paid" ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => openMarkPaid(entry)}
                            className="gap-1 border-profit/40 text-profit hover:bg-profit/10" title="Marcar como pago">
                            <Check className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Pagar</span>
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => openEditPending(entry)}
                            className="text-text-secondary hover:text-text-primary" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" onClick={() => setDeletePendingItem(entry)}
                            className="text-text-secondary hover:text-expense hover:bg-expense/10"
                            title={entry.source === "installment" ? "Excluir parcelamento" : "Excluir conta"}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon-sm" onClick={() => {
                            if (entry.source === "manual") {
                              const original = entries.find((e) => e.id === entry.id);
                              if (original) openEdit(original);
                            } else {
                              openEditPaid(entry);
                            }
                          }} className="text-text-secondary hover:text-text-primary" title="Editar pagamento">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {entry.source === "manual" ? (
                            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(entry.id)}
                              className="text-text-secondary hover:text-expense hover:bg-expense/10" title="Excluir">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon-sm" onClick={() => setRevertItem(entry)}
                              className="text-warning hover:bg-warning/10 hover:text-warning" title="Desfazer pagamento — volta para pendente">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={TrendingDown}
        iconTone="expense"
        title="Gastos"
        description="Controle suas despesas"
        actions={
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={() => setImportOpen(true)} size="sm" variant="outline" className="gap-1.5">
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Importar extrato</span>
              <span className="sm:hidden">Importar</span>
            </Button>
            <Button onClick={openCreate} size="sm" variant="destructive" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Gasto</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard title="Total do Mês" value={formatCurrency(monthTotal, currency)} icon={TrendingDown} variant="expense" loading={loading} />
        <StatCard title="Total Geral" value={formatCurrency(totalAll, currency)} icon={TrendingDown} variant="expense" loading={loading} />
        <StatCard title="Maior categoria" value={topCategory} icon={TrendingDown} variant="warning" loading={loading} subtitle="Este mês" />
      </div>

      {/* Trend chart */}
      {!loading && trendData.some(d => d.value > 0) && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-border/60 bg-surface/60 px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Últimos 6 meses</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={trendData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <RechartTooltip content={<TrendTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={36} minPointSize={(value) => (!value ? 4 : 0)}>
                {trendData.map((d, i) => (
                  <Cell key={i} fill={d.value > 0 ? "#EF4444" : "#374151"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Installment progress */}
      {!loading && installmentSummaries.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-border/50">
          <button type="button" onClick={() => setInstallmentSummaryOpen((o) => !o)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-border/20">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Parcelamentos em andamento</span>
              <span className="text-[10px] text-text-secondary">{installmentSummaries.length} ativo{installmentSummaries.length !== 1 ? "s" : ""}</span>
              <span className="rounded-full bg-expense/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-expense">
                Falta {formatCurrency(installmentSummaries.reduce((s, i) => s + i.remainingAmount, 0), currency)}
              </span>
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform duration-300", installmentSummaryOpen ? "rotate-180" : "rotate-0")} />
          </button>

          <div className={cn("grid transition-all duration-300 ease-in-out", installmentSummaryOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
            <div className="overflow-hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-border/40 p-3">
                {installmentSummaries.map(({ installment, paidCount, paidAmount, progress, remainingAmount, nextPayment }) => {
                  const isExpanded = expandedInstallmentIds.has(installment.id);
                  const installmentPayments = installmentPaymentsDisplay.get(installment.id) ?? [];
                  return (
                    <div key={installment.id} className="rounded-2xl border border-border/50 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 break-words text-sm font-medium text-text-primary">{installment.description}</p>
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{
                            background: `${progress >= 80 ? "#22C55E" : progress >= 40 ? "#FACC15" : "#38BDF8"}20`,
                            color: progress >= 80 ? "#22C55E" : progress >= 40 ? "#FACC15" : "#38BDF8",
                          }}>
                          {paidCount}/{installment.installment_count}
                        </span>
                        <button type="button" onClick={() => toggleInstallmentExpanded(installment.id)}
                          className="shrink-0 rounded-lg p-0.5 text-text-secondary transition-colors hover:bg-border/20 hover:text-text-primary"
                          title={isExpanded ? "Recolher parcelas" : "Ver parcelas"}>
                          <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", isExpanded ? "rotate-180" : "rotate-0")} />
                        </button>
                      </div>
                      <Progress value={progress} className="mt-2 h-1.5"
                        indicatorClassName={progress >= 80 ? "bg-profit" : progress >= 40 ? "bg-warning" : "bg-accent"} />
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-text-secondary">
                        <span>Pago: <span className="font-semibold text-text-primary">{formatCurrency(paidAmount, currency)}</span></span>
                        <span>Falta: <span className="font-semibold text-text-primary">{formatCurrency(remainingAmount, currency)}</span></span>
                      </div>
                      {nextPayment && (
                        <p className="mt-1 text-[10px] text-text-secondary">
                          Próxima: {formatDate(nextPayment.due_date)} · {formatCurrency(nextPayment.amount, currency)}
                        </p>
                      )}

                      <div className={cn("grid transition-all duration-300 ease-in-out", isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                        <div className="overflow-hidden">
                          <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                            {installmentPayments.map((payment) => {
                              const paymentNumber = payments.find((p) => p.id === payment.id)?.installment_number;
                              const isDiscounted = payment.status === "paid" && payment.dueAmount !== undefined && payment.amount < payment.dueAmount;
                              return (
                                <div key={payment.id} className="flex items-center gap-2 py-1">
                                  <span className="shrink-0 text-[10px] font-semibold tabular-nums text-text-secondary">
                                    {paymentNumber}/{installment.installment_count}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] text-text-primary">{formatDate(payment.spent_at)} · {formatCurrency(payment.amount, currency)}</p>
                                    {payment.status === "paid" && payment.dueDateRef && payment.dueDateRef !== payment.spent_at && (
                                      <p className="text-[9px] text-text-secondary/60">Vencia em {formatDate(payment.dueDateRef)}</p>
                                    )}
                                  </div>
                                  {payment.status === "overdue" && <Badge variant="expense" className="text-[9px] px-1.5 py-0">Atrasada</Badge>}
                                  {payment.status === "pending" && <Badge variant="pending" className="text-[9px] px-1.5 py-0">Pendente</Badge>}
                                  {isDiscounted && <Badge variant="paid_with_discount" className="text-[9px] px-1.5 py-0">Pago com desconto</Badge>}
                                  {payment.status === "paid" && !isDiscounted && <Badge variant="paid" className="text-[9px] px-1.5 py-0">Pago</Badge>}
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    {payment.status !== "paid" ? (
                                      <>
                                        <Button variant="ghost" size="icon-sm" onClick={() => openEditPending(payment)}
                                          className="text-text-secondary hover:text-text-primary" title="Editar">
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon-sm" onClick={() => setDeletePendingItem(payment)}
                                          className="text-text-secondary hover:text-expense hover:bg-expense/10" title="Excluir parcelamento">
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon-sm" onClick={() => openMarkPaid(payment)}
                                          className="text-profit hover:bg-profit/10" title="Marcar como pago">
                                          <Check className="h-3 w-3" />
                                        </Button>
                                      </>
                                    ) : (
                                      <>
                                        <Button variant="ghost" size="icon-sm" onClick={() => openEditPaid(payment)}
                                          className="text-text-secondary hover:text-text-primary" title="Editar pagamento">
                                          <Pencil className="h-3 w-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon-sm" onClick={() => setRevertItem(payment)}
                                          className="text-warning hover:bg-warning/10 hover:text-warning" title="Desfazer pagamento — volta para pendente">
                                          <RotateCcw className="h-3 w-3" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="paid">Pagos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="overdue">Atrasados</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />} className="flex-1" />
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {filterCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
            <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Forma de pagamento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as formas</SelectItem>
              {filterPaymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grouped list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={TrendingDown} title="Nenhum gasto encontrado"
          description={search || monthFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all" || paymentMethodFilter !== "all"
            ? "Tente remover os filtros." : "Registre seu primeiro gasto."}
          actionLabel={!search && monthFilter === "all" && statusFilter === "all" && categoryFilter === "all" && paymentMethodFilter === "all" ? "+ Novo Gasto" : undefined}
          onAction={!search && monthFilter === "all" && statusFilter === "all" && categoryFilter === "all" && paymentMethodFilter === "all" ? openCreate : undefined}
        />
      ) : (
        <div className="space-y-2">
          {currentMonthGroup && renderMonthGroup(currentMonthGroup, true)}

          {futureMonthGroups.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Lançamentos futuros</span>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              {futureMonthGroups.map((group) => renderMonthGroup(group, false))}
            </>
          )}

          {pastMonthGroups.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Meses anteriores</span>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              {pastMonthGroups.map((group) => renderMonthGroup(group, false))}
            </>
          )}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={open => { if (!open) { setModalOpen(false); setEditingEntry(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Editar Gasto" : "Novo Gasto"}</DialogTitle>
          </DialogHeader>

          {!editingEntry && (
            <div className="grid grid-cols-3 gap-2 -mt-2">
              {([
                { value: "normal", label: "Gasto" },
                { value: "parcelado", label: "Parcelado" },
                { value: "fixa", label: "Conta" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setExpenseType(option.value)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-xs font-semibold transition-colors",
                    expenseType === option.value
                      ? "border-expense bg-expense/10 text-expense"
                      : "border-border/60 text-text-secondary hover:bg-border/20"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {expenseType === "normal" && (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <FormField label="Descrição" error={errors.description?.message} required>
                <Input placeholder="Ex: Almoço restaurante" error={errors.description?.message} {...register("description")} />
              </FormField>
              <FormField label="Valor" error={errors.amount?.message} required>
                <Controller name="amount" control={control}
                  render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} error={errors.amount?.message} />} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Categoria" error={errors.category?.message} required>
                  <Controller name="category" control={control} render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger error={errors.category?.message}><SelectValue placeholder="Categoria" /></SelectTrigger>
                      <SelectContent>{expenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                </FormField>
                <FormField label="Data do gasto" error={errors.spent_at?.message} required>
                  <Input type="date" error={errors.spent_at?.message} {...register("spent_at")} />
                </FormField>
              </div>
              <FormField label="Método de pagamento" error={errors.payment_method?.message} required>
                <Controller name="payment_method" control={control} render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger error={errors.payment_method?.message}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </FormField>
              {paymentMethodValue === "Cartão Crédito" && (
                <FormField label="Vencimento da fatura" hint="Opcional — edite se for diferente da data do gasto">
                  <Input type="date" {...register("card_due_date")} />
                </FormField>
              )}
              <FormField label="Observações">
                <Textarea placeholder="Notas opcionais..." rows={2} {...register("notes")} />
              </FormField>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" loading={isSubmitting}>{editingEntry ? "Salvar" : "Registrar gasto"}</Button>
              </DialogFooter>
            </form>
          )}

          {expenseType === "parcelado" && (
            <form onSubmit={(e) => { e.preventDefault(); void handleCreateInstallment(); }} className="space-y-4">
              <FormField label="Descrição" error={installmentFormErrors.description} required>
                <Input placeholder="Ex: Notebook novo" value={installmentForm.description} error={installmentFormErrors.description}
                  onChange={(e) => setInstallmentForm((c) => ({ ...c, description: e.target.value }))} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Valor da parcela" error={installmentFormErrors.installment_amount} required>
                  <CurrencyInput value={installmentForm.installment_amount} error={installmentFormErrors.installment_amount}
                    onChange={(value) => setInstallmentForm((c) => ({ ...c, installment_amount: value }))} />
                </FormField>
                <FormField label="Quantidade de parcelas" error={installmentFormErrors.installment_count} required>
                  <Input type="number" min={1} placeholder="Ex: 12" value={installmentCountInput} error={installmentFormErrors.installment_count}
                    onChange={(e) => setInstallmentCountInput(e.target.value)} />
                </FormField>
              </div>
              <FormField label="Data da 1ª parcela" error={installmentFormErrors.first_due_date} required>
                <Input type="date" error={installmentFormErrors.first_due_date} value={installmentForm.first_due_date}
                  onChange={(e) => setInstallmentForm((c) => ({ ...c, first_due_date: e.target.value }))} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Categoria" error={installmentFormErrors.category} required>
                  <Select value={installmentForm.category} onValueChange={(value) => setInstallmentForm((c) => ({ ...c, category: value }))}>
                    <SelectTrigger error={installmentFormErrors.category}><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>{expenseCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
                <FormField label="Método de pagamento" error={installmentFormErrors.payment_method}>
                  <Select value={installmentForm.payment_method} onValueChange={(value) => setInstallmentForm((c) => ({ ...c, payment_method: value }))}>
                    <SelectTrigger error={installmentFormErrors.payment_method}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{INSTALLMENT_PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
              </div>
              <FormField label="Observações">
                <Textarea placeholder="Notas opcionais..." rows={2} value={installmentForm.notes ?? ""}
                  onChange={(e) => setInstallmentForm((c) => ({ ...c, notes: e.target.value }))} />
              </FormField>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" loading={creatingExtra}>Criar parcelamento</Button>
              </DialogFooter>
            </form>
          )}

          {expenseType === "fixa" && (
            <form onSubmit={(e) => { e.preventDefault(); void handleCreateBill(); }} className="space-y-4">
              <FormField label="Nome da conta" error={billFormErrors.name} required>
                <Input placeholder="Ex: Aluguel" value={billForm.name} error={billFormErrors.name}
                  onChange={(e) => setBillForm((c) => ({ ...c, name: e.target.value }))} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Valor" error={billFormErrors.amount} required>
                  <CurrencyInput value={billForm.amount} error={billFormErrors.amount}
                    onChange={(value) => setBillForm((c) => ({ ...c, amount: value }))} />
                </FormField>
                <FormField label="Vencimento" error={billFormErrors.due_date} required>
                  <Input type="date" error={billFormErrors.due_date} value={billForm.due_date}
                    onChange={(e) => setBillForm((c) => ({ ...c, due_date: e.target.value }))} />
                </FormField>
              </div>
              <FormField label="Categoria" error={billFormErrors.category} required>
                <Select value={billForm.category} onValueChange={(value) => setBillForm((c) => ({ ...c, category: value }))}>
                  <SelectTrigger error={billFormErrors.category}><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{BILL_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </FormField>
              <label className="flex cursor-pointer items-center gap-3">
                <div
                  onClick={() => setBillForm((c) => ({ ...c, is_recurring: !c.is_recurring }))}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all",
                    billForm.is_recurring ? "border-accent bg-accent" : "border-border"
                  )}
                >
                  {billForm.is_recurring && <Check className="h-3 w-3 text-background" />}
                </div>
                <span className="text-sm font-medium text-text-primary">Conta recorrente mensal</span>
              </label>
              <FormField label="Observações">
                <Textarea placeholder="Notas opcionais..." rows={2} value={billForm.notes ?? ""}
                  onChange={(e) => setBillForm((c) => ({ ...c, notes: e.target.value }))} />
              </FormField>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="destructive" loading={creatingExtra}>Criar conta</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}
        title="Excluir gasto" description="Tem certeza? Esta ação não pode ser desfeita."
        confirmLabel="Excluir" onConfirm={handleDelete} loading={deleting} />

      <Dialog open={markPaidItem !== null} onOpenChange={open => !open && setMarkPaidItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como pago</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{markPaidItem?.description}</p>
            {markPaidItem?.dueAmount !== undefined && (
              <p className="text-xs text-text-secondary">
                Valor original: <span className="font-semibold text-text-primary">{formatCurrency(markPaidItem.dueAmount, currency)}</span>
              </p>
            )}
            <FormField label="Valor pago" required hint={markPaidItem?.source === "installment" ? "Altere o valor se pagou com desconto ou acréscimo." : undefined}>
              <CurrencyInput value={markPaidAmount} onChange={setMarkPaidAmount} />
            </FormField>
            {markPaidItem?.source === "installment" && markPaidItem.dueAmount !== undefined && markPaidAmount > 0 && markPaidAmount < markPaidItem.dueAmount && (
              <p className="rounded-lg bg-profit/10 px-3 py-2 text-xs text-profit">
                Será registrado como <strong>Pago com desconto</strong> — economia de {formatCurrency(markPaidItem.dueAmount - markPaidAmount, currency)}
              </p>
            )}
            <FormField label="Data do pagamento" required>
              <Input type="date" value={markPaidDate} onChange={e => setMarkPaidDate(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMarkPaidItem(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" loading={markPaidSaving} onClick={handleConfirmMarkPaid}>Confirmar pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editPaidItem !== null} onOpenChange={open => !open && setEditPaidItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{editPaidItem?.description}</p>
            {editPaidItem?.dueAmount !== undefined && (
              <p className="text-xs text-text-secondary">
                Valor original: <span className="font-semibold text-text-primary">{formatCurrency(editPaidItem.dueAmount, currency)}</span>
              </p>
            )}
            <FormField label="Valor pago" required>
              <CurrencyInput value={editPaidAmount} onChange={setEditPaidAmount} />
            </FormField>
            {editPaidItem?.source === "installment" && editPaidItem.dueAmount !== undefined && editPaidAmount > 0 && editPaidAmount < editPaidItem.dueAmount && (
              <p className="rounded-lg bg-profit/10 px-3 py-2 text-xs text-profit">
                Será registrado como <strong>Pago com desconto</strong> — economia de {formatCurrency(editPaidItem.dueAmount - editPaidAmount, currency)}
              </p>
            )}
            <FormField label="Data do pagamento" required>
              <Input type="date" value={editPaidDate} onChange={e => setEditPaidDate(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditPaidItem(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" loading={editPaidSaving} onClick={handleSaveEditPaid}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={revertItem !== null} onOpenChange={open => !open && setRevertItem(null)}
        title="Desfazer pagamento"
        description={`"${revertItem?.description}" vai voltar para pendente em ${revertItem?.source === "bill" ? "Contas" : "Parcelamentos"} e vai sair da lista de Gastos. Os dados da conta/parcelamento não são excluídos.`}
        confirmLabel="Desfazer pagamento" onConfirm={handleRevert} loading={reverting} />

      <Dialog open={editPendingItem !== null} onOpenChange={open => !open && setEditPendingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editPendingItem?.source === "bill" ? "Editar conta" : "Editar parcelamento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label={editPendingItem?.source === "bill" ? "Nome da conta" : "Descrição"} required>
              <Input value={editPendingName} onChange={e => setEditPendingName(e.target.value)} />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label={editPendingItem?.source === "bill" ? "Valor" : "Valor desta parcela"} required>
                <CurrencyInput value={editPendingAmount} onChange={setEditPendingAmount} />
              </FormField>
              <FormField label={editPendingItem?.source === "bill" ? "Vencimento" : "Vencimento desta parcela"} required>
                <Input type="date" value={editPendingDueDate} onChange={e => setEditPendingDueDate(e.target.value)} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Categoria" required>
                <Select value={editPendingCategory} onValueChange={setEditPendingCategory}>
                  <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                  <SelectContent>
                    {(editPendingItem?.source === "bill" ? BILL_CATEGORIES : expenseCategories).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              {editPendingItem?.source === "installment" && (
                <FormField label="Método de pagamento">
                  <Select value={editPendingPaymentMethod} onValueChange={setEditPendingPaymentMethod}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{INSTALLMENT_PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
              )}
            </div>
            {editPendingItem?.source === "bill" && (
              <label className="flex cursor-pointer items-center gap-3">
                <div
                  onClick={() => setEditPendingRecurring((c) => !c)}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all",
                    editPendingRecurring ? "border-accent bg-accent" : "border-border"
                  )}
                >
                  {editPendingRecurring && <Check className="h-3 w-3 text-background" />}
                </div>
                <span className="text-sm font-medium text-text-primary">Conta recorrente mensal</span>
              </label>
            )}
            <FormField label="Observações">
              <Textarea placeholder="Notas opcionais..." rows={2} value={editPendingNotes} onChange={e => setEditPendingNotes(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditPendingItem(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" loading={editPendingSaving} onClick={handleSaveEditPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deletePendingItem !== null} onOpenChange={open => !open && setDeletePendingItem(null)}
        title={deletePendingItem?.source === "installment" ? "Excluir parcelamento" : "Excluir conta"}
        description={
          deletePendingItem?.source === "installment"
            ? `Isso vai excluir TODAS as parcelas de "${deletePendingItem?.description}", não só esta. Esta ação não pode ser desfeita.`
            : "Tem certeza? Esta ação não pode ser desfeita."
        }
        confirmLabel="Excluir" onConfirm={handleDeletePending} loading={deletingPending} />

      <ImportStatementDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        kind="expense"
        userId={userId}
        onImported={fetchEntries}
      />
    </div>
  );
}
