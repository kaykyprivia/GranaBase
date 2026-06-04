"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Wallet, TrendingUp, TrendingDown, FileText,
  PiggyBank, DollarSign, ArrowUpRight, ArrowDownRight,
  AlertCircle, ChevronRight, Target,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { coerceData } from "@/lib/supabase/casts";
import { buildMonthSeries, getEffectiveInstallmentStatus } from "@/lib/finance";
import { calculateGoalMetrics } from "@/lib/goals";
import { isInstallmentPaid } from "@/lib/installments";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, getDaysUntilDue, isOverdue, cn } from "@/lib/utils";
import type { Bill, IncomeEntry, ExpenseEntry, FinancialGoal, InstallmentPayment, InvestmentWallet } from "@/types/database";
import { GlobalContributionButton } from "@/components/wallet/WalletContributionProvider";

const AreaChart = dynamic(
  () => import("recharts").then((m) => ({
    default: ({
      data, income, expenses,
    }: {
      data: ChartData[];
      income: string;
      expenses: string;
    }) => {
      const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } = m;
      return (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
            <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111827", border: "1px solid #1F2937", borderRadius: "8px", color: "#F8FAFC" }}
              formatter={(v: number) => [formatCurrency(v), ""]}
            />
            <Area type="monotone" dataKey={income} name="Entradas" stroke="#22C55E" strokeWidth={2} fill="url(#colorIncome)" />
            <Area type="monotone" dataKey={expenses} name="Saídas" stroke="#EF4444" strokeWidth={2} fill="url(#colorExpense)" />
          </AreaChart>
        </ResponsiveContainer>
      );
    },
  })),
  { ssr: false }
);

interface ChartData {
  month: string;
  income: number;
  expenses: number;
}

interface DashboardStats {
  totalIncome: number;
  totalExpenses: number;
  monthIncome: number;
  monthExpenses: number;
  pendingBills: number;
  pendingBillsAmount: number;
  futureInstallmentsAmount: number;
  futureInstallmentsCount: number;
  investedTotal: number;
  freeEstimate: number;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalIncome: 0, totalExpenses: 0, monthIncome: 0, monthExpenses: 0,
    pendingBills: 0, pendingBillsAmount: 0, futureInstallmentsAmount: 0, futureInstallmentsCount: 0, investedTotal: 0, freeEstimate: 0,
  });
  const [upcomingBills, setUpcomingBills] = useState<Bill[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Array<IncomeEntry & { type: "income" } | ExpenseEntry & { type: "expense" }>>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [wallet, setWallet] = useState<InvestmentWallet | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setLoading(true);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().split("T")[0];

    const [
      { data: allIncome },
      { data: allExpenses },
      { data: billsData },
      { data: upcomingBillsData },
      { data: installmentPaymentsData },
      { data: walletData },
      { data: goalsData },
      { data: recentIncome },
      { data: recentExpenses },
    ] = await Promise.all([
      supabase.from("income_entries").select("*").eq("user_id", user.id),
      supabase.from("expense_entries").select("*").eq("user_id", user.id),
      supabase.from("bills").select("*").eq("user_id", user.id).in("status", ["pending", "overdue", "paid"]),
      supabase.from("bills").select("*").eq("user_id", user.id).in("status", ["pending", "overdue"]).lte("due_date", in7DaysStr).order("due_date"),
      supabase.from("installment_payments").select("*").eq("user_id", user.id),
      supabase.from("investment_wallets").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("financial_goals").select("*").eq("user_id", user.id).neq("status", "completed").limit(3),
      supabase.from("income_entries").select("*").eq("user_id", user.id).order("received_at", { ascending: false }).limit(5),
      supabase.from("expense_entries").select("*").eq("user_id", user.id).order("spent_at", { ascending: false }).limit(5),
    ]);

    const incomeRows = coerceData<IncomeEntry[]>(allIncome ?? []);
    const expenseRows = coerceData<ExpenseEntry[]>(allExpenses ?? []);
    const billRows = coerceData<Bill[]>(billsData ?? []);
    const upcomingBillRows = coerceData<Bill[]>(upcomingBillsData ?? []);
    const installmentPayments = coerceData<InstallmentPayment[]>(installmentPaymentsData ?? []);
    const walletRow = coerceData<InvestmentWallet | null>(walletData ?? null);
    const goalRows = coerceData<FinancialGoal[]>(goalsData ?? []);
    const recentIncomeRows = coerceData<IncomeEntry[]>(recentIncome ?? []);
    const recentExpenseRows = coerceData<ExpenseEntry[]>(recentExpenses ?? []);

    const totalIncome = incomeRows.reduce((sum, entry) => sum + entry.amount, 0);
    const totalExpenses = expenseRows.reduce((sum, entry) => sum + entry.amount, 0);
    const monthIncome = incomeRows.filter((entry) => entry.received_at.startsWith(monthKey)).reduce((sum, entry) => sum + entry.amount, 0);
    const monthExpenses = expenseRows.filter((entry) => entry.spent_at.startsWith(monthKey)).reduce((sum, entry) => sum + entry.amount, 0);
    const openBills = billRows.filter((bill) => bill.status !== "paid");
    const pendingBillsAmount = openBills.reduce((sum, bill) => sum + bill.amount, 0);
    const futureInstallments = installmentPayments.filter((payment) => !isInstallmentPaid(getEffectiveInstallmentStatus(payment)));
    const futureInstallmentsAmount = futureInstallments.reduce((sum, payment) => sum + payment.amount, 0);
    const investedTotal = walletRow?.total_balance ?? 0;

    setStats({
      totalIncome, totalExpenses,
      monthIncome, monthExpenses,
      pendingBills: openBills.length,
      pendingBillsAmount,
      futureInstallmentsAmount,
      futureInstallmentsCount: futureInstallments.length,
      investedTotal,
      freeEstimate: monthIncome - pendingBillsAmount - futureInstallmentsAmount,
    });

    setUpcomingBills(
      upcomingBillRows.filter(b =>
        b.status !== "paid" && (isOverdue(b.due_date) || getDaysUntilDue(b.due_date) <= 7)
      )
    );

    const inc = recentIncomeRows.map(e => ({ ...e, type: "income" as const }));
    const exp = recentExpenseRows.map(e => ({ ...e, type: "expense" as const }));
    const combined = [...inc, ...exp]
      .sort((a, b) => {
        const dateA = "received_at" in a ? a.received_at : a.spent_at;
        const dateB = "received_at" in b ? b.received_at : b.spent_at;
        return dateB.localeCompare(dateA);
      })
      .slice(0, 7);
    setRecentTransactions(combined);

    setGoals(goalRows);
    setWallet(walletRow);
    setChartData(buildMonthSeries(incomeRows, expenseRows));

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    window.addEventListener("wallet:changed", loadData);
    return () => window.removeEventListener("wallet:changed", loadData);
  }, [loadData]);

  const currentBalance = stats.totalIncome - stats.totalExpenses;
  const walletBalance = wallet?.total_balance ?? 0;

  return (
    <div className="page-container animate-fade-in">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
            <p className="text-text-secondary text-sm mt-0.5">Visao geral das suas financas</p>
          </div>
          <GlobalContributionButton />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          title="Saldo Atual"
          value={formatCurrency(currentBalance)}
          icon={Wallet}
          variant={currentBalance >= 0 ? "profit" : "expense"}
          loading={loading}
          subtitle="Entradas - Saídas"
        />
        <StatCard
          title="Entradas do Mês"
          value={formatCurrency(stats.monthIncome)}
          icon={TrendingUp}
          variant="profit"
          loading={loading}
        />
        <StatCard
          title="Saídas do Mês"
          value={formatCurrency(stats.monthExpenses)}
          icon={TrendingDown}
          variant="expense"
          loading={loading}
        />
        <StatCard
          title="Livre Estimado"
          value={formatCurrency(stats.freeEstimate)}
          icon={DollarSign}
          variant={stats.freeEstimate >= 0 ? "profit" : "expense"}
          loading={loading}
          subtitle="Entradas - Pendências"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard
          title="Contas Pendentes"
          value={formatCurrency(stats.pendingBillsAmount)}
          icon={FileText}
          variant="warning"
          loading={loading}
          subtitle={`${stats.pendingBills} conta${stats.pendingBills !== 1 ? "s" : ""}`}
        />
        <StatCard
          title="Parcelas Futuras"
          value={formatCurrency(stats.futureInstallmentsAmount)}
          icon={DollarSign}
          variant="accent"
          loading={loading}
          subtitle={`${stats.futureInstallmentsCount} parcela${stats.futureInstallmentsCount !== 1 ? "s" : ""}`}
        />
        <StatCard
          title="Patrimonio"
          value={formatCurrency(stats.investedTotal)}
          icon={PiggyBank}
          variant="accent"
          loading={loading}
          subtitle="Carteira global"
        />
        <StatCard
          title="Total Saídas"
          value={formatCurrency(stats.totalExpenses)}
          icon={ArrowDownRight}
          variant="default"
          loading={loading}
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Chart — spans 2 cols */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Evolução nos últimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[220px] w-full" />
            ) : chartData.some(d => d.income > 0 || d.expenses > 0) ? (
              <AreaChart data={chartData} income="income" expenses="expenses" />
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="Sem dados ainda"
                description="Registre entradas e gastos para ver sua evolução"
              />
            )}
            <div className="flex items-center gap-4 mt-3 justify-end">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-profit" />
                <span className="text-xs text-text-secondary">Entradas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-expense" />
                <span className="text-xs text-text-secondary">Saídas</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Bills */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Contas Vencendo</CardTitle>
            <Link href="/bills">
              <Button variant="ghost" size="icon-sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="px-5 space-y-3 pb-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : upcomingBills.length === 0 ? (
              <EmptyState
                icon={AlertCircle}
                title="Sem contas urgentes"
                description="Nenhuma conta vence nos próximos 7 dias"
              />
            ) : (
              <div className="divide-y divide-border">
                {upcomingBills.slice(0, 4).map(bill => {
                  const overdue = isOverdue(bill.due_date);
                  const days = getDaysUntilDue(bill.due_date);
                  return (
                    <div key={bill.id} className="px-5 py-3 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{bill.name}</p>
                        <p className={cn("text-xs", overdue ? "text-expense" : "text-warning")}>
                          {overdue
                            ? `Atrasada ${Math.abs(days)} dia${Math.abs(days) !== 1 ? "s" : ""}`
                            : days === 0 ? "Vence hoje"
                            : `Vence em ${days} dia${days !== 1 ? "s" : ""}`}
                        </p>
                      </div>
                      <div className="text-right ml-2 shrink-0">
                        <p className={cn("text-sm font-semibold", overdue ? "text-expense" : "text-warning")}>
                          {formatCurrency(bill.amount)}
                        </p>
                        <Badge variant={overdue ? "overdue" : "pending"} className="text-[10px]">
                          {overdue ? "Atrasada" : "Pendente"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Últimas movimentações</CardTitle>
            <Link href="/income">
              <Button variant="ghost" size="icon-sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="px-5 space-y-3 pb-4">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : recentTransactions.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Sem movimentações"
                description="Registre sua primeira entrada ou gasto"
              />
            ) : (
              <div className="divide-y divide-border">
                {recentTransactions.map(tx => {
                  const isIncome = tx.type === "income";
                  const date = isIncome ? (tx as IncomeEntry).received_at : (tx as ExpenseEntry).spent_at;
                  return (
                    <div key={tx.id} className="px-5 py-3 flex items-center gap-3 hover:bg-border/20 transition-colors">
                      <div className={cn(
                        "p-1.5 rounded-lg shrink-0",
                        isIncome ? "bg-profit/10" : "bg-expense/10"
                      )}>
                        {isIncome
                          ? <ArrowUpRight className="h-4 w-4 text-profit" />
                          : <ArrowDownRight className="h-4 w-4 text-expense" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{tx.description}</p>
                        <p className="text-xs text-text-secondary">{tx.category}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-sm font-semibold", isIncome ? "text-profit" : "text-expense")}>
                          {isIncome ? "+" : "-"}{formatCurrency(tx.amount)}
                        </p>
                        <p className="text-xs text-text-secondary">{formatDate(date)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Goals Progress */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Metas</CardTitle>
            <Link href="/goals">
              <Button variant="ghost" size="icon-sm">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : goals.length === 0 ? (
              <EmptyState
                icon={Target}
                title="Sem metas"
                description="Defina uma meta financeira"
              />
            ) : (
              <div className="space-y-4">
                {goals.map(goal => {
                  const metrics = calculateGoalMetrics(goal, walletBalance);
                  const color = metrics.progress >= 80 ? "#22C55E" : metrics.progress >= 40 ? "#FACC15" : "#EF4444";
                  return (
                    <div key={goal.id}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-text-primary truncate max-w-[160px]">{goal.name}</p>
                        <span className="text-xs font-semibold" style={{ color }}>{metrics.displayProgress}%</span>
                      </div>
                      <Progress
                        value={metrics.progress}
                        className="h-1.5"
                        indicatorClassName="transition-all"
                        style={{ "--indicator-color": color } as React.CSSProperties}
                      />
                      <p className="text-xs text-text-secondary mt-1">
                        {formatCurrency(metrics.walletBalance)} de {formatCurrency(goal.target_amount)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
