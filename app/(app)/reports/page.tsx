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
import { BarChart3, FileWarning, PiggyBank, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { buildMonthSeries, getEffectiveBillStatus } from "@/lib/finance";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";
import type { Bill, ExpenseEntry, IncomeEntry, Investment } from "@/types/database";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageIntro } from "@/components/shared/PageIntro";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";

const PIE_COLORS = ["#38BDF8", "#22C55E", "#FACC15", "#EF4444", "#94A3B8", "#8B5CF6"];

interface ReportsPayload {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  bills: Bill[];
  investments: Investment[];
}

export default function ReportsPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ReportsPayload>({
    income: [],
    expenses: [],
    bills: [],
    investments: [],
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const [incomeResponse, expenseResponse, billsResponse, investmentsResponse] = await Promise.all([
      supabase.from("income_entries").select("*").eq("user_id", user.id),
      supabase.from("expense_entries").select("*").eq("user_id", user.id),
      supabase.from("bills").select("*").eq("user_id", user.id),
      supabase.from("investments").select("*").eq("user_id", user.id),
    ]);

    const error = incomeResponse.error || expenseResponse.error || billsResponse.error || investmentsResponse.error;

    if (error) {
      toast.error("Erro ao carregar relatorios");
      setLoading(false);
      return;
    }

    setPayload({
      income: incomeResponse.data ?? [],
      expenses: expenseResponse.data ?? [],
      bills: billsResponse.data ?? [],
      investments: investmentsResponse.data ?? [],
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = useMemo(
    () => buildMonthSeries(payload.income, payload.expenses, 6),
    [payload.expenses, payload.income]
  );

  const expenseByCategory = useMemo(() => {
    const categoryTotals = payload.expenses.reduce<Record<string, number>>((accumulator, expense) => {
      accumulator[expense.category] = (accumulator[expense.category] ?? 0) + expense.amount;
      return accumulator;
    }, {});

    return Object.entries(categoryTotals)
      .map(([name, value]) => ({ name, value }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 6);
  }, [payload.expenses]);

  const summaryBreakdown = useMemo(() => {
    const totalIncome = payload.income.reduce((sum, entry) => sum + entry.amount, 0);
    const totalExpenses = payload.expenses.reduce((sum, entry) => sum + entry.amount, 0);
    const pendingBills = payload.bills
      .filter((bill) => getEffectiveBillStatus(bill) !== "paid")
      .reduce((sum, bill) => sum + bill.amount, 0);
    const invested = payload.investments.reduce((sum, investment) => sum + investment.amount, 0);

    return [
      { label: "Saldo", value: totalIncome - totalExpenses, fill: "#38BDF8" },
      { label: "Despesas", value: totalExpenses, fill: "#EF4444" },
      { label: "Pendencias", value: pendingBills, fill: "#FACC15" },
      { label: "Investido", value: invested, fill: "#22C55E" },
    ];
  }, [payload.bills, payload.expenses, payload.income, payload.investments]);

  const topExpenses = useMemo(
    () => [...payload.expenses].sort((left, right) => right.amount - left.amount).slice(0, 5),
    [payload.expenses]
  );

  const kpis = useMemo(() => {
    const totalIncome = payload.income.reduce((sum, entry) => sum + entry.amount, 0);
    const totalExpenses = payload.expenses.reduce((sum, entry) => sum + entry.amount, 0);
    const pendingBills = payload.bills
      .filter((bill) => getEffectiveBillStatus(bill) !== "paid")
      .reduce((sum, bill) => sum + bill.amount, 0);
    const totalInvested = payload.investments.reduce((sum, investment) => sum + investment.amount, 0);
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0;

    return { totalIncome, totalExpenses, pendingBills, totalInvested, savingsRate };
  }, [payload.bills, payload.expenses, payload.income, payload.investments]);

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={BarChart3}
        iconTone="accent"
        title="Relatorios"
        description="Analytics reais sobre fluxo de caixa, gastos, folga financeira e disciplina de investimento."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard title="Receita total" value={formatCurrency(kpis.totalIncome)} icon={TrendingUp} variant="profit" loading={loading} />
        <StatCard title="Despesas totais" value={formatCurrency(kpis.totalExpenses)} icon={TrendingDown} variant="expense" loading={loading} />
        <StatCard title="Pendencias" value={formatCurrency(kpis.pendingBills)} icon={FileWarning} variant="warning" loading={loading} />
        <StatCard title="Investido" value={formatCurrency(kpis.totalInvested)} icon={PiggyBank} variant="accent" loading={loading} />
        <StatCard title="Taxa de folga" value={`${kpis.savingsRate.toFixed(0)}%`} icon={Wallet} variant={kpis.savingsRate >= 20 ? "profit" : kpis.savingsRate >= 0 ? "warning" : "expense"} loading={loading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fluxo de caixa dos ultimos 6 meses</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[320px] w-full rounded-2xl" />
            ) : chartData.some((item) => item.income > 0 || item.expenses > 0) ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData}>
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
                  <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 12 }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area type="monotone" dataKey="income" stroke="#22C55E" fill="url(#incomeFill)" strokeWidth={2.4} />
                  <Area type="monotone" dataKey="expenses" stroke="#EF4444" fill="url(#expenseFill)" strokeWidth={2.4} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={BarChart3}
                title="Sem dados suficientes"
                description="Registre movimentacoes para liberar os graficos deste modulo."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[320px] w-full rounded-2xl" />
            ) : expenseByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie data={expenseByCategory} dataKey="value" nameKey="name" innerRadius={72} outerRadius={112} paddingAngle={3}>
                    {expenseByCategory.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 12 }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={TrendingDown}
                title="Sem categorias ainda"
                description="Quando houver gastos, este grafico mostrara onde o dinheiro esta indo."
              />
            )}
            {!loading && expenseByCategory.length > 0 && (
              <div className="mt-4 grid gap-2">
                {expenseByCategory.map((entry, index) => (
                  <div key={entry.name} className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="text-sm text-text-primary">{entry.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-text-primary">{formatCurrency(entry.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Resumo executivo</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[320px] w-full rounded-2xl" />
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={summaryBreakdown}>
                  <CartesianGrid stroke="#1F2937" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94A3B8", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: "#111827", border: "1px solid #1F2937", borderRadius: 12 }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Bar dataKey="value" radius={[12, 12, 0, 0]}>
                    {summaryBreakdown.map((entry) => (
                      <Cell key={entry.label} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maiores gastos registrados</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : topExpenses.length > 0 ? (
              <div className="space-y-3">
                {topExpenses.map((expense) => (
                  <div key={expense.id} className="rounded-2xl border border-border/70 bg-background/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">{expense.description}</p>
                        <p className="mt-1 text-sm text-text-secondary">{expense.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-expense">{formatCurrency(expense.amount)}</p>
                        <p className="mt-1 text-xs text-text-secondary">{expense.spent_at}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={TrendingDown}
                title="Sem despesas para analisar"
                description="Quando voce registrar gastos, os maiores itens aparecerao aqui."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
