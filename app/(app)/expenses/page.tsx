"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TrendingDown, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { expenseSchema, type ExpenseFormData } from "@/lib/validations";
import type { ExpenseEntry } from "@/types/database";
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

const EXPENSE_CATEGORIES = ["Alimentação", "Mercado", "Transporte", "Moradia", "Internet", "Lazer", "Assinatura", "Emergência", "Outro"];
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

export default function ExpensesPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ExpenseEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  const monthOptions = getMonthOptions();

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { description: "", amount: 0, category: "", spent_at: "", payment_method: "", notes: "" },
  });

  const fetchEntries = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data, error } = await supabase
      .from("expense_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("spent_at", { ascending: false });
    if (error) { toast.error("Erro ao carregar gastos"); return; }
    setEntries(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const openCreate = () => {
    setEditingEntry(null);
    reset({ description: "", amount: 0, category: "", spent_at: new Date().toISOString().split("T")[0], payment_method: "", notes: "" });
    setModalOpen(true);
  };

  const openEdit = (entry: ExpenseEntry) => {
    setEditingEntry(entry);
    reset({
      description: entry.description, amount: entry.amount,
      category: entry.category, spent_at: entry.spent_at,
      payment_method: entry.payment_method ?? "", notes: entry.notes ?? "",
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: ExpenseFormData) => {
    try {
      if (editingEntry) {
        const { error } = await supabase.from("expense_entries").update(coerceMutation({
          description: data.description, amount: data.amount, category: data.category,
          spent_at: data.spent_at, payment_method: data.payment_method || null, notes: data.notes || null,
        })).eq("id", editingEntry.id);
        if (error) throw error;
        toast.success("Gasto atualizado com sucesso");
      } else {
        const { error } = await supabase.from("expense_entries").insert(coerceMutation({
          user_id: userId, description: data.description, amount: data.amount,
          category: data.category, spent_at: data.spent_at,
          payment_method: data.payment_method || null, notes: data.notes || null,
        }));
        if (error) throw error;
        toast.success("Gasto registrado com sucesso");
      }
      setModalOpen(false);
      await fetchEntries();
    } catch {
      toast.error("Erro ao salvar gasto. Tente novamente.");
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

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTotal = entries.filter(e => e.spent_at.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0);
  const totalAll = entries.reduce((s, e) => s + e.amount, 0);

  const filtered = entries.filter(e => {
    const matchMonth = monthFilter === "all" || e.spent_at.startsWith(monthFilter);
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchCat && matchSearch;
  });

  const topCategory = (() => {
    const map: Record<string, number> = {};
    entries.filter(e => e.spent_at.startsWith(currentMonth)).forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] ?? "—";
  })();

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-expense/20">
            <TrendingDown className="h-5 w-5 text-expense" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Gastos</h1>
            <p className="text-sm text-text-secondary">Controle suas despesas</p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm" variant="destructive" className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo Gasto</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatCard title="Total do Mês" value={formatCurrency(monthTotal)} icon={TrendingDown} variant="expense" loading={loading} />
        <StatCard title="Total Geral" value={formatCurrency(totalAll)} icon={TrendingDown} variant="default" loading={loading} />
        <StatCard title="Maior categoria" value={topCategory} icon={TrendingDown} variant="warning" loading={loading} subtitle="Este mês" />
      </div>

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
            {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />} className="flex-1" />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={TrendingDown} title="Nenhum gasto encontrado"
          description={search || monthFilter !== "all" || categoryFilter !== "all"
            ? "Tente remover os filtros." : "Registre seu primeiro gasto."}
          actionLabel={!search && monthFilter === "all" && categoryFilter === "all" ? "+ Novo Gasto" : undefined}
          onAction={!search && monthFilter === "all" && categoryFilter === "all" ? openCreate : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="hidden sm:grid grid-cols-[1fr_140px_120px_100px_80px] gap-4 px-5 py-3 bg-border/30 text-xs font-medium text-text-secondary uppercase tracking-wide">
            <span>Descrição</span><span>Categoria</span><span>Valor</span><span>Data</span><span className="text-right">Ações</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map(entry => (
              <div key={entry.id}
                className="flex sm:grid sm:grid-cols-[1fr_140px_120px_100px_80px] gap-4 items-center px-5 py-3.5 hover:bg-border/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{entry.description}</p>
                  {entry.payment_method && <p className="text-xs text-text-secondary">{entry.payment_method}</p>}
                  <div className="sm:hidden flex items-center gap-2 mt-1">
                    <Badge variant="expense" className="text-[10px]">{entry.category}</Badge>
                    <span className="text-xs text-text-secondary">{formatDate(entry.spent_at)}</span>
                  </div>
                </div>
                <div className="hidden sm:block"><Badge variant="expense">{entry.category}</Badge></div>
                <div className="hidden sm:block shrink-0">
                  <span className="text-sm font-semibold text-expense">{formatCurrency(entry.amount)}</span>
                </div>
                <div className="hidden sm:block shrink-0">
                  <span className="text-sm text-text-secondary">{formatDate(entry.spent_at)}</span>
                </div>
                <div className="flex items-center gap-1 sm:justify-end shrink-0">
                  <span className="sm:hidden text-sm font-semibold text-expense mr-2">{formatCurrency(entry.amount)}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(entry)}
                    className="text-text-secondary hover:text-text-primary">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(entry.id)}
                    className="text-text-secondary hover:text-expense hover:bg-expense/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={open => { if (!open) { setModalOpen(false); setEditingEntry(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Editar Gasto" : "Novo Gasto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Descrição" error={errors.description?.message} required>
              <Input placeholder="Ex: Almoço restaurante" error={errors.description?.message} {...register("description")} />
            </FormField>
            <FormField label="Valor" error={errors.amount?.message} required>
              <Controller name="amount" control={control}
                render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} error={errors.amount?.message} />}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Categoria" error={errors.category?.message} required>
                <Controller name="category" control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger error={errors.category?.message}><SelectValue placeholder="Categoria" /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Data do gasto" error={errors.spent_at?.message} required>
                <Input type="date" error={errors.spent_at?.message} {...register("spent_at")} />
              </FormField>
            </div>
            <FormField label="Método de pagamento">
              <Controller name="payment_method" control={control}
                render={({ field }) => (
                  <Select value={field.value ?? ""} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>
            <FormField label="Observações">
              <Textarea placeholder="Notas opcionais..." rows={2} {...register("notes")} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button type="submit" variant="destructive" loading={isSubmitting}>
                {editingEntry ? "Salvar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}
        title="Excluir gasto" description="Tem certeza? Esta ação não pode ser desfeita."
        confirmLabel="Excluir" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
