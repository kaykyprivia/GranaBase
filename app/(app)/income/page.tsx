"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { TrendingUp, Plus, Search, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { incomeSchema, type IncomeFormData } from "@/lib/validations";
import type { IncomeEntry } from "@/types/database";
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
    return [e.message, e.code ? `code=${e.code}` : null, e.details, e.hint]
      .filter(Boolean)
      .join(" | ");
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

export default function IncomePage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<IncomeEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");

  const monthOptions = getMonthOptions();

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<IncomeFormData>({
    resolver: zodResolver(incomeSchema),
    defaultValues: { description: "", amount: 0, category: "", received_at: "", payment_method: "", notes: "" },
  });

  const fetchEntries = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("income_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false });
    if (error) { toast.error("Erro ao carregar entradas"); return; }
    setEntries(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const openCreate = () => {
    setEditingEntry(null);
    reset({ description: "", amount: 0, category: "", received_at: new Date().toISOString().split("T")[0], payment_method: "", notes: "" });
    setModalOpen(true);
  };

  const openEdit = (entry: IncomeEntry) => {
    setEditingEntry(entry);
    reset({
      description: entry.description, amount: entry.amount,
      category: entry.category, received_at: entry.received_at,
      payment_method: entry.payment_method ?? "", notes: entry.notes ?? "",
    });
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
        toast.success("Entrada atualizada com sucesso");
      } else {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          toast.error("Usuário não autenticado. Faça login novamente.");
          return;
        }
        const { error } = await supabase.from("income_entries").insert(coerceMutation({
          user_id: user.id, description: data.description, amount: data.amount,
          category: data.category, received_at: data.received_at,
          payment_method: data.payment_method || null, notes: data.notes || null,
        }));
        if (error) {
          console.error("INCOME INSERT ERROR:", JSON.stringify(error, null, 2));
          throw new Error(getSupabaseErrorMessage(error));
        }
        toast.success("Entrada registrada com sucesso");
      }
      setModalOpen(false);
      await fetchEntries();
    } catch (error) {
      const message = getSupabaseErrorMessage(error);
      console.error("INCOME SUBMIT FAILED:", error);
      toast.error(`Erro ao salvar entrada: ${message}`);
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

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTotal = entries.filter(e => e.received_at.startsWith(currentMonth)).reduce((s, e) => s + e.amount, 0);
  const totalAll = entries.reduce((s, e) => s + e.amount, 0);

  const filtered = entries.filter(e => {
    const matchMonth = monthFilter === "all" || e.received_at.startsWith(monthFilter);
    const matchCat = categoryFilter === "all" || e.category === categoryFilter;
    const matchSearch = !search || e.description.toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchCat && matchSearch;
  });

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
            <p className="text-sm text-text-secondary">Controle todas as suas receitas</p>
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
        <StatCard title="Registros" value={String(entries.length)} icon={TrendingUp} variant="default" loading={loading} subtitle={`${filtered.length} exibindo`} />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {INCOME_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="Buscar por descrição..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          className="flex-1"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Nenhuma entrada encontrada"
          description={search || monthFilter !== "all" || categoryFilter !== "all"
            ? "Tente remover ou ajustar os filtros."
            : "Registre sua primeira entrada de receita."}
          actionLabel={!search && monthFilter === "all" && categoryFilter === "all" ? "+ Nova Entrada" : undefined}
          onAction={!search && monthFilter === "all" && categoryFilter === "all" ? openCreate : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-[1fr_140px_120px_100px_80px] gap-4 px-5 py-3 bg-border/30 text-xs font-medium text-text-secondary uppercase tracking-wide">
            <span>Descrição</span>
            <span>Categoria</span>
            <span>Valor</span>
            <span>Data</span>
            <span className="text-right">Ações</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map(entry => (
              <div
                key={entry.id}
                className="flex sm:grid sm:grid-cols-[1fr_140px_120px_100px_80px] gap-4 items-center px-5 py-3.5 hover:bg-border/20 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{entry.description}</p>
                  {entry.payment_method && (
                    <p className="text-xs text-text-secondary">{entry.payment_method}</p>
                  )}
                  {/* Mobile only */}
                  <div className="sm:hidden flex items-center gap-2 mt-1">
                    <Badge variant="profit" className="text-[10px]">{entry.category}</Badge>
                    <span className="text-xs text-text-secondary">{formatDate(entry.received_at)}</span>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <Badge variant="profit">{entry.category}</Badge>
                </div>
                <div className="hidden sm:block shrink-0">
                  <span className="text-sm font-semibold text-profit">{formatCurrency(entry.amount)}</span>
                </div>
                <div className="hidden sm:block shrink-0">
                  <span className="text-sm text-text-secondary">{formatDate(entry.received_at)}</span>
                </div>
                <div className="flex items-center gap-1 sm:justify-end shrink-0">
                  {/* Mobile value */}
                  <span className="sm:hidden text-sm font-semibold text-profit mr-2">{formatCurrency(entry.amount)}</span>
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
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <CurrencyInput value={field.value} onChange={field.onChange} error={errors.amount?.message} />
                )}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Categoria" error={errors.category?.message} required>
                <Controller
                  name="category"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger error={errors.category?.message}>
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {INCOME_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField label="Data do recebimento" error={errors.received_at?.message} required>
                <Input type="date" error={errors.received_at?.message} {...register("received_at")} />
              </FormField>
            </div>
            <FormField label="Método de pagamento">
              <Controller
                name="payment_method"
                control={control}
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
              <Button type="submit" variant="profit" loading={isSubmitting}>
                {editingEntry ? "Salvar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={open => !open && setDeleteId(null)}
        title="Excluir entrada"
        description="Tem certeza? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
