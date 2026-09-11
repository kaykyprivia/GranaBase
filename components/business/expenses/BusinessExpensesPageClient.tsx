"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Plus,
  ReceiptText,
  Search,
  TrendingDown,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";

import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  BUSINESS_EXPENSE_CATEGORIES,
  BUSINESS_EXPENSE_CATEGORY_META,
  BUSINESS_EXPENSE_PERIOD_OPTIONS,
  filterBusinessExpenses,
  hasBusinessExpenseErrors,
  summarizeBusinessExpenses,
  validateBusinessExpenseDraft,
  type BusinessExpenseDraft,
  type BusinessExpenseErrors,
  type BusinessExpensePeriod,
} from "@/lib/business-expenses";

import { makeBusinessIdempotencyKey } from "@/lib/business-purchases";

import { createClient } from "@/lib/supabase/client";

import {
  coerceData,
  coerceMutation,
} from "@/lib/supabase/casts";

import {
  formatCurrency,
  formatDate,
  toLocalDateString,
} from "@/lib/utils";

import type {
  BusinessExpense,
  BusinessExpenseCategory,
  Database,
} from "@/types/database";

type WorkspaceRpcResult = {
  workspace_id: string;
};

type RecordExpenseArgs =
  Database["public"]["Functions"]["record_business_expense"]["Args"];

function createEmptyDraft(): BusinessExpenseDraft {
  return {
    description: "",
    category: "outras",
    amount: 0,
    spentAt: toLocalDateString(),
    notes: "",
  };
}

export function BusinessExpensesPageClient() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [workspaceId, setWorkspaceId] = useState("");

  const [expenses, setExpenses] = useState<
    BusinessExpense[]
  >([]);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<
    BusinessExpenseCategory | "all"
  >("all");

  const [periodFilter, setPeriodFilter] =
    useState<BusinessExpensePeriod>("month");

  const [formOpen, setFormOpen] = useState(false);

  const [draft, setDraft] =
    useState<BusinessExpenseDraft>(createEmptyDraft);

  const [errors, setErrors] =
    useState<BusinessExpenseErrors>({});

  const loadExpenses = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        toast.error("Sessão expirada. Entre novamente.");
        router.push("/login");
        return;
      }

      const workspaceRes = await supabase.rpc(
        "get_or_create_business_workspace",
        coerceMutation({
          p_name: "Meu Negocio",
        })
      );

      if (workspaceRes.error) {
        throw workspaceRes.error;
      }

      const workspace =
        coerceData<WorkspaceRpcResult>(workspaceRes.data);

      setWorkspaceId(workspace.workspace_id);

      const expensesRes = await supabase
        .from("business_expenses")
        .select("*")
        .eq("workspace_id", workspace.workspace_id)
        .order("spent_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1000);

      if (expensesRes.error) {
        throw expensesRes.error;
      }

      setExpenses(
        coerceData<BusinessExpense[]>(
          expensesRes.data ?? []
        )
      );
    } catch (error) {
      console.error("Erro ao carregar despesas", error);
      toast.error(
        "Não foi possível carregar as despesas agora."
      );
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const filteredExpenses = useMemo(
    () =>
      filterBusinessExpenses(expenses, {
        search,
        category: categoryFilter,
        period: periodFilter,
      }),
    [
      categoryFilter,
      expenses,
      periodFilter,
      search,
    ]
  );

  const summary = useMemo(
    () => summarizeBusinessExpenses(filteredExpenses),
    [filteredExpenses]
  );

  function openCreateExpense() {
    setDraft(createEmptyDraft());
    setErrors({});
    setFormOpen(true);
  }

  function updateDraft<
    K extends keyof BusinessExpenseDraft
  >(
    key: K,
    value: BusinessExpenseDraft[K]
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));

    setErrors((current) => ({
      ...current,
      [key]: undefined,
    }));
  }

  async function saveExpense() {
    const nextErrors =
      validateBusinessExpenseDraft(draft);

    setErrors(nextErrors);

    if (hasBusinessExpenseErrors(nextErrors)) {
      return;
    }

    if (!workspaceId) {
      toast.error(
        "O ambiente do negócio ainda não está pronto."
      );
      return;
    }

    setSaving(true);

    try {
      const args = {
        p_workspace_id: workspaceId,
        p_description: draft.description.trim(),
        p_category: draft.category,
        p_amount: draft.amount,
        p_idempotency_key:
          makeBusinessIdempotencyKey(
            "business-expense"
          ),
        p_spent_at: draft.spentAt,
        p_notes: draft.notes.trim() || null,
      } satisfies RecordExpenseArgs;

      const { error } = await supabase.rpc(
        "record_business_expense",
        coerceMutation(args)
      );

      if (error) {
        throw error;
      }

      toast.success("Despesa registrada.");

      setFormOpen(false);
      setDraft(createEmptyDraft());
      setErrors({});

      await loadExpenses();
    } catch (error) {
      console.error(
        "Erro ao registrar despesa",
        error
      );

      toast.error(
        "Não foi possível registrar a despesa."
      );
    } finally {
      setSaving(false);
    }
  }

  const topCategoryLabel = summary.topCategory
    ? BUSINESS_EXPENSE_CATEGORY_META[
        summary.topCategory
      ].label
    : "Nenhuma";

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={ReceiptText}
        iconTone="accent"
        title="Despesas"
        description="Controle os custos operacionais do negócio sem misturar com seus gastos pessoais."
        actions={
          <Button
            type="button"
            size="sm"
            className="min-h-10 gap-1.5"
            onClick={openCreateExpense}
          >
            <Plus className="h-4 w-4" />
            Nova despesa
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          title="Total no período"
          value={formatCurrency(summary.total)}
          subtitle={`${summary.count} lançamento${
            summary.count === 1 ? "" : "s"
          }`}
          icon={TrendingDown}
          variant="expense"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Despesas"
          value={String(summary.count)}
          subtitle="Lançamentos filtrados"
          icon={ReceiptText}
          variant="default"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Média por despesa"
          value={formatCurrency(summary.average)}
          icon={CircleDollarSign}
          variant="warning"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Maior categoria"
          value={topCategoryLabel}
          subtitle={
            summary.topCategory
              ? formatCurrency(
                  summary.topCategoryAmount
                )
              : "Sem despesas no período"
          }
          icon={BarChart3}
          variant="accent"
          size="compact"
          loading={loading}
        />
      </div>

      <div className="mb-5 space-y-3">
        <Input
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Buscar despesa, categoria ou observação..."
          leftIcon={<Search className="h-4 w-4" />}
          className="min-h-11"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            value={periodFilter}
            onValueChange={(value) =>
              setPeriodFilter(
                value as BusinessExpensePeriod
              )
            }
          >
            <SelectTrigger
              className="min-h-11"
              aria-label="Período das despesas"
            >
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {BUSINESS_EXPENSE_PERIOD_OPTIONS.map(
                (option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(value) =>
              setCategoryFilter(
                value as
                  | BusinessExpenseCategory
                  | "all"
              )
            }
          >
            <SelectTrigger
              className="min-h-11"
              aria-label="Categoria das despesas"
            >
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">
                Todas as categorias
              </SelectItem>

              {BUSINESS_EXPENSE_CATEGORIES.map(
                (category) => (
                  <SelectItem
                    key={category}
                    value={category}
                  >
                    {
                      BUSINESS_EXPENSE_CATEGORY_META[
                        category
                      ].label
                    }
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map(
            (_, index) => (
              <Skeleton
                key={index}
                className="h-24 rounded-xl"
              />
            )
          )}
        </div>
      ) : filteredExpenses.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-surface">
          <EmptyState
            icon={ReceiptText}
            title={
              expenses.length === 0
                ? "Nenhuma despesa registrada"
                : "Nenhuma despesa encontrada"
            }
            description={
              expenses.length === 0
                ? "Registre custos como combustível, embalagens, anúncios, entregas, manutenção e taxas."
                : "Altere os filtros ou a busca para encontrar outros lançamentos."
            }
            actionLabel={
              expenses.length === 0
                ? "Registrar despesa"
                : undefined
            }
            onAction={
              expenses.length === 0
                ? openCreateExpense
                : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredExpenses.map((expense) => (
            <div
              key={expense.id}
              className="rounded-xl border border-border/60 bg-surface p-4 shadow-card"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-expense/10">
                    <ReceiptText className="h-5 w-5 text-expense" />
                  </div>

                  <div className="min-w-0">
                    <p className="font-semibold text-text-primary">
                      {expense.description}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <span className="rounded-full bg-border/50 px-2 py-1 font-medium">
                        {
                          BUSINESS_EXPENSE_CATEGORY_META[
                            expense.category
                          ].label
                        }
                      </span>

                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatDate(expense.spent_at)}
                      </span>
                    </div>

                    {expense.notes && (
                      <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
                        {expense.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="shrink-0 sm:text-right">
                  <p className="text-lg font-bold text-expense">
                    -{" "}
                    {formatCurrency(
                      Number(expense.amount)
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setFormOpen(open);

            if (!open) {
              setDraft(createEmptyDraft());
              setErrors({});
            }
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Nova despesa
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <FormField
              label="Descrição"
              required
              error={errors.description}
            >
              <Input
                value={draft.description}
                error={errors.description}
                placeholder="Ex: Gasolina para entregas"
                onChange={(event) =>
                  updateDraft(
                    "description",
                    event.target.value
                  )
                }
              />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>
                  Categoria
                </Label>

                <Select
                  value={draft.category}
                  onValueChange={(value) =>
                    updateDraft(
                      "category",
                      value as BusinessExpenseCategory
                    )
                  }
                >
                  <SelectTrigger aria-label="Categoria da despesa">
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    {BUSINESS_EXPENSE_CATEGORIES.map(
                      (category) => (
                        <SelectItem
                          key={category}
                          value={category}
                        >
                          {
                            BUSINESS_EXPENSE_CATEGORY_META[
                              category
                            ].label
                          }
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              <FormField
                label="Data"
                required
                error={errors.spentAt}
              >
                <Input
                  type="date"
                  value={draft.spentAt}
                  max={toLocalDateString()}
                  error={errors.spentAt}
                  onChange={(event) =>
                    updateDraft(
                      "spentAt",
                      event.target.value
                    )
                  }
                />
              </FormField>
            </div>

            <FormField
              label="Valor"
              required
              error={errors.amount}
            >
              <CurrencyInput
                value={draft.amount}
                error={errors.amount}
                onChange={(value) =>
                  updateDraft("amount", value)
                }
              />
            </FormField>

            <FormField
              label="Observações"
              hint="Opcional"
            >
              <Textarea
                rows={4}
                value={draft.notes}
                placeholder="Detalhes úteis sobre esta despesa..."
                onChange={(event) =>
                  updateDraft(
                    "notes",
                    event.target.value
                  )
                }
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() =>
                setFormOpen(false)
              }
            >
              Cancelar
            </Button>

            <Button
              type="button"
              loading={saving}
              onClick={saveExpense}
            >
              Registrar despesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}