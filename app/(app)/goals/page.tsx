"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Target, Plus, Pencil, Trash2, Wallet, PauseCircle, CheckCircle2, Lightbulb, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { GOAL_CATEGORIES } from "@/lib/finance";
import { calculateGoalMetrics, calculateMonthlySuggestion, summarizeGoals } from "@/lib/goals";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { goalSchema, type GoalFormData } from "@/lib/validations";
import type { FinancialGoal, InvestmentWallet } from "@/types/database";
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
import { GlobalContributionButton } from "@/components/wallet/WalletContributionProvider";

type GoalStatus = FinancialGoal["status"];

interface GoalEditorState extends GoalFormData {
  status: Exclude<GoalStatus, "completed">;
}

const EMPTY_GOAL_FORM: GoalEditorState = {
  name: "",
  target_amount: 0,
  deadline: "",
  category: "",
  notes: "",
  status: "active",
};

function getGoalStatusLabel(status: GoalStatus) {
  if (status === "completed") {
    return "Concluida";
  }

  return status === "paused" ? "Pausada" : "Ativa";
}

export default function GoalsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [wallet, setWallet] = useState<InvestmentWallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<GoalEditorState>(EMPTY_GOAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof GoalEditorState, string>>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | GoalStatus>("all");

  const walletBalance = wallet?.total_balance ?? 0;

  const fetchGoals = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setLoading(true);

    const [walletResponse, goalsResponse] = await Promise.all([
      supabase.from("investment_wallets").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("financial_goals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (walletResponse.error) {
      toast.error("Erro ao carregar patrimonio");
      setLoading(false);
      return;
    }

    if (goalsResponse.error) {
      toast.error("Erro ao carregar metas");
      setLoading(false);
      return;
    }

    setWallet(walletResponse.data ?? null);
    setGoals(goalsResponse.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  useEffect(() => {
    window.addEventListener("wallet:changed", fetchGoals);
    return () => window.removeEventListener("wallet:changed", fetchGoals);
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
      deadline: goal.deadline ?? "",
      category: goal.category,
      notes: goal.notes ?? "",
      status: goal.status === "paused" ? "paused" : "active",
    });
    setModalOpen(true);
  };

  const filteredGoals = useMemo(() => {
    if (statusFilter === "all") {
      return goals;
    }

    return goals.filter((goal) => calculateGoalMetrics(goal, walletBalance).status === statusFilter);
  }, [goals, statusFilter, walletBalance]);

  const totals = useMemo(() => summarizeGoals(goals, walletBalance), [goals, walletBalance]);

  const validateForm = () => {
    setErrors({});
    const parsed = goalSchema.safeParse({
      name: form.name,
      target_amount: form.target_amount,
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

    try {
      const status: GoalStatus = walletBalance >= parsed.target_amount ? "completed" : form.status;
      const payload = {
        name: parsed.name,
        target_amount: parsed.target_amount,
        deadline: parsed.deadline || null,
        category: parsed.category,
        notes: parsed.notes || null,
        status,
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

  const updateGoalStatus = async (goal: FinancialGoal, nextStatus: Exclude<GoalStatus, "completed">) => {
    const resolvedStatus: GoalStatus = walletBalance >= goal.target_amount ? "completed" : nextStatus;
    const { error } = await supabase.from("financial_goals").update(coerceMutation({ status: resolvedStatus })).eq("id", goal.id);

    if (error) {
      toast.error(nextStatus === "paused" ? "Erro ao pausar meta" : "Erro ao retomar meta");
      return;
    }

    toast.success(nextStatus === "paused" ? "Meta pausada" : "Meta retomada");
    await fetchGoals();
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={Target}
        iconTone="accent"
        title="Metas"
        description="Metas acompanham o mesmo patrimonio global. Aportes e retiradas acontecem na carteira, sem saldo duplicado por objetivo."
        actions={
          <div className="flex flex-wrap gap-2">
            <GlobalContributionButton />
            <Button onClick={openCreate} variant="secondary" className="gap-2">
              <Plus className="h-4 w-4" />
              Nova meta
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Valor planejado" value={formatCurrency(totals.target)} icon={Target} variant="accent" loading={loading} />
        <StatCard title="Ja acumulado" value={formatCurrency(totals.walletBalance)} icon={Wallet} variant="profit" loading={loading} subtitle="Patrimonio unico" />
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
            const metrics = calculateGoalMetrics(goal, walletBalance);
            const monthlySuggestion = calculateMonthlySuggestion(goal, walletBalance);

            return (
              <Card key={goal.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{goal.name}</CardTitle>
                      <p className="mt-1 text-sm text-text-secondary">{goal.category}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={metrics.status}>{getGoalStatusLabel(metrics.status)}</Badge>
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(goal)} aria-label="Editar meta">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" className="hover:bg-expense/10 hover:text-expense" onClick={() => setDeleteId(goal.id)} aria-label="Excluir meta">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border/70 bg-background/40 p-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-text-secondary">Acumulado</p>
                      <p className="mt-1 text-lg font-semibold text-profit">{formatCurrency(metrics.walletBalance)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-text-secondary">Faltando</p>
                      <p className="mt-1 text-lg font-semibold text-text-primary">{formatCurrency(metrics.remainingAmount)}</p>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-text-secondary">Progresso</span>
                      <span className={cn("font-semibold", metrics.progress >= 100 ? "text-profit" : metrics.progress >= 50 ? "text-warning" : "text-accent")}>
                        {metrics.displayProgress}%
                      </span>
                    </div>
                    <Progress
                      value={metrics.progress}
                      className="h-2"
                      indicatorClassName={metrics.progress >= 100 ? "bg-profit" : metrics.progress >= 50 ? "bg-warning" : "bg-accent"}
                    />
                    <p className="mt-2 text-sm text-text-secondary">
                      Meta de {formatCurrency(goal.target_amount)}
                      {goal.deadline ? ` ate ${formatDate(goal.deadline)}` : ""}
                    </p>

                    {monthlySuggestion.status !== "no_deadline" && (
                      <div className="mt-3 rounded-xl border border-border/70 bg-background/30 p-3">
                        {monthlySuggestion.status === "completed" ? (
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-profit/15 p-2 text-profit">
                              <CheckCircle2 className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Meta concluida</p>
                              <p className="mt-1 text-sm font-semibold text-profit">Meta batida pelo patrimonio global</p>
                            </div>
                          </div>
                        ) : monthlySuggestion.status === "expired" ? (
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-expense/15 p-2 text-expense">
                              <AlertTriangle className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">Prazo encerrado</p>
                              <p className="mt-1 text-sm font-semibold text-expense">Revise o prazo ou aumente seus aportes globais.</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-warning/15 p-2 text-warning">
                              <Lightbulb className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                                {monthlySuggestion.status === "immediate" ? "Sugestao imediata" : "Para atingir sua meta"}
                              </p>
                              <p className="mt-1 text-lg font-semibold text-warning">
                                {formatCurrency(monthlySuggestion.monthlyValue)}
                                {monthlySuggestion.status === "immediate" ? " este mes" : " por mes"}
                              </p>
                              {monthlySuggestion.status === "monthly" && (
                                <p className="mt-1 text-sm text-text-secondary">
                                  Considere guardar esse valor por {monthlySuggestion.monthsLeft} {monthlySuggestion.monthsLeft === 1 ? "mes" : "meses"} restantes.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {metrics.status !== "completed" && (
                    <div className="flex flex-wrap gap-2">
                      {metrics.status !== "paused" ? (
                        <Button size="sm" variant="outline" onClick={() => updateGoalStatus(goal, "paused")}>
                          <PauseCircle className="mr-1 h-4 w-4" />
                          Pausar
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => updateGoalStatus(goal, "active")}>
                          Retomar
                        </Button>
                      )}
                    </div>
                  )}
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
              <FormField label="Prazo">
                <Input type="date" value={form.deadline ?? ""} onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))} />
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

              <FormField label="Estado manual">
                <Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as GoalEditorState["status"] }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

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

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir meta"
        description="A meta sera removida, mas o patrimonio global continua intacto."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
}
