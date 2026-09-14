"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  LayoutDashboard,
  PackageCheck,
  Percent,
  Plus,
  ShoppingBag,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
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
import { toast } from "sonner";

import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
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
import { getSaleChannelLabel } from "@/lib/business-sales";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import {
  cn,
  formatCurrency,
  toLocalDateString,
} from "@/lib/utils";
import type {
  BusinessSalesChannel,
  Database,
} from "@/types/database";

type WorkspaceRpcResult = {
  workspace_id: string;
};

type ReportsArgs =
  Database["public"]["Functions"]["get_business_reports_analytics"]["Args"];

type DashboardArgs =
  Database["public"]["Functions"]["get_business_dashboard_operations"]["Args"];

type DashboardOperations = {
  summary: {
    cogs: number;
    openSales: number;
    pendingPaymentSales: number;
    openPurchases: number;
    openPurchaseInvestment: number;
    arrivingSoon: number;
    inventoryValue: number;
    productsInStock: number;
    availableUnits: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    inTransitUnits: number;
  };
  channels: Array<{
    channel: BusinessSalesChannel;
    salesCount: number;
    revenue: number;
  }>;
  topCustomers: Array<{
    customerId: string;
    name: string;
    orders: number;
    revenue: number;
    lastPurchase: string | null;
  }>;
  lowStock: Array<{
    productId: string;
    name: string;
    available: number;
    minimumStock: number;
    inTransit: number;
    inventoryValue: number;
  }>;
};

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

const EMPTY_OPERATIONS: DashboardOperations = {
  summary: {
    cogs: 0,
    openSales: 0,
    pendingPaymentSales: 0,
    openPurchases: 0,
    openPurchaseInvestment: 0,
    arrivingSoon: 0,
    inventoryValue: 0,
    productsInStock: 0,
    availableUnits: 0,
    lowStockProducts: 0,
    outOfStockProducts: 0,
    inTransitUnits: 0,
  },
  channels: [],
  topCustomers: [],
  lowStock: [],
};

export function BusinessDashboardPageClient() {
  const router = useRouter();
  const chartColors = useChartColors();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [period, setPeriod] =
    useState<BusinessReportsPeriod>("month");
  const [analytics, setAnalytics] =
    useState<BusinessReportsAnalytics>(EMPTY_ANALYTICS);
  const [operations, setOperations] =
    useState<DashboardOperations>(EMPTY_OPERATIONS);

  const loadDashboard = useCallback(async () => {
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
        coerceData<WorkspaceRpcResult>(
          workspaceRes.data
        );

      const today = toLocalDateString();

      const reportArgs = {
        p_workspace_id: workspace.workspace_id,
        p_period: period,
        p_today: today,
      } satisfies ReportsArgs;

      const dashboardArgs = {
        p_workspace_id: workspace.workspace_id,
        p_period: period,
        p_today: today,
      } satisfies DashboardArgs;

      const [reportsRes, dashboardRes] =
        await Promise.all([
          supabase.rpc(
            "get_business_reports_analytics",
            coerceMutation(reportArgs)
          ),
          supabase.rpc(
            "get_business_dashboard_operations",
            coerceMutation(dashboardArgs)
          ),
        ]);

      if (reportsRes.error) {
        throw reportsRes.error;
      }

      if (dashboardRes.error) {
        throw dashboardRes.error;
      }

      setAnalytics(
        coerceData<BusinessReportsAnalytics>(
          reportsRes.data
        )
      );

      setOperations(
        normalizeOperations(
          coerceData<DashboardOperations>(
            dashboardRes.data
          )
        )
      );
    } catch (error) {
      console.error(
        "Erro ao carregar dashboard do negócio",
        error
      );
      toast.error(
        "Não foi possível carregar o painel do negócio agora."
      );
    } finally {
      setLoading(false);
    }
  }, [period, router, supabase]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const hasPerformanceData =
    analytics.series.some(
      (row) =>
        row.revenue !== 0 ||
        row.profit !== 0 ||
        row.expenses !== 0
    );

  const totalChannelRevenue =
    operations.channels.reduce(
      (sum, row) => sum + row.revenue,
      0
    );

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={LayoutDashboard}
        iconTone="accent"
        title="Painel do negócio"
        description="Acompanhe vendas, lucro, recebimentos, estoque e operação em uma única visão."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="min-h-10"
            >
              <Link href="/business/purchases/new">
                <Plus className="h-4 w-4" />
                Compra
              </Link>
            </Button>

            <Button
              asChild
              size="sm"
              className="min-h-10"
            >
              <Link href="/business/sales/new">
                <Plus className="h-4 w-4" />
                Venda
              </Link>
            </Button>
          </div>
        }
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
          } realizada${
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
          title="CMV realizado"
          value={formatCurrency(
            operations.summary.cogs
          )}
          subtitle="Custo dos produtos vendidos"
          icon={Boxes}
          variant="warning"
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
          title="Despesas"
          value={formatCurrency(
            analytics.summary.expenses
          )}
          subtitle="Despesas operacionais"
          icon={TrendingDown}
          variant="expense"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Resultado"
          value={formatCurrency(
            analytics.summary.result
          )}
          subtitle="Lucro menos despesas"
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
          title="Recebido"
          value={formatCurrency(
            analytics.summary.received
          )}
          subtitle="Entradas no período"
          icon={Banknote}
          variant="accent"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="A receber"
          value={formatCurrency(
            analytics.summary.receivable
          )}
          subtitle="Saldo pendente das vendas"
          icon={WalletCards}
          variant="warning"
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

      <div className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Card className="min-w-0">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Evolução do negócio
              </CardTitle>

              <p className="mt-1 text-sm text-text-secondary">
                Faturamento, lucro das vendas e
                despesas no período selecionado.
              </p>
            </div>

            <Link
              href="/business/reports"
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Relatórios
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>

          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-xl" />
            ) : hasPerformanceData ? (
              <div className="h-[300px] w-full">
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
                      width={44}
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
                    />

                    <Tooltip
                      formatter={(value) =>
                        formatCurrency(
                          Number(value ?? 0)
                        )
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
                      name="Lucro"
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
              <div className="flex h-[300px] items-center justify-center text-sm text-text-secondary">
                Sem movimentação financeira no período.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Operação agora
            </CardTitle>

            <p className="text-sm text-text-secondary">
              Pendências que precisam de atenção.
            </p>
          </CardHeader>

          <CardContent className="space-y-3">
            <OperationRow
              href="/business/sales"
              icon={PackageCheck}
              label="Vendas em andamento"
              value={operations.summary.openSales}
              loading={loading}
            />

            <OperationRow
              href="/business/sales"
              icon={Banknote}
              label="Vendas com pagamento pendente"
              value={
                operations.summary
                  .pendingPaymentSales
              }
              loading={loading}
            />

            <OperationRow
              href="/business/purchases"
              icon={ShoppingCart}
              label="Compras abertas"
              value={
                operations.summary.openPurchases
              }
              loading={loading}
            />

            <OperationRow
              href="/business/inventory"
              icon={AlertTriangle}
              label="Produtos com estoque baixo"
              value={
                operations.summary
                  .lowStockProducts
              }
              loading={loading}
              warning={
                operations.summary
                  .lowStockProducts > 0
              }
            />

            <div className="rounded-xl border border-border/60 bg-background/30 p-4">
              <p className="text-xs text-text-secondary">
                Capital em compras abertas
              </p>
              <p className="mt-1 text-xl font-bold text-text-primary">
                {loading
                  ? "—"
                  : formatCurrency(
                      operations.summary
                        .openPurchaseInvestment
                    )}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {operations.summary.arrivingSoon} prevista
                {operations.summary.arrivingSoon === 1
                  ? ""
                  : "s"}{" "}
                para chegar nos próximos 7 dias
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          title="Capital em estoque"
          value={formatCurrency(
            operations.summary.inventoryValue
          )}
          icon={Boxes}
          variant="accent"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Produtos em estoque"
          value={String(
            operations.summary.productsInStock
          )}
          icon={Boxes}
          variant="profit"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Unidades disponíveis"
          value={String(
            operations.summary.availableUnits
          )}
          icon={PackageCheck}
          variant="default"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Sem estoque"
          value={String(
            operations.summary.outOfStockProducts
          )}
          icon={AlertTriangle}
          variant={
            operations.summary.outOfStockProducts > 0
              ? "expense"
              : "default"
          }
          size="compact"
          loading={loading}
        />

        <StatCard
          title="A caminho"
          value={String(
            operations.summary.inTransitUnits
          )}
          subtitle="unidades compradas"
          icon={ShoppingCart}
          variant="warning"
          size="compact"
          loading={loading}
        />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Vendas por canal
              </CardTitle>
              <p className="mt-1 text-sm text-text-secondary">
                Faturamento realizado por origem da venda.
              </p>
            </div>

            <Link
              href="/business/sales"
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Vendas
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
              </div>
            ) : operations.channels.length > 0 ? (
              <div className="space-y-3">
                {operations.channels.map((row) => {
                  const share =
                    totalChannelRevenue > 0
                      ? Math.min(
                          (row.revenue /
                            totalChannelRevenue) *
                            100,
                          100
                        )
                      : 0;

                  return (
                    <div
                      key={row.channel}
                      className="rounded-xl border border-border/60 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary">
                            {getSaleChannelLabel(
                              row.channel
                            )}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {row.salesCount} venda
                            {row.salesCount === 1
                              ? ""
                              : "s"}
                          </p>
                        </div>

                        <p className="shrink-0 text-sm font-bold text-text-primary">
                          {formatCurrency(row.revenue)}
                        </p>
                      </div>

                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border/40">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{
                            width: `${share}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-text-secondary">
                Nenhuma venda realizada no período.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">
                Estoque que exige atenção
              </CardTitle>
              <p className="mt-1 text-sm text-text-secondary">
                Produtos abaixo ou no estoque mínimo.
              </p>
            </div>

            <Link
              href="/business/inventory"
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Estoque
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
              </div>
            ) : operations.lowStock.length > 0 ? (
              <div className="space-y-2">
                {operations.lowStock.map((product) => (
                  <div
                    key={product.productId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {product.name}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {product.available}{" "}
                        {product.available === 1
                          ? "disponível"
                          : "disponíveis"}{" "}
                        · mínimo {product.minimumStock}
                        {product.inTransit > 0
                          ? ` · ${product.inTransit} a caminho`
                          : ""}
                      </p>
                    </div>

                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-text-secondary">
                Nenhum produto abaixo do estoque mínimo.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-accent" />
                Clientes que mais compram
              </CardTitle>
              <p className="mt-1 text-sm text-text-secondary">
                Ranking pelo faturamento realizado no período.
              </p>
            </div>

            <Link
              href="/business/customers"
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Clientes
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
              </div>
            ) : operations.topCustomers.length >
              0 ? (
              <div className="space-y-2">
                {operations.topCustomers.map(
                  (customer, index) => (
                    <div
                      key={customer.customerId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-bold text-accent">
                          {index + 1}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary">
                            {customer.name}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {customer.orders} compra
                            {customer.orders === 1
                              ? ""
                              : "s"}
                          </p>
                        </div>
                      </div>

                      <p className="shrink-0 text-sm font-bold text-text-primary">
                        {formatCurrency(
                          customer.revenue
                        )}
                      </p>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="py-10 text-center text-sm text-text-secondary">
                Nenhuma venda vinculada a clientes no período.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4 text-profit" />
                Produtos que mais faturam
              </CardTitle>
              <p className="mt-1 text-sm text-text-secondary">
                Ranking das unidades líquidas realizadas.
              </p>
            </div>

            <Link
              href="/business/reports"
              className="flex shrink-0 items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary"
            >
              Relatórios
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
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
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-profit/10 text-sm font-bold text-profit">
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
                Nenhum produto vendido no período.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OperationRow({
  href,
  icon: Icon,
  label,
  value,
  loading,
  warning = false,
}: {
  href: string;
  icon: typeof PackageCheck;
  label: string;
  value: number;
  loading: boolean;
  warning?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:bg-border/20"
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          warning
            ? "bg-warning/15 text-warning"
            : "bg-accent/10 text-accent"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-secondary">
          {label}
        </p>
      </div>

      <p
        className={cn(
          "text-lg font-bold",
          warning
            ? "text-warning"
            : "text-text-primary"
        )}
      >
        {loading ? "—" : value}
      </p>

      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />
    </Link>
  );
}

function normalizeOperations(
  input: DashboardOperations
): DashboardOperations {
  return {
    summary: {
      cogs: Number(input.summary?.cogs ?? 0),
      openSales: Number(input.summary?.openSales ?? 0),
      pendingPaymentSales: Number(
        input.summary?.pendingPaymentSales ?? 0
      ),
      openPurchases: Number(
        input.summary?.openPurchases ?? 0
      ),
      openPurchaseInvestment: Number(
        input.summary?.openPurchaseInvestment ?? 0
      ),
      arrivingSoon: Number(
        input.summary?.arrivingSoon ?? 0
      ),
      inventoryValue: Number(
        input.summary?.inventoryValue ?? 0
      ),
      productsInStock: Number(
        input.summary?.productsInStock ?? 0
      ),
      availableUnits: Number(
        input.summary?.availableUnits ?? 0
      ),
      lowStockProducts: Number(
        input.summary?.lowStockProducts ?? 0
      ),
      outOfStockProducts: Number(
        input.summary?.outOfStockProducts ?? 0
      ),
      inTransitUnits: Number(
        input.summary?.inTransitUnits ?? 0
      ),
    },
    channels: (input.channels ?? []).map((row) => ({
      ...row,
      salesCount: Number(row.salesCount ?? 0),
      revenue: Number(row.revenue ?? 0),
    })),
    topCustomers: (input.topCustomers ?? []).map(
      (row) => ({
        ...row,
        orders: Number(row.orders ?? 0),
        revenue: Number(row.revenue ?? 0),
      })
    ),
    lowStock: (input.lowStock ?? []).map((row) => ({
      ...row,
      available: Number(row.available ?? 0),
      minimumStock: Number(
        row.minimumStock ?? 0
      ),
      inTransit: Number(row.inTransit ?? 0),
      inventoryValue: Number(
        row.inventoryValue ?? 0
      ),
    })),
  };
}