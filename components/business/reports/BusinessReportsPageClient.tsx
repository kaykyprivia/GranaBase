"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BarChart3,
  Banknote,
  CircleDollarSign,
  Percent,
  ReceiptText,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
  BUSINESS_REPORT_PERIOD_OPTIONS,
  type BusinessReportsAnalytics,
  type BusinessReportsPeriod,
} from "@/lib/business-reports";

import { createClient } from "@/lib/supabase/client";

import {
  coerceData,
  coerceMutation,
} from "@/lib/supabase/casts";

import {
  cn,
  formatCurrency,
  toLocalDateString,
} from "@/lib/utils";

import type { Database } from "@/types/database";

type WorkspaceRpcResult = {
  workspace_id: string;
};
type ReportsArgs =
  Database["public"]["Functions"]["get_business_reports_analytics"]["Args"];

const EMPTY_ANALYTICS: BusinessReportsAnalytics = {
  summary: {
    revenue: 0,
    saleProfit: 0,
    expenses: 0,
    result: 0,
    margin: 0,
    salesCount: 0,
    ticket: 0,
    received: 0,
    receivable: 0,
  },
  series: [],
  expensesByCategory: [],
  topByRevenue: [],
  topByProfit: [],
};

const PIE_COLORS = [
  "#38BDF8",
  "#22C55E",
  "#FACC15",
  "#EF4444",
  "#A78BFA",
  "#F97316",
  "#EC4899",
];

type TooltipPayload = {
  name?: string;
  value?: number | string;
  color?: string;
};

function ReportTooltip({
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
              {formatCurrency(Number(item.value ?? 0))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BusinessReportsPageClient() {
  const router = useRouter();
  const chartColors = useChartColors();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);

  const [period, setPeriod] =
    useState<BusinessReportsPeriod>("month");

  const [analytics, setAnalytics] = useState<BusinessReportsAnalytics>(EMPTY_ANALYTICS);

  const loadReports = useCallback(async () => {
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

      const args = {
        p_workspace_id: workspace.workspace_id,
        p_period: period,
        p_today: toLocalDateString(),
      } satisfies ReportsArgs;

      const reportsRes = await supabase.rpc(
        "get_business_reports_analytics",
        coerceMutation(args)
      );

      if (reportsRes.error) {
        throw reportsRes.error;
      }

      setAnalytics(
        coerceData<BusinessReportsAnalytics>(
          reportsRes.data
        )
      );
    } catch (error) {
      console.error(
        "Erro ao carregar relatórios do negócio",
        error
      );

      toast.error(
        "Não foi possível carregar os relatórios agora."
      );
    } finally {
      setLoading(false);
    }
  }, [period, router, supabase]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);


  const hasActivity =
    analytics.summary.salesCount > 0 ||
    analytics.summary.expenses > 0 ||
    analytics.summary.received !== 0 ||
    analytics.summary.receivable > 0;

  const hasPerformanceData =
    analytics.series.some(
      (row) =>
        row.revenue !== 0 ||
        row.profit !== 0 ||
        row.expenses !== 0
    );

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={BarChart3}
        iconTone="accent"
        title="Relatórios"
        description="Veja o desempenho real do negócio: faturamento, lucro, despesas, resultado, recebimentos e produtos."
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {BUSINESS_REPORT_PERIOD_OPTIONS.map(
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

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatCard
          title="Faturamento realizado"
          value={formatCurrency(
            analytics.summary.revenue
          )}
          subtitle={`${analytics.summary.salesCount} venda${
            analytics.summary.salesCount === 1
              ? ""
              : "s"
          } concluída${
            analytics.summary.salesCount === 1
              ? ""
              : "s"
          }`}
          icon={TrendingUp}
          variant="profit"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Lucro das vendas"
          value={formatCurrency(
            analytics.summary.saleProfit
          )}
          subtitle="Após CMV e custos da venda"
          icon={CircleDollarSign}
          variant="profit"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Despesas operacionais"
          value={formatCurrency(
            analytics.summary.expenses
          )}
          subtitle="Custos lançados em Despesas"
          icon={TrendingDown}
          variant="expense"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Resultado do negócio"
          value={formatCurrency(
            analytics.summary.result
          )}
          subtitle="Lucro das vendas menos despesas"
          icon={WalletCards}
          variant={
            analytics.summary.result >= 0
              ? "profit"
              : "expense"
          }
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Margem líquida"
          value={`${analytics.summary.margin.toFixed(
            1
          )}%`}
          subtitle="Resultado sobre faturamento"
          icon={Percent}
          variant={
            analytics.summary.margin >= 0
              ? "accent"
              : "expense"
          }
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Ticket médio"
          value={formatCurrency(
            analytics.summary.ticket
          )}
          subtitle="Por venda realizada"
          icon={ShoppingBag}
          variant="default"
          size="compact"
          loading={loading}
        />
      </div>

      {!loading && !hasActivity ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Ainda não há dados para analisar"
            description="Conforme vendas, pagamentos e despesas forem registrados, os indicadores do negócio aparecerão aqui automaticamente."
          />
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="text-base">
                  Evolução do negócio
                </CardTitle>

                <p className="text-sm text-text-secondary">
                  Faturamento, lucro das vendas e
                  despesas no período selecionado.
                </p>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <Skeleton className="h-[320px] w-full rounded-xl" />
                ) : hasPerformanceData ? (
                  <div className="h-[320px] w-full">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <AreaChart
                        data={analytics.series}
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
                          tickFormatter={(value) =>
                            Number(value) >= 1000
                              ? `${(
                                  Number(value) / 1000
                                ).toFixed(1)}k`
                              : String(
                                  Math.round(
                                    Number(value)
                                  )
                                )
                          }
                          width={45}
                        />

                        <Tooltip
                          content={
                            <ReportTooltip />
                          }
                        />

                        <Area
                          type="monotone"
                          dataKey="revenue"
                          name="Faturamento"
                          stroke={chartColors.accent}
                          fill={chartColors.accent}
                          fillOpacity={0.09}
                          strokeWidth={2}
                        />

                        <Area
                          type="monotone"
                          dataKey="profit"
                          name="Lucro das vendas"
                          stroke={chartColors.profit}
                          fill={chartColors.profit}
                          fillOpacity={0.06}
                          strokeWidth={2}
                        />

                        <Area
                          type="monotone"
                          dataKey="expenses"
                          name="Despesas"
                          stroke={chartColors.expense}
                          fill={chartColors.expense}
                          fillOpacity={0.04}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-[320px] items-center justify-center text-sm text-text-secondary">
                    Sem movimentação financeira no
                    período.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Recebimentos
                </CardTitle>

                <p className="text-sm text-text-secondary">
                  Entrada de dinheiro e valores ainda
                  pendentes.
                </p>
              </CardHeader>

              <CardContent className="space-y-4">
                {loading ? (
                  <>
                    <Skeleton className="h-20 rounded-xl" />
                    <Skeleton className="h-20 rounded-xl" />
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
                        <Banknote className="h-4 w-4 text-profit" />
                        Recebido no período
                      </div>

                      <p className="text-2xl font-bold text-profit">
                        {formatCurrency(
                          analytics.summary.received
                        )}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-background/30 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm text-text-secondary">
                        <WalletCards className="h-4 w-4 text-warning" />
                        A receber
                      </div>

                      <p className="text-2xl font-bold text-text-primary">
                        {formatCurrency(
                          analytics.summary.receivable
                        )}
                      </p>

                      <p className="mt-1 text-xs text-text-secondary">
                        Das vendas criadas no período
                        selecionado
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mb-6 grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Despesas por categoria
                </CardTitle>

                <p className="text-sm text-text-secondary">
                  Onde o dinheiro operacional está
                  sendo gasto.
                </p>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <Skeleton className="h-[280px] rounded-xl" />
                ) : analytics.expensesByCategory
                    .length > 0 ? (
                  <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center">
                    <div className="h-[220px]">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                      >
                        <PieChart>
                          <Pie
                            data={
                              analytics.expensesByCategory
                            }
                            dataKey="value"
                            nameKey="label"
                            innerRadius={52}
                            outerRadius={82}
                            paddingAngle={3}
                          >
                            {analytics.expensesByCategory.map(
                              (row, index) => (
                                <Cell
                                  key={
                                    row.category
                                  }
                                  fill={
                                    PIE_COLORS[
                                      index %
                                        PIE_COLORS.length
                                    ]
                                  }
                                />
                              )
                            )}
                          </Pie>

                          <Tooltip
                            content={
                              <ReportTooltip />
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="space-y-2">
                      {analytics.expensesByCategory.map(
                        (row, index) => (
                          <div
                            key={row.category}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                          >
                            <span className="flex min-w-0 items-center gap-2 text-sm text-text-secondary">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor:
                                    PIE_COLORS[
                                      index %
                                        PIE_COLORS.length
                                    ],
                                }}
                              />

                              <span className="truncate">
                                {row.label}
                              </span>
                            </span>

                            <span className="shrink-0 text-sm font-semibold text-text-primary">
                              {formatCurrency(
                                row.value
                              )}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-[280px] items-center justify-center text-sm text-text-secondary">
                    Nenhuma despesa no período.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Leitura executiva
                </CardTitle>

                <p className="text-sm text-text-secondary">
                  Um resumo rápido da operação atual.
                </p>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="rounded-xl border border-border/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Faturamento
                  </p>

                  <p className="mt-1 text-lg font-semibold text-text-primary">
                    {formatCurrency(
                      analytics.summary.revenue
                    )}
                  </p>

                  <p className="mt-1 text-sm text-text-secondary">
                    Valor líquido de reembolsos das
                    vendas realizadas.
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Resultado
                  </p>

                  <p
                    className={cn(
                      "mt-1 text-lg font-semibold",
                      analytics.summary.result >= 0
                        ? "text-profit"
                        : "text-expense"
                    )}
                  >
                    {formatCurrency(
                      analytics.summary.result
                    )}
                  </p>

                  <p className="mt-1 text-sm text-text-secondary">
                    Lucro das vendas depois das
                    despesas operacionais.
                  </p>
                </div>

                <div className="rounded-xl border border-border/60 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Margem líquida
                  </p>

                  <p
                    className={cn(
                      "mt-1 text-lg font-semibold",
                      analytics.summary.margin >= 0
                        ? "text-profit"
                        : "text-expense"
                    )}
                  >
                    {analytics.summary.margin.toFixed(
                      1
                    )}
                    %
                  </p>

                  <p className="mt-1 text-sm text-text-secondary">
                    Percentual do faturamento que
                    sobra após os custos considerados.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingBag className="h-4 w-4 text-accent" />
                  Produtos que mais faturam
                </CardTitle>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 rounded-lg" />
                    <Skeleton className="h-14 rounded-lg" />
                    <Skeleton className="h-14 rounded-lg" />
                  </div>
                ) : analytics.topByRevenue.length >
                  0 ? (
                  <div className="space-y-2">
                    {analytics.topByRevenue.map(
                      (product, index) => (
                        <div
                          key={product.productId}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent">
                              {index + 1}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-text-primary">
                                {product.name}
                              </p>

                              <p className="text-xs text-text-secondary">
                                {product.units} unidade
                                {product.units === 1
                                  ? ""
                                  : "s"}{" "}
                                líquida
                                {product.units === 1
                                  ? ""
                                  : "s"}
                              </p>
                            </div>
                          </div>

                          <p className="shrink-0 text-sm font-bold text-text-primary">
                            {formatCurrency(
                              product.revenue
                            )}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-text-secondary">
                    Nenhum produto vendido no
                    período.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CircleDollarSign className="h-4 w-4 text-profit" />
                  Produtos mais lucrativos
                </CardTitle>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 rounded-lg" />
                    <Skeleton className="h-14 rounded-lg" />
                    <Skeleton className="h-14 rounded-lg" />
                  </div>
                ) : analytics.topByProfit.length >
                  0 ? (
                  <div className="space-y-2">
                    {analytics.topByProfit.map(
                      (product, index) => (
                        <div
                          key={product.productId}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-profit/10 text-sm font-bold text-profit">
                              {index + 1}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-text-primary">
                                {product.name}
                              </p>

                              <p className="text-xs text-text-secondary">
                                Lucro estimado nas
                                unidades líquidas
                              </p>
                            </div>
                          </div>

                          <p className="shrink-0 text-sm font-bold text-profit">
                            {formatCurrency(
                              product.profit
                            )}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="py-10 text-center text-sm text-text-secondary">
                    Ainda não há lucro realizado por
                    produto.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 rounded-xl border border-border/60 bg-surface/50 p-4">
            <div className="flex items-start gap-3">
              <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" />

              <p className="text-xs leading-relaxed text-text-secondary">
                Faturamento e lucro consideram vendas
                entregues. Cancelamentos são
                ignorados. Reembolsos reduzem o
                faturamento, e itens devolvidos que
                voltam ao estoque recuperam o CMV
                correspondente no cálculo do lucro.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
