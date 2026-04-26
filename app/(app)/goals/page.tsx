"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Target, Plus, Pencil, Trash2, Wallet, PauseCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { GOAL_CATEGORIES } from "@/lib/finance";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { goalSchema, type GoalFormData } from "@/lib/validations";
import type { FinancialGoal } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";

type GoalStatus = FinancialGoal["status"];

interface GoalEditorState extends GoalFormData {
  status: GoalStatus;
}

const EMPTY_GOAL_FORM: GoalEditorState = {
  name: "",
  target_amount: 0,
  current_amount: 0,
  deadline: "",
  category: "",
  notes: "",
  status: "active",
};

export default function GoalsPage() {
  const supabase = createClient();
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<GoalEditorState>(EMPTY_GOAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof GoalEditorState, string>>>({});
  const [contributionGoal, setContributionGoal] = useState<FinancialGoal | null>(null);
  const [contributionAmount, setContributionAmount] = useState(0);
  const [contributing, setContributing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | GoalStatus>("all");

  const fetchGoals = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const { data, error } = await supabase
      .from("financial_goals")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar metas");
      setLoading(false);
      return;
    }

    setGoals(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const openCreate = () => {
    setEditingGoal(null);
    setErrors({});
    setForm({
      ...EMPTY_GOAL_FORM,
      deadline: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split("T")[0],
    });
    setModalOpen(true);
  };

  const openEdit = (goal: FinancialGoal) => {
    setEditingGoal(goal);
    setErrors({});
    setForm({
      name: goal.name,
      target_amount: goal.target_amount,
      current_amount: goal.current_amount,
      deadline: goal.deadline ?? "",
      category: goal.category,
      notes: goal.notes ?? "",
      status: goal.status,
    });
    setModalOpen(true);
  };

  const filteredGoals = useMemo(() => {
    if (statusFilter === "all") {
      return goals;
    }

    return goals.filter((goal) => goal.status === statusFilter);
  }, [goals, statusFilter]);

  const totals = useMemo(() => {
    return goals.reduce(
      (accumulator, goal) => {
        accumulator.target += goal.target_amount;
        accumulator.current += goal.current_amount;
        if (goal.status === "completed") {
          accumulator.completed += 1;
        }
        if (goal.status === "active") {
          accumulator.active += 1;
        }
        return accumulator;
      },
      { target: 0, current: 0, completed: 0, active: 0 }
    );
  }, [goals]);

  const validateForm = () => {
    setErrors({});
    const parsed = goalSchema.safeParse({
      name: form.name,
      target_amount: form.target_amount,
      current_amount: form.current_amount,
      deadline: form.deadline || undefined,
      category: form.category,
      notes: form.notes || undefined,
    });

    if (parsed.success) {
      return parsed.data;
    }

    const nextErrors: Partial<Record<keyof GoalEditorState, string>> = {};
    parsed.error.errors.forEach((issue) => {
      const key = issue.path[0] as keyof GoalEditorState;
      nextErrors[key] = issue.message;
    });
    setErrors(nextErrors);
    return null;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = validateForm();

    if (!parsed) {
      return;
    }

    setSaving(true);
    const resolvedStatus: GoalStatus =
      form.status === "paused"
        ? "paused"
        : parsed.current_amount >= parsed.target_amount
          ? "completed"
          : "active";

    try {
      const payload = {
        name: parsed.name,
        target_amount: parsed.target_amount,
        current_amount: parsed.current_amount,
        deadline: parsed.deadline || null,
        category: parsed.category,
        notes: parsed.notes || null,
        status: resolvedStatus,
      };

      if (editingGoal) {
        const { error } = await supabase.from("financial_goals").update(coerceMutation(payload)).eq("id", editingGoal.id);
        if (error) {
          throw error;
        }
        toast.success("Meta atualizada");
      } else {
        const { error } = await supabase.from("financial_goals").insert(coerceMutation({
          user_id: userId,
          ...payload,
        }));
        if (error) {
          throw error;
        }
        toast.success("Meta criada");
      }

      setModalOpen(false);
      await fetchGoals();
    } catch {
      toast.error("Nao foi possivel salvar a meta");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase.from("financial_goals").delete().eq("id", deleteId);
      if (error) {
        throw error;
      }
      setGoals((current) => current.filter((goal) => goal.id !== deleteId));
      toast.success("Meta removida");
    } catch {
      toast.error("Erro ao excluir meta");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const handleContribution = async () => {
    if (!contributionGoal || contributionAmount <= 0) {
      return;
    }

    setContributing(true);
    const nextAmount = contributionGoal.current_amount + contributionAmount;
    const nextStatus: GoalStatus = nextAmount >= contributionGoal.target_amount ? "completed" : contributionGoal.status === "paused" ? "paused" : "active";

    try {
      const { error } = await supabase
        .from("financial_goals")
        .update(coerceMutation({ current_amount: nextAmount, status: nextStatus }))
        .eq("id", contributionGoal.id);

      if (error) {
        throw error;
      }

      toast.success("Aporte registrado");
      setContributionGoal(null);
      setContributionAmount(0);
      await fetchGoals();
    } catch {
      toast.error("Erro ao registrar aporte");
    } finally {
      setContributing(false);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={Target}
        iconTone="accent"
        title="Metas"
        description="Transforme objetivos financeiros em planos com prazo, progresso e disciplina."
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova meta
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Valor planejado" value={formatCurrency(totals.target)} icon={Target} variant="accent" loading={loading} />
        <StatCard title="Ja acumulado" value={formatCurrency(totals.current)} icon={Wallet} variant="profit" loading={loading} />
        <StatCard title="Metas ativas" value={String(totals.active)} icon={Target} variant="warning" loading={loading} />
        <StatCard title="Concluidas" value={String(totals.completed)} icon={CheckCircle2} variant="profit" loading={loading} />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { value: "all", label: "Todas" },
          { value: "active", label: "Ativas" },
          { value: "completed", label: "Concluidas" },
          { value: "paused", label: "Pausadas" },
        ].map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter.value as "all" | GoalStatus)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : filteredGoals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta encontrada"
          description={statusFilter === "all" ? "Crie sua primeira meta para acompanhar progresso real." : "Esse filtro ainda nao tem metas cadastradas."}
          actionLabel={statusFilter === "all" ? "+ Nova meta" : undefined}
          onAction={statusFilter === "all" ? openCreate : undefined}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredGoals.map((goal) => {
            const progress = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0;
            const remaining = Math.max(goal.target_amount - goal.current_amount, 0);

            return (
              <Card key={goal.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{goal.name}</CardTitle>
                      <p className="mt-1 text-sm text-text-secondary">{goal.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={goal.status}>{goal.status === "active" ? "Ativa" : goal.status === "completed" ? "Concluida" : "Pausada"}</Badge>
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(goal)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className="hover:bg-expense/10 hover:text-expense" onClick={() => setDeleteId(goal.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/70 bg-background/40 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-text-secondary">Acumulado</p>
                      <p className="mt-1 text-lg font-semibold text-profit">{formatCurrency(goal.current_amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-text-secondary">Faltando</p>
                      <p className="mt-1 text-lg font-semibold text-text-primary">{formatCurrency(remaining)}</p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-text-secondary">Progresso</span>
                      <span className={cn("font-semibold", progress >= 100 ? "text-profit" : progress >= 50 ? "text-warning" : "text-accent")}>
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                    <Progress
                      value={progress}
                      className="h-2"
                      indicatorClassName={progress >= 100 ? "bg-profit" : progress >= 50 ? "bg-warning" : "bg-accent"}
                    />
                    <p className="mt-2 text-sm text-text-secondary">
                      Meta de {formatCurrency(goal.target_amount)}
                      {goal.deadline ? ` ate ${formatDate(goal.deadline)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setContributionGoal(goal);
                        setContributionAmount(0);
                      }}
                    >
                      Adicionar aporte
                    </Button>
                    {goal.status !== "paused" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const { error } = await supabase.from("financial_goals").update(coerceMutation({ status: "paused" })).eq("id", goal.id);
                          if (error) {
                            toast.error("Erro ao pausar meta");
                            return;
                          }
                          toast.success("Meta pausada");
                          await fetchGoals();
                        }}
                      >
                        <PauseCircle className="mr-1 h-4 w-4" />
                        Pausar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const nextStatus: GoalStatus = goal.current_amount >= goal.target_amount ? "completed" : "active";
                          const { error } = await supabase.from("financial_goals").update(coerceMutation({ status: nextStatus })).eq("id", goal.id);
                          if (error) {
                            toast.error("Erro ao retomar meta");
                            return;
                          }
                          toast.success("Meta retomada");
                          await fetchGoals();
                        }}
                      >
                        Retomar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGoal ? "Editar meta" : "Nova meta"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <FormField label="Nome da meta" error={errors.name} required>
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Valor alvo" error={errors.target_amount} required>
                <CurrencyInput value={form.target_amount} onChange={(value) => setForm((current) => ({ ...current, target_amount: value }))} error={errors.target_amount} />
              </FormField>
              <FormField label="Ja guardado" error={errors.current_amount}>
                <CurrencyInput value={form.current_amount} onChange={(value) => setForm((current) => ({ ...current, current_amount: value }))} error={errors.current_amount} />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Categoria" error={errors.category} required>
                <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                  <SelectTrigger error={errors.category}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>

              <FormField label="Prazo">
                <Input type="date" value={form.deadline ?? ""} onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))} />
              </FormField>
            </div>

            <FormField label="Status">
              <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as GoalStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="completed">Concluida</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Observacoes">
              <Textarea rows={3} value={form.notes ?? ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                {editingGoal ? "Salvar" : "Criar meta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={contributionGoal !== null} onOpenChange={(open) => !open && setContributionGoal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar aporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-background/40 p-4">
              <p className="font-semibold text-text-primary">{contributionGoal?.name}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {contributionGoal ? `${formatCurrency(contributionGoal.current_amount)} de ${formatCurrency(contributionGoal.target_amount)}` : ""}
              </p>
            </div>
            <FormField label="Valor do aporte" required>
              <CurrencyInput value={contributionAmount} onChange={setContributionAmount} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContributionGoal(null)} disabled={contributing}>
                Cancelar
              </Button>
              <Button onClick={handleContribution} loading={contributing}>
                Confirmar aporte
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir meta"
        description="Voce perdera o historico de progresso desta meta."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
