"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BarChart, Bar, XAxis, Tooltip as RechartTooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Plus, Search, Pencil, Trash2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { incomeSchema, type IncomeFormData } from "@/lib/validations";
import type { IncomeEntry, Receivable } from "@/types/database";
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

function getSupabaseErrorMessage(error: unknown): string {
  if (!error) return "Erro desconhecido.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const e = error as { message?: string; code?: string; details?: string; hint?: string };
    return [e.message, e.code ? `code=${e.code}` : null, e.details, e.hint].filter(Boolean).join(" | ");
  }
  return "Erro inesperado.";
}

const INCOME_CATEGORIES = ["Bico", "Freela", "Venda", "Comissão", "Pix", "Reembolso", "Outro"];
const PAYMENT_METHODS = ["Dinheiro", "Pix", "Cartão Débito", "Cartão Crédito", "Transferência", "Outro"];

function getMonthOptions() {
  const opts: { value: string; label: string }[] = [{ value: "all", label: "Todos os meses" }];
  const now = new Date();
  const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` });
  }
  return opts;
}

function formatMonthLabel(key: string) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(key + "-15"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface DisplayIncome {
  id: string;
  description: string;
  amount: number;
  category: string;
  received_at: string;
  payment_method: string | null;
  created_at: string;
  source: "manual" | "receivable";
}

function dateTimeSortKey(entry: DisplayIncome) {
  const time = entry.created_at.includes("T") ? entry.created_at.slice(11) : "00:00:00";
  return `${entry.received_at}T${time}`;
}

function withNewDate(originalIso: string, newDateStr: string) {
  const original = new Date(originalIso);
  const [year, month, day] = newDateStr.split("-").map(Number);
  original.setUTCFullYear(year, month - 1, day);
  return original.toISOString();
}

interface TrendTooltipProps { active?: boolean; payload?: Array<{ value: number }>; label?: string }
function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-sm font-bold text-profit">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

export default function IncomePage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [receivedReceivables, setReceivedReceivables] = useState<DisplayIncome[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<IncomeEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editReceivedItem, setEditReceivedItem] = useState<DisplayIncome | null>(null);
  const [editReceivedAmount, setEditReceivedAmount] = useState(0);
  const [editReceivedDate, setEditReceivedDate] = useState("");
  const [editReceivedSaving, setEditReceivedSaving] = useState(false);
  const [revertReceivedItem, setRevertReceivedItem] = useState<DisplayIncome | null>(null);
  const [revertingReceived, setRevertingReceived] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const monthOptions = getMonthOptions();

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<IncomeFormData>({
    resolver: zodResolver(incomeSchema),
    defaultValues: { description: "", amount: 0, category: "", received_at: "", payment_method: "", notes: "" },
  });

  const fetchEntries = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [incomeRes, receivablesRes] = await Promise.all([
      supabase.from("income_entries").select("*").eq("user_id", user.id).order("received_at", { ascending: false }),
      supabase.from("receivables").select("*").eq("user_id", user.id).eq("status", "received"),
    ]);

    if (incomeRes.error) { toast.error("Erro ao carregar entradas"); return; }
    setEntries(incomeRes.data ?? []);

    const receivables = coerceData<Receivable[]>(receivablesRes.data ?? []);
    setReceivedReceivables(
      receivables
        .filter((r) => r.received_at)
        .map((r) => ({
          id: r.id,
          description: r.description,
          amount: r.amount,
          category: r.category,
          received_at: r.received_at!.slice(0, 10),
          payment_method: null,
          created_at: r.received_at!,
          source: "receivable" as const,
        }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const allEntries = useMemo<DisplayIncome[]>(() => [
    ...entries.map((e) => ({ ...e, source: "manual" as const })),
    ...receivedReceivables,
  ], [entries, receivedReceivables]);

  const trendData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = d.toISOString().slice(0, 7);
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", "");
      const value = allEntries.filter(e => e.received_at.startsWith(key)).reduce((s, e) => s + e.amount, 0);
      return { month: label, value };
    });
  }, [allEntries]);

  const filtered = useMemo(() => allEntries.filter(e => {
    const matchMonth = monthFilter === "all" || e.received_at.startsWith(monthFilter);
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchCat && matchSearch;
  }), [allEntries, monthFilter, categoryFilter, search]);

  const groupedByMonth = useMemo(() => {
    const grouped: Record<string, DisplayIncome[]> = {};
    [...filtered].forEach(e => {
      const key = e.received_at.slice(0, 7);
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

  useEffect(() => {
    if (groupedByMonth.length > 0) {
      setOpenMonths(new Set([groupedByMonth[0].month]));
    }
  }, [groupedByMonth.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMonth = (month: string) => {
    setOpenMonths(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month); else next.add(month);
      return next;
    });
  };

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTotal = allEntries.filter(e => e.received_at.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0);
  const totalAll = allEntries.reduce((s, e) => s + e.amount, 0);

  const openCreate = () => {
    setEditingEntry(null);
    reset({ description: "", amount: 0, category: "", received_at: new Date().toISOString().split("T")[0], payment_method: "", notes: "" });
    setModalOpen(true);
  };

  const openEdit = (entry: IncomeEntry) => {
    setEditingEntry(entry);
    reset({ description: entry.description, amount: entry.amount, category: entry.category, received_at: entry.received_at, payment_method: entry.payment_method ?? "", notes: entry.notes ?? "" });
    setModalOpen(true);
  };

  const onSubmit = async (data: IncomeFormData) => {
    try {
      if (editingEntry) {
        const { error } = await supabase.from("income_entries").update(coerceMutation({
          description: data.description, amount: data.amount, category: data.category,
          received_at: data.received_at, payment_method: data.payment_method || null, notes: data.notes || null,
        })).eq("id", editingEntry.id);
        if (error) throw error;
        toast.success("Entrada atualizada");
      } else {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) { toast.error("Usuário não autenticado."); return; }
        const { error } = await supabase.from("income_entries").insert(coerceMutation({
          user_id: user.id, description: data.description, amount: data.amount,
          category: data.category, received_at: data.received_at,
          payment_method: data.payment_method || null, notes: data.notes || null,
        }));
        if (error) throw new Error(getSupabaseErrorMessage(error));
        toast.success("Entrada registrada");
      }
      setModalOpen(false);
      await fetchEntries();
    } catch (error) {
      toast.error(`Erro ao salvar: ${getSupabaseErrorMessage(error)}`);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("income_entries").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Entrada excluída");
      setEntries(prev => prev.filter(e => e.id !== deleteId));
    } catch {
      toast.error("Erro ao excluir entrada");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const openEditReceived = (entry: DisplayIncome) => {
    setEditReceivedItem(entry);
    setEditReceivedAmount(entry.amount);
    setEditReceivedDate(entry.received_at);
  };

  const handleSaveEditReceived = async () => {
    if (!editReceivedItem) return;
    setEditReceivedSaving(true);
    try {
      const newReceivedAt = withNewDate(editReceivedItem.created_at, editReceivedDate);
      const { error } = await supabase.from("receivables").update(coerceMutation({
        amount: editReceivedAmount, received_at: newReceivedAt,
      })).eq("id", editReceivedItem.id);
      if (error) throw error;

      toast.success("Recebimento atualizado");
      setEditReceivedItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao atualizar recebimento");
    } finally {
      setEditReceivedSaving(false);
    }
  };

  const handleRevertReceived = async () => {
    if (!revertReceivedItem) return;
    setRevertingReceived(true);
    try {
      const { error } = await supabase.from("receivables").update(coerceMutation({
        status: "pending", received_at: null,
      })).eq("id", revertReceivedItem.id);
      if (error) throw error;

      toast.success("Recebimento desfeito — volta para pendente");
      setRevertReceivedItem(null);
      await fetchEntries();
    } catch {
      toast.error("Erro ao desfazer recebimento");
    } finally {
      setRevertingReceived(false);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-profit/20">
            <TrendingUp className="h-5 w-5 text-profit" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Entradas</h1>
            <p className="text-sm text-text-secondary">Controle suas receitas</p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm" variant="profit" className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Entrada</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard title="Total do Mês" value={formatCurrency(monthTotal)} icon={TrendingUp} variant="profit" loading={loading} />
        <StatCard title="Total Geral" value={formatCurrency(totalAll)} icon={TrendingUp} variant="accent" loading={loading} />
        <StatCard title="Registros" value={String(allEntries.length)} icon={TrendingUp} variant="default" loading={loading} subtitle={`${filtered.length} exibindo`} />
      </div>

      {/* Trend chart */}
      {!loading && trendData.some(d => d.value > 0) && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-border/60 bg-surface/60 px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">Últimos 6 meses</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={trendData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
              <RechartTooltip content={<TrendTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              <Bar dataKey="value" fill="#22C55E" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Mês" /></SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {INCOME_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar por descrição..." value={search} onChange={e => setSearch(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />} className="flex-1" />
      </div>

      {/* Grouped list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={TrendingUp} title="Nenhuma entrada encontrada"
          description={search || monthFilter !== "all" || categoryFilter !== "all"
            ? "Tente remover ou ajustar os filtros." : "Registre sua primeira entrada de receita."}
          actionLabel={!search && monthFilter === "all" && categoryFilter === "all" ? "+ Nova Entrada" : undefined}
          onAction={!search && monthFilter === "all" && categoryFilter === "all" ? openCreate : undefined}
        />
      ) : (
        <div className="space-y-2">
          {groupedByMonth.map(({ month, label, items, total }) => {
            const isOpen = openMonths.has(month);
            return (
              <div key={month} className="overflow-hidden rounded-2xl border border-border/50">
                <button type="button" onClick={() => toggleMonth(month)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-border/20">
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
                    <span className="rounded-full bg-profit/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-profit">{formatCurrency(total)}</span>
                    <span className="text-[10px] text-text-secondary">{items.length} item{items.length !== 1 ? "s" : ""}</span>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-text-secondary transition-transform duration-300", isOpen ? "rotate-180" : "rotate-0")} />
                </button>

                <div className={cn("grid transition-all duration-300 ease-in-out", isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="overflow-hidden">
                    <div className="border-t border-border/40">
                      {items.map(entry => (
                        <div key={entry.id}
                          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-border/20 border-b border-border/20 last:border-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-profit/12">
                            <TrendingUp className="h-3.5 w-3.5 text-profit" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-medium text-text-primary">{entry.description}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <Badge variant="profit" className="text-[10px]">{entry.category}</Badge>
                              {entry.source === "receivable" && <Badge variant="default" className="text-[10px]">Recebível</Badge>}
                              {entry.payment_method && <span className="text-[10px] text-text-secondary">{entry.payment_method}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold tabular-nums text-profit">{formatCurrency(entry.amount)}</p>
                            <p className="text-[10px] text-text-secondary">{formatDate(entry.received_at)}</p>
                            <p className="text-[10px] text-text-secondary/60">{formatTime(entry.created_at)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button variant="ghost" size="icon-sm" onClick={() => {
                              if (entry.source === "manual") {
                                const original = entries.find((e) => e.id === entry.id);
                                if (original) openEdit(original);
                              } else {
                                openEditReceived(entry);
                              }
                            }} className="text-text-secondary hover:text-text-primary">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => {
                              if (entry.source === "manual") {
                                setDeleteId(entry.id);
                              } else {
                                setRevertReceivedItem(entry);
                              }
                            }} className="text-text-secondary hover:text-expense hover:bg-expense/10">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={open => { if (!open) { setModalOpen(false); setEditingEntry(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Editar Entrada" : "Nova Entrada"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Descrição" error={errors.description?.message} required>
              <Input placeholder="Ex: Freela de design" error={errors.description?.message} {...register("description")} />
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
                    <SelectContent>{INCOME_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                )} />
              </FormField>
              <FormField label="Data do recebimento" error={errors.received_at?.message} required>
                <Input type="date" error={errors.received_at?.message} {...register("received_at")} />
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
            <FormField label="Observações">
              <Textarea placeholder="Notas opcionais..." rows={2} {...register("notes")} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="profit" loading={isSubmitting}>{editingEntry ? "Salvar" : "Registrar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}
        title="Excluir entrada" description="Tem certeza? Esta ação não pode ser desfeita."
        confirmLabel="Excluir" onConfirm={handleDelete} loading={deleting} />

      <Dialog open={editReceivedItem !== null} onOpenChange={open => !open && setEditReceivedItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar recebimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{editReceivedItem?.description}</p>
            <FormField label="Valor recebido" required>
              <CurrencyInput value={editReceivedAmount} onChange={setEditReceivedAmount} />
            </FormField>
            <FormField label="Data do recebimento" required>
              <Input type="date" value={editReceivedDate} onChange={e => setEditReceivedDate(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditReceivedItem(null)}>Cancelar</Button>
            <Button type="button" variant="profit" loading={editReceivedSaving} onClick={handleSaveEditReceived}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={revertReceivedItem !== null} onOpenChange={open => !open && setRevertReceivedItem(null)}
        title="Desfazer recebimento"
        description={`"${revertReceivedItem?.description}" vai voltar para pendente em A Receber e vai sair da lista de Entradas. O registro não é excluído.`}
        confirmLabel="Desfazer recebimento" onConfirm={handleRevertReceived} loading={revertingReceived} />
    </div>
  );
}
