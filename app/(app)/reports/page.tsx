"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, ChevronDown, FileWarning, Filter, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { buildDaySeries, buildMonthSeries, getEffectiveBillStatus } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";
import type { Bill, ExpenseEntry, IncomeEntry, Investment } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageIntro } from "@/components/shared/PageIntro";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PIE_COLORS = ["#38BDF8", "#22C55E", "#FACC15", "#EF4444", "#A78BFA", "#F97316", "#EC4899", "#14B8A6"];

type PeriodKey = "1m" | "3m" | "6m" | "12m" | "all";

const PERIODS: { key: PeriodKey; label: string; months: number }[] = [
  { key: "1m", label: "Este mês", months: 1 },
  { key: "3m", label: "3 meses", months: 3 },
  { key: "6m", label: "6 meses", months: 6 },
  { key: "12m", label: "12 meses", months: 12 },
  { key: "all", label: "Tudo", months: 24 },
];

interface ReportsPayload {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  bills: Bill[];
  investments: Investment[];
}

function formatMonthLabel(monthKey: string) {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(monthKey + "-15"));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-xl">
      {label && <p className="mb-1.5 text-xs font-semibold text-text-secondary">{label}</p>}
      {payload.map((item) => (
        <div key={item.name} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="text-text-secondary">{item.name}</span>
          <span className="font-semibold text-text-primary">{formatCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ReportsPayload>({
    income: [],
    expenses: [],
    bills: [],
    investments: [],
  });
  const [period, setPeriod] = useState<PeriodKey>("6m");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const [incomeRes, expenseRes, billsRes, investmentsRes] = await Promise.all([
      supabase.from("income_entries").select("*").eq("user_id", user.id),
      supabase.from("expense_entries").select("*").eq("user_id", user.id),
      supabase.from("bills").select("*").eq("user_id", user.id),
      supabase.from("investments").select("*").eq("user_id", user.id),
    ]);

    if (incomeRes.error || expenseRes.error || billsRes.error || investmentsRes.error) {
      toast.error("Erro ao carregar relatórios");
      setLoading(false);
      return;
    }

    setPayload({
      income: incomeRes.data ?? [],
      expenses: expenseRes.data ?? [],
      bills: billsRes.data ?? [],
      investments: investmentsRes.data ?? [],
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentPeriod = PERIODS.find((p) => p.key === period)!;

  const cutoffDate = useMemo(() => {
    if (period === "all") return "2000-01-01";
    const d = new Date();
    d.setMonth(d.getMonth() - currentPeriod.months);
    return d.toISOString().slice(0, 10);
  }, [period, currentPeriod.months]);

  const periodExpenses = useMemo(
    () => payload.expenses.filter((e) => e.spent_at >= cutoffDate),
    [payload.expenses, cutoffDate]
  );

  const periodIncome = useMemo(
    () => payload.income.filter((e) => e.received_at >= cutoffDate),
    [payload.income, cutoffDate]
  );

  const allCategories = useMemo(
    () => [...new Set(payload.expenses.map((e) => e.category))].sort(),
    [payload.expenses]
  );

  const filteredExpenses = useMemo(
    () => categoryFilter === "all" ? periodExpenses : periodExpenses.filter((e) => e.category === categoryFilter),
    [periodExpenses, categoryFilter]
  );

  const chartMonths = Math.min(currentPeriod.months, 12);

  const chartData = useMemo(() => {
    if (period === "1m") return buildDaySeries(periodIncome, periodExpenses, 30);
    if (period === "3m") return buildDaySeries(periodIncome, periodExpenses, 90);
    return buildMonthSeries(periodIncome, periodExpenses, chartMonths);
  }, [period, periodIncome, periodExpenses, chartMonths]);

  const expenseByCategory = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      totals[e.category] = (totals[e.category] ?? 0) + e.amount;
    });
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filteredExpenses]);

  const topCategories = useMemo(() => {
    const totals: Record<string, number> = {};
    periodExpenses.forEach((e) => {
      totals[e.category] = (totals[e.category] ?? 0) + e.amount;
    });
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
  }, [periodExpenses]);

  const categoryMonthData = useMemo(() => {
    return Array.from({ length: chartMonths }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (chartMonths - 1 - i));
      const key = d.toISOString().slice(0, 7);
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", "");
      const row: Record<string, string | number> = { month: label };
      for (const cat of topCategories) {
        row[cat] = periodExpenses
          .filter((e) => e.spent_at.startsWith(key) && e.category === cat)
          .reduce((s, e) => s + e.amount, 0);
      }
      return row;
    });
  }, [periodExpenses, topCategories, chartMonths]);

  const expensesByMonth = useMemo(() => {
    const grouped: Record<string, ExpenseEntry[]> = {};
    [...filteredExpenses]
      .sort((a, b) => b.spent_at.localeCompare(a.spent_at))
      .forEach((e) => {
        const key = e.spent_at.slice(0, 7);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
      });
    return Object.entries(grouped)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, expenses]) => ({
        month,
        label: formatMonthLabel(month),
        expenses,
        total: expenses.reduce((s, e) => s + e.amount, 0),
      }));
  }, [filteredExpenses]);

  const kpis = useMemo(() => {
    const totalIncome = periodIncome.reduce((s, e) => s + e.amount, 0);
    const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    const pendingBills = payload.bills
      .filter((b) => getEffectiveBillStatus(b) !== "paid")
      .reduce((s, b) => s + b.amount, 0);
    const totalInvested = payload.investments.reduce((s, inv) => s + inv.amount, 0);
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;
    return { totalIncome, totalExpenses, pendingBills, totalInvested, savingsRate };
  }, [periodIncome, filteredExpenses, payload.bills, payload.investments]);

  const totalCategoryExpenses = expenseByCategory.reduce((s, e) => s + e.value, 0);

  // Auto-open the most recent month when data loads
  useEffect(() => {
    if (expensesByMonth.length > 0) {
      setOpenMonths(new Set([expensesByMonth[0].month]));
    }
  }, [expensesByMonth.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMonth = (month: string) => {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(month)) {
        next.delete(month);
      } else {
        next.add(month);
      }
      return next;
    });
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={BarChart3}
        iconTone="accent"
        title="Relatórios"
        description="Analytics reais sobre fluxo de caixa, gastos, folga financeira e disciplina de investimento."
      />

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-all",
                period === p.key
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border/60 bg-surface/60 text-text-secondary hover:border-border hover:text-text-primary"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <Filter className="mr-1.5 h-3.5 w-3.5 shrink-0" />
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {allCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard title="Receita total" value={formatCurrency(kpis.totalIncome)} icon={TrendingUp} variant="profit" loading={loading} />
        <StatCard title="Despesas totais" value={formatCurrency(kpis.totalExpenses)} icon={TrendingDown} variant="expense" loading={loading} />
        <StatCard title="Pendências" value={formatCurrency(kpis.pendingBills)} icon={FileWarning} variant="warning" loading={loading} />
        <StatCard title="Patrimônio" value={formatCurrency(kpis.totalInvested)} icon={PiggyBank} variant="accent" loading={loading} />
        <StatCard
          title="Taxa de folga"
          value={`${kpis.savingsRate.toFixed(0)}%`}
          icon={Wallet}
          variant={kpis.savingsRate >= 20 ? "profit" : kpis.savingsRate >= 0 ? "warning" : "expense"}
          loading={loading}
        />
      </div>

      {/* Cash flow area chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            Fluxo de caixa
            <span className="text-xs font-normal text-text-secondary">{currentPeriod.label}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[260px] w-full rounded-2xl" />
          ) : chartData.some((d) => d.income > 0 || d.expenses > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} interval={period === "1m" ? 4 : period === "3m" ? 14 : 0} />
                <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={48} />
                <Tooltip
                  content={({ active, payload, label }) => (
                    <ChartTooltip
                      active={active}
                      label={label}
                      payload={payload?.map((p) => ({
                        name: p.name === "income" ? "Receita" : "Despesas",
                        value: p.value as number,
                        color: p.name === "income" ? "#22C55E" : "#EF4444",
                      }))}
                    />
                  )}
                />
                <Area type="monotone" dataKey="income" stroke="#22C55E" fill="url(#incomeFill)" strokeWidth={2.4} name="income" />
                <Area type="monotone" dataKey="expenses" stroke="#EF4444" fill="url(#expenseFill)" strokeWidth={2.4} name="expenses" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState icon={BarChart3} title="Sem dados suficientes" description="Registre movimentações para ver o fluxo de caixa." />
          )}
        </CardContent>
      </Card>

      {/* Category charts */}
      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        {/* Donut + breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              Gastos por categoria
              {totalCategoryExpenses > 0 && (
                <span className="text-xs font-normal text-text-secondary">{formatCurrency(totalCategoryExpenses)}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-2xl" />
            ) : expenseByCategory.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={expenseByCategory}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {expenseByCategory.map((entry, index) => (
                        <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} strokeWidth={0} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => (
                        <ChartTooltip
                          active={active}
                          payload={payload?.map((p, i) => ({
                            name: p.name as string,
                            value: p.value as number,
                            color: PIE_COLORS[i % PIE_COLORS.length],
                          }))}
                        />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-2.5">
                  {expenseByCategory.map((entry, index) => {
                    const pct = totalCategoryExpenses > 0 ? (entry.value / totalCategoryExpenses) * 100 : 0;
                    return (
                      <div key={entry.name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                            <span className="text-text-primary">{entry.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-text-secondary">{pct.toFixed(1)}%</span>
                            <span className="min-w-[80px] text-right font-semibold text-expense">{formatCurrency(entry.value)}</span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: PIE_COLORS[index % PIE_COLORS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyState icon={TrendingDown} title="Sem categorias" description="Registre gastos para ver a distribuição." />
            )}
          </CardContent>
        </Card>

        {/* Stacked bar: categories by month */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gastos por mês / categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-2xl" />
            ) : topCategories.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={categoryMonthData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={48} />
                    <Tooltip
                      content={({ active, payload, label }) => (
                        <ChartTooltip
                          active={active}
                          label={label}
                          payload={payload
                            ?.filter((p) => (p.value as number) > 0)
                            .map((p) => ({
                              name: p.dataKey as string,
                              value: p.value as number,
                              color: PIE_COLORS[topCategories.indexOf(p.dataKey as string) % PIE_COLORS.length],
                            }))}
                        />
                      )}
                    />
                    {topCategories.map((cat, index) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="a"
                        fill={PIE_COLORS[index % PIE_COLORS.length]}
                        radius={index === topCategories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        maxBarSize={48}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {topCategories.map((cat, index) => (
                    <div key={cat} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="text-xs text-text-secondary">{cat}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState icon={BarChart3} title="Sem dados" description="Registre gastos para ver a evolução por categoria." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed expense list grouped by month */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Despesas do período
            {!loading && filteredExpenses.length > 0 && (
              <span className="text-xs font-normal text-text-secondary">
                {filteredExpenses.length} lançamento{filteredExpenses.length !== 1 ? "s" : ""} · {formatCurrency(filteredExpenses.reduce((s, e) => s + e.amount, 0))}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : expensesByMonth.length === 0 ? (
            <EmptyState
              icon={TrendingDown}
              title="Sem despesas no período"
              description="Ajuste o filtro de período ou categoria para ver os lançamentos."
            />
          ) : (
            <div className="space-y-2">
              {expensesByMonth.map(({ month, label, expenses, total }) => {
                const isOpen = openMonths.has(month);
                return (
                  <div key={month} className="overflow-hidden rounded-2xl border border-border/50">
                    {/* Month header — clickable */}
                    <button
                      type="button"
                      onClick={() => toggleMonth(month)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-border/20"
                    >
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</span>
                        <span className="rounded-full bg-expense/15 px-2.5 py-0.5 text-xs font-semibold text-expense">{formatCurrency(total)}</span>
                        <span className="text-[10px] text-text-secondary">{expenses.length} item{expenses.length !== 1 ? "s" : ""}</span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-text-secondary transition-transform duration-300",
                          isOpen ? "rotate-180" : "rotate-0"
                        )}
                      />
                    </button>

                    {/* Collapsible list */}
                    <div className={cn(
                      "grid transition-all duration-300 ease-in-out",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}>
                      <div className="overflow-hidden">
                        <div className="space-y-1 border-t border-border/40 px-3 pb-3 pt-2">
                          {expenses.map((expense) => (
                            <div
                              key={expense.id}
                              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-border/20"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-medium text-text-primary">{expense.description}</p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <Badge variant="default" className="text-[10px]">{expense.category}</Badge>
                                  {expense.payment_method && (
                                    <span className="text-[10px] text-text-secondary">{expense.payment_method}</span>
                                  )}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-sm font-semibold text-expense">{formatCurrency(expense.amount)}</p>
                                <p className="mt-0.5 text-[10px] text-text-secondary">
                                  {new Intl.DateTimeFormat("pt-BR").format(new Date(expense.spent_at + "T12:00:00"))}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
