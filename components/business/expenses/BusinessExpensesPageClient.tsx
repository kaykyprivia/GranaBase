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
  Pencil,
  Plus,
  Trash2,
  ReceiptText,
  TrendingDown,
} from "lucide-react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { PageIntro } from "@/components/shared/PageIntro";
import { SearchFilterBar } from "@/components/shared/SearchFilterBar";
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
  getBusinessExpenseDateRange,
  hasBusinessExpenseErrors,
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
type UpdateExpenseArgs =
  Database["public"]["Functions"]["update_business_expense"]["Args"];
type DeleteExpenseArgs =
  Database["public"]["Functions"]["delete_business_expense"]["Args"];
type ExpensesPageArgs =
  Database["public"]["Functions"]["get_business_expenses_page"]["Args"];

type ExpensesPageRpcResult = {
  rows: BusinessExpense[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: {
    count: number;
    total: number;
    average: number;
    top_category: BusinessExpenseCategory | null;
    top_category_amount: number;
  };
};

const EXPENSE_PAGE_SIZE = 25;

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
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [workspaceId, setWorkspaceId] = useState("");

  const [expenses, setExpenses] = useState<
    BusinessExpense[]
  >([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total_count: 0,
    page: 1,
    page_size: EXPENSE_PAGE_SIZE,
    total_pages: 0,
  });
  const [summary, setSummary] = useState({
    count: 0,
    total: 0,
    average: 0,
    topCategory: null as BusinessExpenseCategory | null,
    topCategoryAmount: 0,
  });
  const [categoryFilter, setCategoryFilter] = useState<
    BusinessExpenseCategory | "all"
  >("all");

  const [periodFilter, setPeriodFilter] =
    useState<BusinessExpensePeriod>("month");

  const [formOpen, setFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] =
    useState<BusinessExpense | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<BusinessExpense | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [draft, setDraft] =
    useState<BusinessExpenseDraft>(createEmptyDraft);

  const [errors, setErrors] =
    useState<BusinessExpenseErrors>({});

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, periodFilter]);

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

      const range =
        getBusinessExpenseDateRange(periodFilter);

      const args = {
        p_workspace_id: workspace.workspace_id,
        p_page: page,
        p_page_size: EXPENSE_PAGE_SIZE,
        p_category: categoryFilter,
        p_start_date: range?.start ?? null,
        p_end_date: range?.end ?? null,
        p_search: debouncedSearch || null,
      } satisfies ExpensesPageArgs;

      const expensesRes = await supabase.rpc(
        "get_business_expenses_page",
        coerceMutation(args)
      );

      if (expensesRes.error) {
        throw expensesRes.error;
      }

      const result =
        coerceData<ExpensesPageRpcResult>(
          expensesRes.data
        );

      setPagination({
        total_count: Number(result.total_count ?? 0),
        page: Number(result.page ?? 1),
        page_size: Number(
          result.page_size ?? EXPENSE_PAGE_SIZE
        ),
        total_pages: Number(result.total_pages ?? 0),
      });

      setSummary({
        count: Number(result.summary?.count ?? 0),
        total: Number(result.summary?.total ?? 0),
        average: Number(result.summary?.average ?? 0),
        topCategory:
          result.summary?.top_category ?? null,
        topCategoryAmount: Number(
          result.summary?.top_category_amount ?? 0
        ),
      });

      if (
        result.total_pages > 0 &&
        page > result.total_pages
      ) {
        setPage(result.total_pages);
        return;
      }

      if (
        result.total_pages === 0 &&
        page !== 1
      ) {
        setPage(1);
        return;
      }

      setExpenses(result.rows ?? []);
    } catch (error) {
      console.error(
        "Erro ao carregar despesas",
        error
      );
      toast.error(
        "Não foi possível carregar as despesas agora."
      );
    } finally {
      setLoading(false);
    }
  }, [
    categoryFilter,
    debouncedSearch,
    page,
    periodFilter,
    router,
    supabase,
  ]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);



  function openCreateExpense() {
    setEditingExpense(null);
    setDraft(createEmptyDraft());
    setErrors({});
    setFormOpen(true);
  }

  function openEditExpense(expense: BusinessExpense) {
    setEditingExpense(expense);
    setDraft({
      description: expense.description,
      category: expense.category,
      amount: Number(expense.amount),
      spentAt: expense.spent_at,
      notes: expense.notes ?? "",
    });
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
      if (editingExpense) {
        const args = {
          p_workspace_id: workspaceId,
          p_expense_id: editingExpense.id,
          p_description: draft.description.trim(),
          p_category: draft.category,
          p_amount: draft.amount,
          p_idempotency_key:
            makeBusinessIdempotencyKey(
              "business-expense-update"
            ),
          p_spent_at: draft.spentAt,
          p_notes: draft.notes.trim() || null,
        } satisfies UpdateExpenseArgs;

        const { error } = await supabase.rpc(
          "update_business_expense",
          coerceMutation(args)
        );

        if (error) {
          throw error;
        }

        toast.success("Despesa atualizada.");
      } else {
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
      }

      setFormOpen(false);
      setEditingExpense(null);
      setDraft(createEmptyDraft());
      setErrors({});

      await loadExpenses();
    } catch (error) {
      console.error(
        editingExpense
          ? "Erro ao atualizar despesa"
          : "Erro ao registrar despesa",
        error
      );

      toast.error(
        editingExpense
          ? "Não foi possível atualizar a despesa."
          : "Não foi possível registrar a despesa."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense() {
    if (!deleteTarget || !workspaceId) {
      return;
    }

    setDeleting(true);

    try {
      const args = {
        p_workspace_id: workspaceId,
        p_expense_id: deleteTarget.id,
        p_idempotency_key:
          makeBusinessIdempotencyKey(
            "business-expense-delete"
          ),
      } satisfies DeleteExpenseArgs;

      const { error } = await supabase.rpc(
        "delete_business_expense",
        coerceMutation(args)
      );

      if (error) {
        throw error;
      }

      toast.success("Despesa excluída.");
      setDeleteTarget(null);

      await loadExpenses();
    } catch (error) {
      console.error(
        "Erro ao excluir despesa",
        error
      );

      toast.error(
        "Não foi possível excluir a despesa."
      );
    } finally {
      setDeleting(false);
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

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar despesa, categoria ou observação..."
        activeFilterCount={
          (periodFilter !== "month" ? 1 : 0) +
          (categoryFilter !== "all" ? 1 : 0)
        }
        onClearFilters={() => {
          setPeriodFilter("month");
          setCategoryFilter("all");
        }}
      >
        <Select
          value={periodFilter}
          onValueChange={(value) =>
            setPeriodFilter(
              value as BusinessExpensePeriod
            )
          }
        >
          <SelectTrigger
            className="w-full"
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
            className="w-full"
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
      </SearchFilterBar>

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
      ) : expenses.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-surface">
          <EmptyState
            icon={ReceiptText}
            title={
              debouncedSearch ||
              categoryFilter !== "all"
                ? "Nenhuma despesa encontrada"
                : periodFilter !== "all"
                  ? "Nenhuma despesa no período"
                  : "Nenhuma despesa registrada"
            }
            description={
              debouncedSearch ||
              categoryFilter !== "all"
                ? "Altere os filtros ou a busca para encontrar outros lançamentos."
                : periodFilter !== "all"
                  ? "Não há despesas registradas no período selecionado."
                  : "Registre custos como combustível, embalagens, anúncios, entregas, manutenção e taxas."
            }
            actionLabel="Registrar despesa"
            onAction={openCreateExpense}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {expenses.map((expense) => (
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

                <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                  <p className="text-lg font-bold text-expense">
                    -{" "}
                    {formatCurrency(
                      Number(expense.amount)
                    )}
                  </p>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-text-secondary hover:text-text-primary"
                      title="Editar despesa"
                      aria-label={`Editar ${expense.description}`}
                      onClick={() =>
                        openEditExpense(expense)
                      }
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-text-secondary hover:bg-expense/10 hover:text-expense"
                      title="Excluir despesa"
                      aria-label={`Excluir ${expense.description}`}
                      onClick={() =>
                        setDeleteTarget(expense)
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}


      {pagination.total_pages > 1 && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border/60 bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">
            {Math.min(
              (pagination.page - 1) *
                pagination.page_size +
                1,
              pagination.total_count
            )}{" "}
            -{" "}
            {Math.min(
              pagination.page *
                pagination.page_size,
              pagination.total_count
            )}{" "}
            de {pagination.total_count}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) =>
                  Math.max(current - 1, 1)
                )
              }
            >
              Anterior
            </Button>

            <span className="px-2 text-sm text-text-secondary">
              Página {pagination.page} de{" "}
              {pagination.total_pages}
            </span>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={
                page >= pagination.total_pages
              }
              onClick={() =>
                setPage((current) =>
                  Math.min(
                    current + 1,
                    pagination.total_pages
                  )
                )
              }
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (saving) {
            return;
          }

          setFormOpen(open);

          if (!open) {
            setEditingExpense(null);
            setDraft(createEmptyDraft());
            setErrors({});
          }
        }}
      >

      <DialogContent className="max-w-lg">

      <DialogHeader>

      <DialogTitle>
              {editingExpense
                ? "Editar despesa"
                : "Nova despesa"}
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
              error={errors.notes}
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
              onClick={() => {
                setFormOpen(false);
                setEditingExpense(null);
                setDraft(createEmptyDraft());
                setErrors({});
              }}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              loading={saving}
              onClick={saveExpense}
            >
              {editingExpense
                ? "Salvar alterações"
                : "Registrar despesa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteTarget(null);
          }
        }}
        title="Excluir despesa?"
        description={
          deleteTarget
            ? `A despesa "${deleteTarget.description}" será excluída definitivamente. Os totais e relatórios do negócio serão atualizados automaticamente.`
            : "Esta despesa será excluída definitivamente."
        }
        confirmLabel="Excluir despesa"
        loading={deleting}
        variant="destructive"
        onConfirm={deleteExpense}
      />
    </div>
  );
}
