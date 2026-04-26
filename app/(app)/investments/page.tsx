"use client";

import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PiggyBank, Plus, Search, Pencil, Trash2, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { getMonthOptions, INVESTMENT_TYPES } from "@/lib/finance";
import { formatCurrency, formatDate } from "@/lib/utils";
import { investmentSchema, type InvestmentFormData } from "@/lib/validations";
import type { Investment } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";

export default function InvestmentsPage() {
  const supabase = createClient();
  const [entries, setEntries] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Investment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const monthOptions = getMonthOptions(18);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvestmentFormData>({
    resolver: zodResolver(investmentSchema),
    defaultValues: { name: "", amount: 0, investment_type: "", invested_at: "", notes: "" },
  });

  const fetchEntries = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const { data, error } = await supabase
      .from("investments")
      .select("*")
      .eq("user_id", user.id)
      .order("invested_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar investimentos");
      setLoading(false);
      return;
    }

    setEntries(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const openCreate = () => {
    setEditingEntry(null);
    reset({
      name: "",
      amount: 0,
      investment_type: "",
      invested_at: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setModalOpen(true);
  };

  const openEdit = (entry: Investment) => {
    setEditingEntry(entry);
    reset({
      name: entry.name,
      amount: entry.amount,
      investment_type: entry.investment_type,
      invested_at: entry.invested_at,
      notes: entry.notes ?? "",
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: InvestmentFormData) => {
    try {
      if (editingEntry) {
        const { error } = await supabase
          .from("investments")
          .update(coerceMutation({
            name: data.name,
            amount: data.amount,
            investment_type: data.investment_type,
            invested_at: data.invested_at,
            notes: data.notes || null,
          }))
          .eq("id", editingEntry.id);

        if (error) {
          throw error;
        }

        toast.success("Investimento atualizado");
      } else {
        const { error } = await supabase.from("investments").insert(coerceMutation({
          user_id: userId,
          name: data.name,
          amount: data.amount,
          investment_type: data.investment_type,
          invested_at: data.invested_at,
          notes: data.notes || null,
        }));

        if (error) {
          throw error;
        }

        toast.success("Investimento registrado");
      }

      setModalOpen(false);
      await fetchEntries();
    } catch {
      toast.error("Nao foi possivel salvar o investimento");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase.from("investments").delete().eq("id", deleteId);

      if (error) {
        throw error;
      }

      setEntries((current) => current.filter((entry) => entry.id !== deleteId));
      toast.success("Investimento excluido");
    } catch {
      toast.error("Erro ao excluir investimento");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyTotal = entries
    .filter((entry) => entry.invested_at.startsWith(currentMonth))
    .reduce((sum, entry) => sum + entry.amount, 0);
  const totalAll = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const uniqueTypes = [...new Set(entries.map((entry) => entry.investment_type))].sort();

  const filtered = entries.filter((entry) => {
    const matchMonth = monthFilter === "all" || entry.invested_at.startsWith(monthFilter);
    const matchType = typeFilter === "all" || entry.investment_type === typeFilter;
    const matchSearch = !search || entry.name.toLowerCase().includes(search.toLowerCase());
    return matchMonth && matchType && matchSearch;
  });

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={PiggyBank}
        iconTone="accent"
        title="Investimentos"
        description="Registre aportes e acompanhe quanto ja esta trabalhando por voce."
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo investimento
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Investido no mes" value={formatCurrency(monthlyTotal)} icon={TrendingUp} variant="accent" loading={loading} />
        <StatCard title="Investido total" value={formatCurrency(totalAll)} icon={PiggyBank} variant="profit" loading={loading} />
        <StatCard title="Tipos ativos" value={String(uniqueTypes.length)} icon={PiggyBank} variant="default" loading={loading} />
        <StatCard title="Registros" value={String(entries.length)} icon={TrendingUp} variant="warning" loading={loading} subtitle={`${filtered.length} exibindo`} />
      </div>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full lg:w-52">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {uniqueTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar investimento..."
          leftIcon={<Search className="h-4 w-4" />}
          className="flex-1"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Nenhum investimento encontrado"
          description={search || monthFilter !== "all" || typeFilter !== "all"
            ? "Ajuste os filtros para encontrar seus registros."
            : "Comece registrando seu primeiro aporte."}
          actionLabel={!search && monthFilter === "all" && typeFilter === "all" ? "+ Novo investimento" : undefined}
          onAction={!search && monthFilter === "all" && typeFilter === "all" ? openCreate : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <div className="hidden grid-cols-[1fr_180px_140px_110px_88px] gap-4 bg-border/30 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary sm:grid">
            <span>Investimento</span>
            <span>Tipo</span>
            <span>Valor</span>
            <span>Data</span>
            <span className="text-right">Acoes</span>
          </div>
          <div className="divide-y divide-border">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-border/20 sm:grid sm:grid-cols-[1fr_180px_140px_110px_88px]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-text-primary">{entry.name}</p>
                  {entry.notes && <p className="truncate text-xs text-text-secondary">{entry.notes}</p>}
                  <div className="mt-1 flex items-center gap-2 sm:hidden">
                    <Badge variant="default" className="text-[10px]">
                      {entry.investment_type}
                    </Badge>
                    <span className="text-xs text-text-secondary">{formatDate(entry.invested_at)}</span>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <Badge variant="default">{entry.investment_type}</Badge>
                </div>
                <div className="hidden sm:block text-sm font-semibold text-accent">{formatCurrency(entry.amount)}</div>
                <div className="hidden sm:block text-sm text-text-secondary">{formatDate(entry.invested_at)}</div>
                <div className="flex shrink-0 items-center gap-1 sm:justify-end">
                  <span className="mr-2 text-sm font-semibold text-accent sm:hidden">{formatCurrency(entry.amount)}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => openEdit(entry)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteId(entry.id)}
                    className="hover:bg-expense/10 hover:text-expense"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Editar investimento" : "Novo investimento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Nome" error={errors.name?.message} required>
              <Input placeholder="Ex: Tesouro Selic" error={errors.name?.message} {...register("name")} />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Valor" error={errors.amount?.message} required>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput value={field.value} onChange={field.onChange} error={errors.amount?.message} />
                  )}
                />
              </FormField>
              <FormField label="Data do aporte" error={errors.invested_at?.message} required>
                <Input type="date" error={errors.invested_at?.message} {...register("invested_at")} />
              </FormField>
            </div>

            <FormField label="Tipo" error={errors.investment_type?.message} required>
              <Controller
                name="investment_type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger error={errors.investment_type?.message}>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {INVESTMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField label="Observacoes">
              <Textarea rows={3} placeholder="Notas opcionais..." {...register("notes")} />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {editingEntry ? "Salvar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir investimento"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
