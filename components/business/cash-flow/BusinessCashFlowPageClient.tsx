"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CircleDollarSign,
  ReceiptText,
  WalletCards,
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Skeleton } from "@/components/ui/skeleton";

import { useChartColors } from "@/hooks/useChartColors";

import {
  BUSINESS_CASH_FLOW_PERIOD_OPTIONS,
  EMPTY_BUSINESS_CASH_FLOW,
  getBusinessCashFlowCategoryLabel,
  getBusinessCashFlowDateRange,
  type BusinessCashFlowData,
  type BusinessCashFlowPeriod,
} from "@/lib/business-cash-flow";

import { createClient } from "@/lib/supabase/client";

import {
  coerceData,
  coerceMutation,
} from "@/lib/supabase/casts";

import {
  cn,
  formatCurrency,
} from "@/lib/utils";

import type { Database } from "@/types/database";

type WorkspaceRpcResult = {
  workspace_id: string;
};

type CashFlowArgs =
  Database["public"]["Functions"]["get_business_cash_flow"]["Args"];

type TooltipPayload = {
  name?: string;
  value?: number | string;
  color?: string;
};

function CashFlowTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-xl">
      {label && (
        <p className="mb-2 text-xs font-semibold text-text-secondary">
          {label}
        </p>
      )}

      <div className="space-y-1.5">
        {payload.map((item, index) => (
          <div
            key={`${item.name}-${index}`}
            className="flex items-center justify-between gap-5 text-sm"
          >
            <span className="flex items-center gap-2 text-text-secondary">
              <span
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor:
                    item.color ?? "#94A3B8",
                }}
              />

              {item.name}
            </span>

            <span className="font-semibold text-text-primary">
              {formatCurrency(
                Number(item.value ?? 0)
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BusinessCashFlowPageClient() {
  const router = useRouter();
  const chartColors = useChartColors();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);

  const [period, setPeriod] =
    useState<BusinessCashFlowPeriod>("month");

  const [cashFlow, setCashFlow] =
    useState<BusinessCashFlowData>(
      EMPTY_BUSINESS_CASH_FLOW
    );

  const loadCashFlow = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        toast.error(
          "Sessão expirada. Entre novamente."
        );

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
        coerceData<WorkspaceRpcResult>(
          workspaceRes.data
        );

      const range =
        getBusinessCashFlowDateRange(period);

      const args = {
        p_workspace_id: workspace.workspace_id,
        p_start_date: range?.start ?? null,
        p_end_date: range?.end ?? null,
        p_limit: 500,
      } satisfies CashFlowArgs;

      const cashFlowRes = await supabase.rpc(
        "get_business_cash_flow",
        coerceMutation(args)
      );

      if (cashFlowRes.error) {
        throw cashFlowRes.error;
      }

      setCashFlow(
        coerceData<BusinessCashFlowData>(
          cashFlowRes.data
        )
      );
    } catch (error) {
      console.error(
        "Erro ao carregar fluxo de caixa do negócio",
        error
      );

      toast.error(
        "Não foi possível carregar o fluxo de caixa agora."
      );
    } finally {
      setLoading(false);
    }
  }, [period, router, supabase]);

  useEffect(() => {
    void loadCashFlow();
  }, [loadCashFlow]);

  const hasActivity =
    cashFlow.summary.event_count > 0;

  const chartData = useMemo(
    () =>
      cashFlow.daily.map((row) => ({
        ...row,
        label: formatCashFlowDate(row.date),
      })),
    [cashFlow.daily]
  );

  const outflowCategories = useMemo(
    () =>
      cashFlow.categories.filter(
        (row) => row.direction === "OUTFLOW"
      ),
    [cashFlow.categories]
  );

  const maxOutflow = useMemo(
    () =>
      Math.max(
        ...outflowCategories.map(
          (row) => Number(row.amount || 0)
        ),
        0
      ),
    [outflowCategories]
  );

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={WalletCards}
        iconTone="accent"
        title="Fluxo de Caixa"
        description="Acompanhe o dinheiro que realmente entrou e saiu do negócio, separado de lucro, estoque e valores a receber."
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {BUSINESS_CASH_FLOW_PERIOD_OPTIONS.map(
          (option) => (
            <button
              key={option.value}
              type="button"
              onClick={() =>
                setPeriod(option.value)
              }
              className={cn(
                "rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all",
                period === option.value
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border/60 bg-surface/60 text-text-secondary hover:border-border hover:text-text-primary"
              )}
            >
              {option.label}
            </button>
          )
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          title="Saldo anterior"
          value={formatCurrency(
            cashFlow.summary.opening_balance
          )}
          subtitle="Saldo acumulado antes do período"
          icon={Banknote}
          variant={
            cashFlow.summary.opening_balance >= 0
              ? "default"
              : "expense"
          }
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Entradas"
          value={formatCurrency(
            cashFlow.summary.inflows
          )}
          subtitle="Dinheiro que entrou no período"
          icon={ArrowUpCircle}
          variant="profit"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Saídas"
          value={formatCurrency(
            cashFlow.summary.outflows
          )}
          subtitle="Dinheiro que saiu no período"
          icon={ArrowDownCircle}
          variant="expense"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Saldo final"
          value={formatCurrency(
            cashFlow.summary.closing_balance
          )}
          subtitle={`Fluxo líquido: ${formatCurrency(
            cashFlow.summary.net_cash_flow
          )}`}
          icon={CircleDollarSign}
          variant={
            cashFlow.summary.closing_balance >= 0
              ? "profit"
              : "expense"
          }
          size="compact"
          loading={loading}
        />
      </div>

      {!loading && !hasActivity ? (
        <Card>
          <EmptyState
            icon={WalletCards}
            title="Ainda não há movimentações de caixa"
            description="Quando pagamentos de vendas, compras, despesas, taxas ou reembolsos forem registrados, eles aparecerão aqui automaticamente."
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">
                  Evolução do caixa
                </CardTitle>

                <p className="text-sm text-text-secondary">
                  Saldo acumulado ao longo do período selecionado.
                </p>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <Skeleton className="h-[320px] w-full rounded-xl" />
                ) : chartData.length > 0 ? (
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <AreaChart
                        data={chartData}
                        margin={{
                          top: 10,
                          right: 8,
                          left: 0,
                          bottom: 0,
                        }}
                      >
                        <CartesianGrid
                          stroke={chartColors.grid}
                          strokeDasharray="3 3"
                          vertical={false}
                        />

                        <XAxis
                          dataKey="label"
                          stroke={chartColors.axis}
                          tickLine={false}
                          axisLine={false}
                          fontSize={11}
                        />

                        <YAxis
                          stroke={chartColors.axis}
                          tickLine={false}
                          axisLine={false}
                          fontSize={11}
                          width={54}
                          tickFormatter={(value) => {
                            const numeric =
                              Number(value);

                            if (
                              Math.abs(numeric) >=
                              1000
                            ) {
                              return `${(
                                numeric / 1000
                              ).toFixed(1)}k`;
                            }

                            return String(
                              Math.round(numeric)
                            );
                          }}
                        />

                        <Tooltip
                          content={
                            <CashFlowTooltip />
                          }
                        />

                        <Area
                          type="monotone"
                          dataKey="balance"
                          name="Saldo"
                          stroke={
                            cashFlow.summary
                              .closing_balance >= 0
                              ? chartColors.profit
                              : chartColors.expense
                          }
                          fill={
                            cashFlow.summary
                              .closing_balance >= 0
                              ? chartColors.profit
                              : chartColors.expense
                          }
                          fillOpacity={0.09}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[320px] items-center justify-center text-sm text-text-secondary">
                    Sem movimentações no período.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Saídas por categoria
                </CardTitle>

                <p className="text-sm text-text-secondary">
                  Veja para onde o dinheiro do negócio está indo.
                </p>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                    <Skeleton className="h-16 rounded-xl" />
                  </div>
                ) : outflowCategories.length > 0 ? (
                  <div className="space-y-3">
                    {outflowCategories.map(
                      (row) => {
                        const amount =
                          Number(row.amount || 0);

                        const width =
                          maxOutflow > 0
                            ? Math.max(
                                (amount /
                                  maxOutflow) *
                                  100,
                                3
                              )
                            : 0;

                        return (
                          <div
                            key={`${row.category}-${row.direction}`}
                            className="rounded-xl border border-border/60 bg-background/30 p-3"
                          >
                            <div className="mb-2 flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <ReceiptText className="h-4 w-4 shrink-0 text-expense" />

                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-text-primary">
                                    {getBusinessCashFlowCategoryLabel(
                                      row.category
                                    )}
                                  </p>

                                  <p className="text-xs text-text-secondary">
                                    {row.events} movimentação
                                    {row.events === 1
                                      ? ""
                                      : "ões"}
                                  </p>
                                </div>
                              </div>

                              <span className="shrink-0 text-sm font-semibold text-expense">
                                {formatCurrency(
                                  amount
                                )}
                              </span>
                            </div>

                            <div className="h-1.5 overflow-hidden rounded-full bg-border/40">
                              <div
                                className="h-full rounded-full bg-expense transition-all"
                                style={{
                                  width: `${width}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <div className="flex min-h-[220px] items-center justify-center text-center text-sm text-text-secondary">
                    Nenhuma saída registrada neste período.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Movimentações do caixa
              </CardTitle>

              <p className="text-sm text-text-secondary">
                {loading
                  ? "Carregando movimentações..."
                  : `${cashFlow.summary.event_count} movimentação${
                      cashFlow.summary.event_count === 1
                        ? ""
                        : "ões"
                    } no período selecionado.`}
              </p>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              ) : cashFlow.transactions.length > 0 ? (
                <div className="divide-y divide-border/60">
                  {cashFlow.transactions.map(
                    (transaction) => {
                      const isInflow =
                        transaction.direction ===
                        "INFLOW";

                      return (
                        <div
                          key={transaction.id}
                          className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"
                        >
                          <div
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                              isInflow
                                ? "bg-profit/10 text-profit"
                                : "bg-expense/10 text-expense"
                            )}
                          >
                            {isInflow ? (
                              <ArrowUpCircle className="h-5 w-5" />
                            ) : (
                              <ArrowDownCircle className="h-5 w-5" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-text-primary">
                                  {transaction.title}
                                </p>

                                <p className="mt-0.5 text-xs text-text-secondary">
                                  {getBusinessCashFlowCategoryLabel(
                                    transaction.category
                                  )}
                                  {" • "}
                                  {formatCashFlowDate(
                                    transaction.date
                                  )}
                                  {transaction.payment_method
                                    ? ` • ${transaction.payment_method}`
                                    : ""}
                                </p>
                              </div>

                              <span
                                className={cn(
                                  "shrink-0 text-sm font-bold",
                                  isInflow
                                    ? "text-profit"
                                    : "text-expense"
                                )}
                              >
                                {isInflow ? "+" : "-"}
                                {formatCurrency(
                                  transaction.amount
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center text-center text-sm text-text-secondary">
                  Nenhuma movimentação encontrada neste período.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function formatCashFlowDate(value: string): string {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}
