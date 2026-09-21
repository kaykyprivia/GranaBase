"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BarChart, Bar, Cell, XAxis, Tooltip as RechartTooltip, ResponsiveContainer } from "recharts";
import { TrendingDown, Plus, Pencil, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Upload, Check, RotateCcw, Landmark } from "lucide-react";
import { PageIntro } from "@/components/shared/PageIntro";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ImportStatementDialog } from "@/components/import/ImportStatementDialog";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { addMonths, cn, formatCurrency, formatDate, isOverdue, toLocalDateString } from "@/lib/utils";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { useChartColors } from "@/hooks/useChartColors";
import { billSchema, expenseSchema, installmentSchema, type BillFormData, type ExpenseFormData, type InstallmentFormData } from "@/lib/validations";
import { getEffectiveInstallmentStatus, getInstallmentPaidAmount, isInstallmentPaid, summarizeInstallmentPayments } from "@/lib/installments";
import { Progress } from "@/components/ui/progress";
import { appliesMaeFilter } from "@/lib/mae";
import type { Bill, ExpenseEntry, Installment, InstallmentPayment, Database } from "@/types/database";
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
import { ExpensesFilters } from "@/components/expenses/ExpensesFilters";
import { MonthGroupCard } from "@/components/expenses/MonthGroupCard";
import type { DisplayExpense } from "@/components/expenses/types";

const BASE_EXPENSE_CATEGORIES = ["Alimentacao", "Mercado", "Transporte", "Moradia", "Internet", "Lazer", "Assinatura", "Emergencia", "Outro"];
const PAYMENT_METHODS = ["Dinheiro", "Pix", "Cartao Debito", "Cartao Credito", "Transferencia", "Outro"];
const INSTALLMENT_PAYMENT_METHODS = ["Cartao Credito", "Boleto"];
const OTHER_MONTHS_WINDOW = 5;
const BILL_CATEGORIES = ["Aluguel", "Energia", "ÃƒÂƒÃ‚Âgua", "Internet", "Telefone", "Cartao", "Emprestimo", "Seguro", "Mensalidade", "Outro"];

type ExpenseType = "normal" | "parcelado" | "fixa";

type Consortium = Database["public"]["Tables"]["consortiums"]["Row"];
type ConsortiumPayment = Database["public"]["Tables"]["consortium_payments"]["Row"];
type ScheduledConsortiumPayment = ConsortiumPayment & { projected?: boolean };

const installmentWithExtrasSchema = installmentSchema.extend({
  category: z.string().min(1, "Categoria e obrigatoria"),
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
  Alimentacao:  "#22C55E",
  Lazer:        "#A78BFA",
  Moradia:      "#38BDF8",
  Mercado:      "#14B8A6",
  Internet:     "#6366F1",
  Assinatura:   "#8B5CF6",
  Emergencia:   "#EF4444",
  Outro:        "#94A3B8",
  "Cons\u00f3rcio": "#38BDF8",
};

function formatMonthLabel(key: string) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(key + "-15"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function withNewDate(originalIso: string, newDateStr: string) {
  const original = new Date(originalIso);
  const [year, month, day] = newDateStr.split("-").map(Number);
  original.setUTCFullYear(year, month - 1, day);
  return original.toISOString();
}

function getConsortiumInstallmentDueDate(
  consortium: Consortium,
  installmentNumber: number
) {
  const [year, month] = consortium.first_due_date.split("-").map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 1 + installmentNumber - 1, 1));
  const lastDay = new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const dueDay = Math.min(consortium.due_day, lastDay);

  return new Date(
    Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), dueDay)
  )
    .toISOString()
    .slice(0, 10);
}

function dateTimeSortKey(entry: DisplayExpense) {
  const time = entry.created_at.includes("T") ? entry.created_at.slice(11) : "00:00:00";
  const date = entry.actualDate ?? entry.spent_at;
  return `${date}T${time}`;
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
  const chartColors = useChartColors();
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<InstallmentPayment[]>([]);
  const [consortiums, setConsortiums] = useState<Consortium[]>([]);
  const [consortiumPayments, setConsortiumPayments] = useState<ConsortiumPayment[]>([]);
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
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dueDayFilter, setDueDayFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [otherMonthsWindowStart, setOtherMonthsWindowStart] = useState<number | null>(null);
  const [installmentSummaryOpen, setInstallmentSummaryOpen] = useState(false);
  const [expandedInstallmentIds, setExpandedInstallmentIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const monthCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pendingScrollMonthRef = useRef<string | null>(null);
  const lastTrendClickRef = useRef<{ month: string; at: number } | null>(null);

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

    const [expensesRes, billsRes, installmentsRes, paymentsRes, consortiumsRes, consortiumPaymentsRes, settingsRes] = await Promise.all([
      supabase.from("expense_entries").select("*").eq("user_id", user.id).order("spent_at", { ascending: false }),
      supabase.from("bills").select("*").eq("user_id", user.id),
      supabase.from("installments").select("*").eq("user_id", user.id),
      supabase.from("installment_payments").select("*").eq("user_id", user.id),
      supabase.from("consortiums").select("*").eq("user_id", user.id),
      supabase.from("consortium_payments").select("*").eq("user_id", user.id),
      supabase.from("user_settings").select("custom_categories").eq("user_id", user.id).maybeSingle(),
    ]);

    const settingsRow = coerceData<{ custom_categories?: string[] } | null>(settingsRes.data ?? null);
    setCustomCategories(Array.isArray(settingsRow?.custom_categories) ? settingsRow.custom_categories : []);
    if (expensesRes.error || consortiumsRes.error || consortiumPaymentsRes.error) {
      toast.error("Erro ao carregar gastos");
      setLoading(false);
      return;
    }
    setEntries(expensesRes.data ?? []);
    setBills(coerceData<Bill[]>(billsRes.data ?? []).filter((bill) => appliesMaeFilter(user.id, "exclude-mae", bill.name)));
    setInstallments(coerceData<Installment[]>(installmentsRes.data ?? []));
    setPayments(coerceData<InstallmentPayment[]>(paymentsRes.data ?? []));
    setConsortiums(coerceData<Consortium[]>(consortiumsRes.data ?? []));
    setConsortiumPayments(coerceData<ConsortiumPayment[]>(consortiumPaymentsRes.data ?? []));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const installmentsById = useMemo(() => new Map(installments.map((installment) => [installment.id, installment])), [installments]);

  const consortiumsById = useMemo(
    () => new Map(consortiums.map((consortium) => [consortium.id, consortium])),
    [consortiums]
  );

  const consortiumPaymentSchedule = useMemo<ScheduledConsortiumPayment[]>(() => {
    return consortiums.flatMap((consortium) => {
      const ownPayments = consortiumPayments.filter(
        (payment) => payment.consortium_id === consortium.id
      );
      const paymentsByNumber = new Map(
        ownPayments.map((payment) => [payment.installment_number, payment])
      );
      const schedule: ScheduledConsortiumPayment[] = [];

      for (
        let installmentNumber = consortium.initial_paid_installments + 1;
        installmentNumber <= consortium.total_installments;
        installmentNumber += 1
      ) {
        const existingPayment = paymentsByNumber.get(installmentNumber);

        if (existingPayment) {
          const isPaid =
            existingPayment.status === "paid" ||
            existingPayment.status === "paid_with_discount";

          if (consortium.status !== "cancelled" || isPaid) {
            schedule.push(existingPayment);
          }
          continue;
        }

        if (consortium.status !== "active") continue;

        const dueDate = getConsortiumInstallmentDueDate(
          consortium,
          installmentNumber
        );
        schedule.push({
          id: `projected-${consortium.id}-${installmentNumber}`,
          user_id: consortium.user_id,
          consortium_id: consortium.id,
          installment_number: installmentNumber,
          due_date: dueDate,
          amount: consortium.current_installment_amount,
          status: "pending",
          paid_amount: null,
          paid_at: null,
          notes: null,
          created_at: dueDate,
          projected: true,
        });
      }

      return schedule;
    });
  }, [consortiumPayments, consortiums]);

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

  const consortiumSummaries = useMemo(() => {
    return consortiums
      .filter((consortium) => consortium.status === "active")
      .map((consortium) => {
        const scheduledPayments = consortiumPaymentSchedule.filter(
          (payment) => payment.consortium_id === consortium.id
        );
        const paidPayments = scheduledPayments.filter(
          (payment) =>
            payment.status === "paid" ||
            payment.status === "paid_with_discount"
        );
        const pendingPayments = scheduledPayments.filter(
          (payment) =>
            payment.status !== "paid" &&
            payment.status !== "paid_with_discount"
        );
        const paidCount = Math.min(
          consortium.total_installments,
          consortium.initial_paid_installments + paidPayments.length
        );
        const paidAmount =
          consortium.initial_paid_amount +
          paidPayments.reduce(
            (sum, payment) => sum + (payment.paid_amount ?? payment.amount),
            0
          );
        const remainingAmount = pendingPayments.reduce(
          (sum, payment) => sum + payment.amount,
          0
        );
        const nextPayment = [...pendingPayments].sort((a, b) =>
          a.due_date.localeCompare(b.due_date)
        )[0] ?? null;

        return {
          consortium,
          paidCount,
          paidAmount,
          remainingCount: consortium.total_installments - paidCount,
          remainingAmount,
          progress: Math.min(
            100,
            (paidCount / consortium.total_installments) * 100
          ),
          nextPayment,
        };
      })
      .filter((summary) => summary.remainingCount > 0)
      .sort((a, b) =>
        (a.nextPayment?.due_date ?? "").localeCompare(
          b.nextPayment?.due_date ?? ""
        )
      );
  }, [consortiumPaymentSchedule, consortiums]);

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
          scheduledAmount: installment?.installment_amount,
          dueDateRef: payment.due_date,
        };
      });

    return [...billItems, ...paymentItems];
  }, [bills, payments, installmentsById, userId]);

  const consortiumPaymentsDisplay = useMemo<DisplayExpense[]>(() => {
    return consortiumPaymentSchedule
      .map((payment) => {
        const consortium = consortiumsById.get(payment.consortium_id);
        const paid = (payment.status === "paid" || payment.status === "paid_with_discount") && !!payment.paid_at;
        const status: DisplayExpense["status"] = paid
          ? "paid"
          : isOverdue(payment.due_date)
            ? "overdue"
            : "pending";

        return {
          id: payment.id,
          description: consortium
            ? `${consortium.name} (${payment.installment_number}/${consortium.total_installments})`
            : `Cons\u00f3rcio - parcela ${payment.installment_number}`,
          amount: paid ? payment.paid_amount ?? payment.amount : payment.amount,
          category: "Cons\u00f3rcio",
          spent_at: paid ? payment.paid_at!.slice(0, 10) : payment.due_date,
          payment_method: null,
          created_at: paid ? payment.paid_at! : payment.due_date,
          source: "consortium" as const,
          status,
          dueAmount: payment.amount,
          scheduledAmount: payment.amount,
          dueDateRef: payment.due_date,
          isProjected: payment.projected === true,
        };
      });
  }, [consortiumPaymentSchedule, consortiumsById]);

  const allEntries = useMemo<DisplayExpense[]>(() => [
    ...entries.map((e) => {
      const isCardWithDueDate = e.payment_method === "Cartao Credito" && !!e.card_due_date;
      return {
        ...e,
        source: "manual" as const,
        status: "paid" as const,
        spent_at: isCardWithDueDate ? e.card_due_date! : e.spent_at,
        actualDate: isCardWithDueDate ? e.spent_at : undefined,
      };
    }),
    ...billsAndInstallmentsDisplay,
    ...consortiumPaymentsDisplay,
  ], [entries, billsAndInstallmentsDisplay, consortiumPaymentsDisplay]);

  const realizedEntries = useMemo(() => allEntries.filter((e) => e.status === "paid"), [allEntries]);

  const filterCategories = useMemo(() => {
    const used = allEntries.map((e) => e.category).filter((c) => !expenseCategories.includes(c));
    return [...expenseCategories, ...Array.from(new Set(used))];
  }, [expenseCategories, allEntries]);

  const filterPaymentMethods = useMemo(
    () => Array.from(new Set(allEntries.map((e) => e.payment_method).filter((m): m is string => !!m))).sort(),
    [allEntries]
  );

  // Compra manual no Cartao com vencimento: spent_at guarda a data de vencimento
  // (fatura) e actualDate guarda a data real da compra aÃ‚Â€Ã‚Â” ver mapeamento acima.
  const getCardDueDay = (entry: DisplayExpense): number | null =>
    entry.source === "manual" && entry.actualDate !== undefined
      ? Number(entry.spent_at.slice(8, 10))
      : null;

  const filterDueDays = useMemo(() => {
    const days = allEntries.map(getCardDueDay).filter((d): d is number => d !== null);
    return Array.from(new Set(days)).sort((a, b) => a - b);
  }, [allEntries]);

  const [trendMonths, setTrendMonths] = useState<3 | 6 | 12>(6);
  const [trendOffset, setTrendOffset] = useState(0);
  const trendTouchStartX = useRef<number | null>(null);

  const trendData = useMemo(() => {
    return Array.from({ length: trendMonths }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - trendOffset - (trendMonths - 1 - i));

      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short" })
        .format(d)
        .replace(".", "");

      const value = realizedEntries
        .filter((e) => e.spent_at.startsWith(key))
        .reduce((sum, entry) => sum + entry.amount, 0);

      return { key, month: label, value };
    });
  }, [realizedEntries, trendMonths, trendOffset]);

  const goTrendBack = () => setTrendOffset((offset) => offset + 1);

  const goTrendForward = () => {
    setTrendOffset((offset) => Math.max(0, offset - 1));
  };

  const handleTrendTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    trendTouchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTrendTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (trendTouchStartX.current === null) return;

    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) return;

    const deltaX = endX - trendTouchStartX.current;
    trendTouchStartX.current = null;

    if (Math.abs(deltaX) < 50) return;

    if (deltaX > 0) {
      goTrendBack();
    } else if (trendOffset > 0) {
      goTrendForward();
    }
  };

  const hasActiveFilters = Boolean(
    search || monthFilter !== "all" || statusFilter !== "all" || categoryFilter !== "all" ||
    paymentMethodFilter !== "all" || sourceFilter !== "all" || dueDayFilter !== "all"
  );
  const activeFilterCount = [
    monthFilter !== "all", statusFilter !== "all", categoryFilter !== "all",
    paymentMethodFilter !== "all", sourceFilter !== "all", dueDayFilter !== "all", Boolean(search),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setMonthFilter("all");
    setStatusFilter("all");
    setCategoryFilter("all");
    setPaymentMethodFilter("all");
    setSourceFilter("all");
    setDueDayFilter("all");
    setSearch("");
  };

  const filtered = useMemo(() => allEntries.filter(e => {
    const matchMonth = monthFilter === "all" || e.spent_at.startsWith(monthFilter);
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    const matchPaymentMethod = paymentMethodFilter === "all" || e.payment_method === paymentMethodFilter;
    const matchSource = sourceFilter === "all" || e.source === sourceFilter;
    const matchDueDay = dueDayFilter === "all" || getCardDueDay(e) === Number(dueDayFilter);
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchStatus && matchCat && matchPaymentMethod && matchSource && matchDueDay && matchSearch;
  }), [allEntries, monthFilter, statusFilter, categoryFilter, paymentMethodFilter, sourceFilter, dueDayFilter, search]);

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

  const consortiumPaymentsDisplayById = useMemo(() => {
    const map = new Map<string, DisplayExpense[]>();

    consortiumPaymentSchedule.forEach((payment) => {
      const display = consortiumPaymentsDisplay.find(
        (entry) => entry.id === payment.id
      );
      if (!display) return;

      const list = map.get(payment.consortium_id) ?? [];
      list.push(display);
      map.set(payment.consortium_id, list);
    });

    map.forEach((list) => {
      list.sort((a, b) => {
        const paymentA = consortiumPaymentSchedule.find(
          (payment) => payment.id === a.id
        );
        const paymentB = consortiumPaymentSchedule.find(
          (payment) => payment.id === b.id
        );
        return (
          (paymentA?.installment_number ?? 0) -
          (paymentB?.installment_number ?? 0)
        );
      });
    });

    return map;
  }, [consortiumPaymentSchedule, consortiumPaymentsDisplay]);

  const activePaymentPlanCount =
    installmentSummaries.length + consortiumSummaries.length;
  const paymentPlansRemainingTotal =
    installmentSummaries.reduce(
      (sum, summary) => sum + summary.remainingAmount,
      0
    ) +
    consortiumSummaries.reduce(
      (sum, summary) => sum + summary.remainingAmount,
      0
    );

  const currentMonthGroup = useMemo(() => groupedByMonth.find((g) => g.month === currentMonth), [groupedByMonth, currentMonth]);
  const futureMonthGroups = useMemo(
    () => groupedByMonth.filter((g) => g.month > currentMonth).sort((a, b) => a.month.localeCompare(b.month)),
    [groupedByMonth, currentMonth]
  );
  const pastMonthGroups = useMemo(() => groupedByMonth.filter((g) => g.month < currentMonth), [groupedByMonth, currentMonth]);
  const otherMonthGroups = useMemo(() => {
    const pastAscending = [...pastMonthGroups].sort((a, b) => a.month.localeCompare(b.month));
    return [...pastAscending, ...futureMonthGroups];
  }, [pastMonthGroups, futureMonthGroups]);

  const otherMonthsMaxStart = Math.max(0, otherMonthGroups.length - OTHER_MONTHS_WINDOW);
  const otherMonthsDefaultStart = Math.min(pastMonthGroups.length, otherMonthsMaxStart);
  const otherMonthsStart = Math.min(otherMonthsWindowStart ?? otherMonthsDefaultStart, otherMonthsMaxStart);
  const visibleOtherMonths = otherMonthGroups.slice(otherMonthsStart, otherMonthsStart + OTHER_MONTHS_WINDOW);

  useEffect(() => {
    const month = pendingScrollMonthRef.current;
    if (!month) return;

    const target = monthCardRefs.current[month];
    if (!target) return;

    pendingScrollMonthRef.current = null;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [visibleOtherMonths, currentMonthGroup, openMonths]);

  const openMonthFromTrend = (month: string) => {
    if (!groupedByMonth.some((group) => group.month === month)) return;

    setOpenMonths((previous) => {
      const next = new Set(previous);
      next.add(month);
      return next;
    });

    const otherMonthIndex = otherMonthGroups.findIndex((group) => group.month === month);
    if (otherMonthIndex >= 0) {
      const nextStart = Math.min(
        otherMonthsMaxStart,
        Math.max(0, otherMonthIndex - Math.floor(OTHER_MONTHS_WINDOW / 2))
      );
      setOtherMonthsWindowStart(nextStart);
    }

    pendingScrollMonthRef.current = month;
  };

  const getTrendMonthFromEvent = (event: unknown) => {
    const candidate = event as {
      activePayload?: Array<{ payload?: { key?: string } }>;
      payload?: { key?: string };
    };

    return candidate.activePayload?.[0]?.payload?.key ?? candidate.payload?.key ?? null;
  };

  const handleTrendClick = (event: unknown) => {
    const month = getTrendMonthFromEvent(event);
    if (!month) return;

    const now = Date.now();
    const lastClick = lastTrendClickRef.current;
    if (lastClick?.month === month && now - lastClick.at <= 450) {
      lastTrendClickRef.current = null;
      openMonthFromTrend(month);
      return;
    }

    lastTrendClickRef.current = { month, at: now };
  };

  const handleTrendDoubleClick = (event: unknown) => {
    const month = getTrendMonthFromEvent(event);
    if (month) openMonthFromTrend(month);
  };

  const monthOptions = useMemo(() => {
    const months = new Set<string>(groupedByMonth.map((g) => g.month));
    const fallbackNow = new Date();
    for (let i = 0; i < 13; i++) {
      const d = new Date(fallbackNow.getFullYear(), fallbackNow.getMonth() - i, 1);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    const sorted = Array.from(months).sort((a, b) => a.localeCompare(b));
    return sorted.map((m) => ({ value: m, label: formatMonthLabel(m) }));
  }, [groupedByMonth, currentMonth]);

  const pendingTotal = allEntries
    .filter(
      (entry) =>
        entry.status !== "paid" && entry.spent_at.startsWith(currentMonth)
    )
    .reduce((sum, entry) => sum + (entry.dueAmount ?? entry.amount), 0);

  const openInstallmentsTotal = installments.reduce((sum, inst) => {
    const paid = payments
      .filter((p) => p.installment_id === inst.id && p.status === "paid")
      .reduce((s, p) => s + Number(p.paid_amount ?? p.amount ?? 0), 0);
    return sum + Math.max(0, Number(inst.total_amount) - paid);
  }, 0);

  const faltaPagarTotal = pendingTotal + openInstallmentsTotal;

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
        const { error } = await supabase.rpc("update_expense_entry" as never, { p_id: editingEntry.id, p_payload: { description: data.description, amount: data.amount, category: data.category, spent_at: data.spent_at, payment_method: data.payment_method || null, card_due_date: data.payment_method === "Cartão Crédito" ? (data.card_due_date || null) : null, notes: data.notes || null } } as never);
        if (error) throw error;
        toast.success("Gasto atualizado");
      } else {
        const { error } = await supabase.rpc("create_expense_entry" as never, { p_payload: { description: data.description, amount: data.amount, category: data.category, spent_at: data.spent_at, payment_method: data.payment_method || null, card_due_date: data.payment_method === "Cartão Crédito" ? (data.card_due_date || null) : null, notes: data.notes || null } } as never);
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
      if (error || !created) throw error ?? new Error("Nao foi possivel criar o parcelamento.");

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
        is_recurring: true,
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
      const { error } = await supabase.rpc("delete_expense_entry" as never, { p_id: deleteId } as never);
      if (error) throw error;
      toast.success("Gasto excluido");
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
          toast.success("Conta paga! Proximo mes ja gerado automaticamente.");
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
      } else if (markPaidItem.source === "consortium") {
        const { error } = await supabase.rpc(
          "pay_consortium_payment",
          coerceMutation({
            p_payment_id: markPaidItem.id,
            p_paid_amount: markPaidAmount,
            p_notes: null,
          })
        );
        if (error) throw error;
        toast.success("Parcela do cons\u00f3rcio paga!");
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
      setEditPendingNotes(bill?.notes ?? "");
    } else if (entry.source === "installment") {
      const payment = payments.find((p) => p.id === entry.id);
      const installment = payment ? installmentsById.get(payment.installment_id) : undefined;
      setEditPendingName(installment?.description ?? entry.description);
      setEditPendingCategory(installment?.category ?? entry.category);
      setEditPendingPaymentMethod(installment?.payment_method ?? "");
      setEditPendingNotes(installment?.notes ?? "");
    } else if (entry.source === "consortium") {
      const payment = consortiumPayments.find((item) => item.id === entry.id);
      const consortium = payment
        ? consortiumsById.get(payment.consortium_id)
        : undefined;
      setEditPendingName(consortium?.name ?? entry.description);
      setEditPendingCategory("Cons\u00f3rcio");
      setEditPendingPaymentMethod("");
      setEditPendingNotes(payment?.notes ?? "");
    }
  };

  const handleSaveEditPending = async () => {
    if (!editPendingItem) return;
    setEditPendingSaving(true);
    try {
      if (editPendingItem.source === "bill") {
        const { error } = await supabase.from("bills").update(coerceMutation({
          name: editPendingName, amount: editPendingAmount, due_date: editPendingDueDate,
          category: editPendingCategory, notes: editPendingNotes || null,
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
      } else if (editPendingItem.source === "consortium") {
        const payment = consortiumPayments.find(
          (item) => item.id === editPendingItem.id
        );
        if (!payment) throw new Error("Parcela do cons\u00f3rcio n\u00e3o encontrada");

        const { error } = await supabase
          .from("consortium_payments")
          .update(
            coerceMutation({
              amount: editPendingAmount,
              due_date: editPendingDueDate,
              notes: editPendingNotes || null,
            })
          )
          .eq("id", editPendingItem.id);
        if (error) throw error;

        const { error: consortiumError } = await supabase
          .from("consortiums")
          .update(
            coerceMutation({
              name: editPendingName,
              current_installment_amount: editPendingAmount,
            })
          )
          .eq("id", payment.consortium_id);
        if (consortiumError) throw consortiumError;
      }

      toast.success("Lancamento atualizado");
      setEditPendingItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao atualizar lancamento");
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
        toast.success("Conta excluida");
      } else if (deletePendingItem.source === "installment") {
        const payment = payments.find((p) => p.id === deletePendingItem.id);
        if (payment) {
          await supabase.from("installment_payments").delete().eq("installment_id", payment.installment_id);
          const { error } = await supabase.from("installments").delete().eq("id", payment.installment_id);
          if (error) throw error;
        }
        toast.success("Parcelamento excluido");
      } else if (deletePendingItem.source === "consortium") {
        const payment = consortiumPayments.find(
          (item) => item.id === deletePendingItem.id
        );
        if (!payment) throw new Error("Parcela do consorcio nao encontrada");

        const { error } = await supabase
          .from("consortiums")
          .delete()
          .eq("id", payment.consortium_id);
        if (error) throw error;
        toast.success("Consorcio excluido");
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

      toast.success("Pagamento desfeito aÃ‚Â€Ã‚Â” volta para pendente");
      setRevertItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao desfazer pagamento");
    } finally {
      setReverting(false);
    }
  };

  const getCategoryColor = (category: string) => CATEGORY_COLORS[category] ?? "#94A3B8";

  const isEntryDiscounted = (entry: DisplayExpense) =>
    entry.status === "paid" &&
    (entry.source === "installment" || entry.source === "consortium") &&
    entry.scheduledAmount !== undefined && entry.amount < entry.scheduledAmount;

  const handleEntryEdit = (entry: DisplayExpense) => {
    if (entry.status !== "paid") {
      openEditPending(entry);
    } else if (entry.source === "manual") {
      const original = entries.find((e) => e.id === entry.id);
      if (original) openEdit(original);
    } else {
      openEditPaid(entry);
    }
  };

  const handleEntryDelete = (entry: DisplayExpense) => {
    if (entry.status !== "paid") {
      setDeletePendingItem(entry);
    } else if (entry.source === "manual") {
      setDeleteId(entry.id);
    }
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

      <div className="mb-6">
        <StatCard title="Falta pagar" value={formatCurrency(faltaPagarTotal, currency)} icon={TrendingDown} variant="expense" loading={loading} />
      </div>

      {/* Trend chart */}
      {!loading && trendData.some(d => d.value > 0) && (
        <div
          className="mb-5 overflow-hidden rounded-2xl border border-border/60 bg-surface/60 px-5 py-4 touch-pan-y"
          onTouchStart={handleTrendTouchStart}
          onTouchEnd={handleTrendTouchEnd}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goTrendBack}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-border/30 hover:text-text-primary"
              aria-label="Ver periodo anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <Select
              value={String(trendMonths)}
              onValueChange={(value) => setTrendMonths(Number(value) as 3 | 6 | 12)}
            >
              <SelectTrigger className="h-8 w-auto min-w-[150px] border-0 bg-transparent px-2 text-xs font-semibold uppercase tracking-wider text-text-secondary shadow-none">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="3">ÃƒÂƒÃ‚Âšltimos 3 meses</SelectItem>
                <SelectItem value="6">ÃƒÂƒÃ‚Âšltimos 6 meses</SelectItem>
                <SelectItem value="12">ÃƒÂƒÃ‚Âšltimos 12 meses</SelectItem>
              </SelectContent>
            </Select>

            <button
              type="button"
              onClick={goTrendForward}
              disabled={trendOffset === 0}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-border/30 hover:text-text-primary disabled:cursor-default disabled:opacity-30"
              aria-label="Ver periodo seguinte"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <ResponsiveContainer width="100%" height={80}>
            <BarChart
              data={trendData}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              onClick={handleTrendClick}
              onDoubleClick={handleTrendDoubleClick}
            >
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: chartColors.axis }}
                axisLine={false}
                tickLine={false}
              />
              <RechartTooltip content={<TrendTooltip />} cursor={{ fill: chartColors.cursor }} />

              <Bar
                dataKey="value"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                minPointSize={(value) => (!value ? 4 : 0)}
              >
                {trendData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.value > 0 ? chartColors.expense : chartColors.mutedBar}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Installment progress */}
      {!loading && activePaymentPlanCount > 0 && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-border/50">
          <button type="button" onClick={() => setInstallmentSummaryOpen((o) => !o)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-border/20">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Parcelamentos em andamento</span>
              <span className="text-[10px] text-text-secondary">{activePaymentPlanCount} ativo{activePaymentPlanCount !== 1 ? "s" : ""}</span>
              <span className="rounded-full bg-expense/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-expense">
                Falta {formatCurrency(paymentPlansRemainingTotal, currency)}
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
                        <span className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          progress >= 80 ? "bg-profit/20 text-profit" : progress >= 40 ? "bg-warning/20 text-warning" : "bg-accent/20 text-accent"
                        )}>
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
                          Proxima: {formatDate(nextPayment.due_date)} ÃƒÂ‚Ã‚Â· {formatCurrency(nextPayment.amount, currency)}
                        </p>
                      )}

                      <div className={cn("grid transition-all duration-300 ease-in-out", isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                        <div className="overflow-hidden">
                          <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                            {installmentPayments.map((payment) => {
                              const paymentNumber = payments.find((p) => p.id === payment.id)?.installment_number;
                              const isDiscounted = payment.status === "paid" && payment.scheduledAmount !== undefined && payment.amount < payment.scheduledAmount;
                              return (
                                <div key={payment.id} className="flex items-center gap-2 py-1">
                                  <span className="shrink-0 text-[10px] font-semibold tabular-nums text-text-secondary">
                                    {paymentNumber}/{installment.installment_count}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] text-text-primary">{formatDate(payment.spent_at)} ÃƒÂ‚Ã‚Â· {formatCurrency(payment.amount, currency)}</p>
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
                                          className="text-warning hover:bg-warning/10 hover:text-warning" title="Desfazer pagamento aÃ‚Â€Ã‚Â” volta para pendente">
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
                {consortiumSummaries.map(({ consortium, paidCount, paidAmount, progress, remainingAmount, nextPayment }) => {
                  const expansionId = `consortium:${consortium.id}`;
                  const isExpanded = expandedInstallmentIds.has(expansionId);
                  const scheduledPayments = consortiumPaymentsDisplayById.get(consortium.id) ?? [];

                  return (
                    <div key={consortium.id} className="rounded-2xl border border-border/50 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Landmark className="h-4 w-4 shrink-0 text-accent" />
                          <p className="min-w-0 break-words text-sm font-medium text-text-primary">{consortium.name}</p>
                        </div>
                        <span className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                          progress >= 80 ? "bg-profit/20 text-profit" : progress >= 40 ? "bg-warning/20 text-warning" : "bg-accent/20 text-accent"
                        )}>
                          {paidCount}/{consortium.total_installments}
                        </span>
                        <button type="button" onClick={() => toggleInstallmentExpanded(expansionId)}
                          className="shrink-0 rounded-lg p-0.5 text-text-secondary transition-colors hover:bg-border/20 hover:text-text-primary"
                          title={isExpanded ? "Recolher parcelas" : "Ver parcelas"}>
                          <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", isExpanded ? "rotate-180" : "rotate-0")} />
                        </button>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge variant="secondary" className="px-1.5 py-0 text-[9px]">{"Cons\u00f3rcio"}</Badge>
                      </div>
                      <Progress value={progress} className="mt-2 h-1.5"
                        indicatorClassName={progress >= 80 ? "bg-profit" : progress >= 40 ? "bg-warning" : "bg-accent"} />
                      <div className="mt-1.5 flex items-center justify-between text-[10px] text-text-secondary">
                        <span>Pago: <span className="font-semibold text-text-primary">{formatCurrency(paidAmount, currency)}</span></span>
                        <span>Falta: <span className="font-semibold text-text-primary">{formatCurrency(remainingAmount, currency)}</span></span>
                      </div>
                      {nextPayment && (
                        <p className="mt-1 text-[10px] text-text-secondary">
                          Pr\u00f3xima: {formatDate(nextPayment.due_date)} {"\u00b7"} {formatCurrency(nextPayment.amount, currency)}
                        </p>
                      )}

                      <div className={cn("grid transition-all duration-300 ease-in-out", isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                        <div className="overflow-hidden">
                          <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                            {scheduledPayments.map((payment) => {
                              const paymentRow = consortiumPaymentSchedule.find((row) => row.id === payment.id);
                              const paymentNumber = paymentRow?.installment_number;
                              const isDiscounted = paymentRow?.status === "paid_with_discount";

                              return (
                                <div key={payment.id} className="flex items-center gap-2 py-1">
                                  <span className="shrink-0 text-[10px] font-semibold tabular-nums text-text-secondary">
                                    {paymentNumber}/{consortium.total_installments}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[11px] text-text-primary">{formatDate(payment.spent_at)} {"\u00b7"} {formatCurrency(payment.amount, currency)}</p>
                                    {payment.status === "paid" && payment.dueDateRef && payment.dueDateRef !== payment.spent_at && (
                                      <p className="text-[9px] text-text-secondary/60">Vencia em {formatDate(payment.dueDateRef)}</p>
                                    )}
                                  </div>
                                  {payment.status === "overdue" && <Badge variant="expense" className="px-1.5 py-0 text-[9px]">Atrasada</Badge>}
                                  {payment.status === "pending" && <Badge variant="pending" className="px-1.5 py-0 text-[9px]">Pendente</Badge>}
                                  {isDiscounted && <Badge variant="paid_with_discount" className="px-1.5 py-0 text-[9px]">Pago com desconto</Badge>}
                                  {payment.status === "paid" && !isDiscounted && <Badge variant="paid" className="px-1.5 py-0 text-[9px]">Pago</Badge>}
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
      <ExpensesFilters
        monthFilter={monthFilter} setMonthFilter={setMonthFilter} monthOptions={monthOptions} currentMonth={currentMonth}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} filterCategories={filterCategories}
        paymentMethodFilter={paymentMethodFilter} setPaymentMethodFilter={setPaymentMethodFilter} filterPaymentMethods={filterPaymentMethods}
        sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
        dueDayFilter={dueDayFilter} setDueDayFilter={setDueDayFilter} filterDueDays={filterDueDays}
        search={search} setSearch={setSearch}
        activeFilterCount={activeFilterCount} onClearFilters={clearFilters}
      />

      {/* Grouped list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={TrendingDown} title="Nenhum gasto encontrado"
          description={hasActiveFilters ? "Tente remover os filtros." : "Registre seu primeiro gasto."}
          actionLabel={!hasActiveFilters ? "+ Novo Gasto" : undefined}
          onAction={!hasActiveFilters ? openCreate : undefined}
        />
      ) : (
        <div className="space-y-2">
          {currentMonthGroup && (
            <div ref={(node) => { monthCardRefs.current[currentMonthGroup.month] = node; }}>
              <MonthGroupCard
                month={currentMonthGroup.month} label={currentMonthGroup.label} items={currentMonthGroup.items}
                isCurrent isOpen={openMonths.has(currentMonthGroup.month)} onToggle={() => toggleMonth(currentMonthGroup.month)}
                currency={currency} getCategoryColor={getCategoryColor} isDiscounted={isEntryDiscounted}
                onMarkPaid={openMarkPaid} onEdit={handleEntryEdit} onDelete={handleEntryDelete}
                onRevert={(entry) => setRevertItem(entry)}
              />
            </div>
          )}

          {otherMonthGroups.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">Outros meses</span>
                <div className="h-px flex-1 bg-border/60" />
              </div>
              {otherMonthGroups.length > OTHER_MONTHS_WINDOW && (
                <button
                  type="button"
                  aria-label="Meses anteriores"
                  disabled={otherMonthsStart === 0}
                  onClick={() => setOtherMonthsWindowStart(Math.max(0, otherMonthsStart - 1))}
                  className="flex w-full items-center justify-center rounded-lg border border-border/60 py-1 text-text-secondary transition-colors duration-150 hover:bg-border/40 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
              )}
              <div className="flex flex-col gap-2">
                {visibleOtherMonths.map((group) => (
                  <div key={group.month} ref={(node) => { monthCardRefs.current[group.month] = node; }}>
                    <MonthGroupCard
                      month={group.month} label={group.label} items={group.items}
                      isCurrent={false} isOpen={openMonths.has(group.month)} onToggle={() => toggleMonth(group.month)}
                      currency={currency} getCategoryColor={getCategoryColor} isDiscounted={isEntryDiscounted}
                      onMarkPaid={openMarkPaid} onEdit={handleEntryEdit} onDelete={handleEntryDelete}
                      onRevert={(entry) => setRevertItem(entry)}
                    />
                  </div>
                ))}
              </div>
              {otherMonthGroups.length > OTHER_MONTHS_WINDOW && (
                <button
                  type="button"
                  aria-label="Proximos meses"
                  disabled={otherMonthsStart >= otherMonthsMaxStart}
                  onClick={() => setOtherMonthsWindowStart(Math.min(otherMonthsMaxStart, otherMonthsStart + 1))}
                  className="flex w-full items-center justify-center rounded-lg border border-border/60 py-1 text-text-secondary transition-colors duration-150 hover:bg-border/40 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              )}
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
              <FormField label="Descricao" error={errors.description?.message} required>
                <Input placeholder="Ex: Almoco restaurante" error={errors.description?.message} {...register("description")} />
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
              <FormField label="Metodo de pagamento" error={errors.payment_method?.message} required>
                <Controller name="payment_method" control={control} render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger error={errors.payment_method?.message}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </FormField>
              {paymentMethodValue === "Cartao Credito" && (
                <FormField label="Vencimento da fatura" hint="Opcional aÃ‚Â€Ã‚Â” edite se for diferente da data do gasto">
                  <Input type="date" {...register("card_due_date")} />
                </FormField>
              )}
              <FormField label="Observacoes">
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
              <FormField label="Descricao" error={installmentFormErrors.description} required>
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
              <FormField label="Data da 1ÃƒÂ‚Ã‚Âª parcela" error={installmentFormErrors.first_due_date} required>
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
                <FormField label="Metodo de pagamento" error={installmentFormErrors.payment_method}>
                  <Select value={installmentForm.payment_method} onValueChange={(value) => setInstallmentForm((c) => ({ ...c, payment_method: value }))}>
                    <SelectTrigger error={installmentFormErrors.payment_method}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{INSTALLMENT_PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
              </div>
              <FormField label="Observacoes">
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
              <FormField label="Nome da conta fixa" error={billFormErrors.name} required>
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
              <FormField label="Observacoes">
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
        title="Excluir gasto" description="Tem certeza? Esta acao nao pode ser desfeita."
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
            <FormField
              label="Valor pago"
              required
              hint={
                markPaidItem?.source === "installment"
                  ? "Altere o valor se pagou com desconto ou acrescimo."
                  : markPaidItem?.source === "consortium"
                    ? "Altere o valor se pagou com desconto."
                    : undefined
              }
            >
              <CurrencyInput value={markPaidAmount} onChange={setMarkPaidAmount} />
            </FormField>
            {(markPaidItem?.source === "installment" || markPaidItem?.source === "consortium") && markPaidItem.dueAmount !== undefined && markPaidAmount > 0 && markPaidAmount < markPaidItem.dueAmount && (
              <p className="rounded-lg bg-profit/10 px-3 py-2 text-xs text-profit">
                Sera registrado como <strong>Pago com desconto</strong> aÃ‚Â€Ã‚Â” economia de {formatCurrency(markPaidItem.dueAmount - markPaidAmount, currency)}
              </p>
            )}
            {markPaidItem?.source !== "consortium" && (
              <FormField label="Data do pagamento" required>
                <Input type="date" value={markPaidDate} onChange={e => setMarkPaidDate(e.target.value)} />
              </FormField>
            )}
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
                Sera registrado como <strong>Pago com desconto</strong> aÃ‚Â€Ã‚Â” economia de {formatCurrency(editPaidItem.dueAmount - editPaidAmount, currency)}
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
        description={`"${revertItem?.description}" vai voltar para pendente em ${revertItem?.source === "bill" ? "Contas" : "Parcelamentos"} e vai sair da lista de Gastos. Os dados da conta/parcelamento nao sao excluidos.`}
        confirmLabel="Desfazer pagamento" onConfirm={handleRevert} loading={reverting} />

      <Dialog open={editPendingItem !== null} onOpenChange={open => !open && setEditPendingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editPendingItem?.source === "bill"
                ? "Editar conta"
                : editPendingItem?.source === "consortium"
                  ? "Editar parcela do consorcio"
                  : "Editar parcelamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FormField label={editPendingItem?.source === "bill" ? "Nome da conta fixa" : "Descricao"} required>
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
            {editPendingItem?.source !== "consortium" && (
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
                  <FormField label="Metodo de pagamento">
                    <Select value={editPendingPaymentMethod} onValueChange={setEditPendingPaymentMethod}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{INSTALLMENT_PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormField>
                )}
              </div>
            )}
            <FormField label="Observacoes">
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
        title={deletePendingItem?.source === "installment" ? "Excluir parcelamento" : deletePendingItem?.source === "consortium" ? "Excluir consorcio" : "Excluir conta"}
        description={
          deletePendingItem?.source === "installment"
            ? `Isso vai excluir TODAS as parcelas de "${deletePendingItem?.description}", nao so esta. Esta acao nao pode ser desfeita.`
            : deletePendingItem?.source === "consortium"
              ? `Isso vai excluir o consorcio e todo o historico de parcelas de "${deletePendingItem?.description}". Esta acao nao pode ser desfeita.`
              : "Tem certeza? Esta acao nao pode ser desfeita."
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
