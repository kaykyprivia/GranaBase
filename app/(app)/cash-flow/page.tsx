"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, FileDown, WalletCards } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { PageIntro } from "@/components/shared/PageIntro";
import { CashFlowPdfDialog } from "@/components/cash-flow/CashFlowPdfDialog";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useChartColors } from "@/hooks/useChartColors";
import { useCurrency } from "@/lib/hooks/useCurrency";
import { appliesMaeFilter } from "@/lib/mae";
import { getInstallmentPaidAmount, isInstallmentPaid } from "@/lib/installments";
import {
  buildMonthlyPersonalCashFlow,
  filterPersonalCashFlowEvents,
  getPersonalCashFlowDateRange,
  PERSONAL_CASH_FLOW_PERIODS,
  summarizePersonalCashFlow,
  type PersonalCashFlowEvent,
  type PersonalCashFlowPeriod,
  type PersonalCashFlowSource,
} from "@/lib/personal-cash-flow";
import { downloadCashFlowPdf } from "@/lib/cash-flow-pdf";
import { createClient } from "@/lib/supabase/client";
import { coerceData } from "@/lib/supabase/casts";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type {
  Bill,
  Database,
  ExpenseEntry,
  IncomeEntry,
  Installment,
  InstallmentPayment,
  Receivable,
} from "@/types/database";

type Consortium = Database["public"]["Tables"]["consortiums"]["Row"];
type ConsortiumPayment = Database["public"]["Tables"]["consortium_payments"]["Row"];

const SOURCE_LABELS: Record<PersonalCashFlowSource, string> = {
  income: "Entrada",
  receivable: "Recebível",
  expense: "Gasto",
  bill: "Conta",
  installment: "Parcela",
  consortium: "Consórcio",
};

interface CashFlowTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
  currency: "BRL" | "USD";
}

function CashFlowTooltip({ active, payload, label, currency }: CashFlowTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl">
      <p className="mb-1.5 text-xs font-semibold text-text-secondary">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => {
          const isIncome = item.dataKey === "income";
          return (
            <div key={item.dataKey} className="flex items-center justify-between gap-5 text-sm">
              <span className={isIncome ? "text-profit" : "text-expense"}>
                {isIncome ? "Entradas" : "Saídas"}
              </span>
              <span className="font-semibold text-text-primary">
                {formatCurrency(Number(item.value ?? 0), currency)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PersonalCashFlowPage() {
  const supabase = useMemo(() => createClient(), []);
  const chartColors = useChartColors();
  const currency = useCurrency();
  const [events, setEvents] = useState<PersonalCashFlowEvent[]>([]);
  const [period, setPeriod] = useState<PersonalCashFlowPeriod>("month");
  const [loading, setLoading] = useState(true);
  const [pdfOpen, setPdfOpen] = useState(false);

  const loadCashFlow = useCallback(async () => {
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [
        incomeRes,
        receivablesRes,
        expensesRes,
        billsRes,
        installmentsRes,
        paymentsRes,
        consortiumsRes,
        consortiumPaymentsRes,
      ] = await Promise.all([
        supabase.from("income_entries").select("*").eq("user_id", user.id),
        supabase.from("receivables").select("*").eq("user_id", user.id).eq("status", "received"),
        supabase.from("expense_entries").select("*").eq("user_id", user.id),
        supabase.from("bills").select("*").eq("user_id", user.id).eq("status", "paid"),
        supabase.from("installments").select("*").eq("user_id", user.id),
        supabase.from("installment_payments").select("*").eq("user_id", user.id),
        supabase.from("consortiums").select("*").eq("user_id", user.id),
        supabase.from("consortium_payments").select("*").eq("user_id", user.id),
      ]);

      const failedRequest = [
        incomeRes,
        receivablesRes,
        expensesRes,
        billsRes,
        installmentsRes,
        paymentsRes,
        consortiumsRes,
        consortiumPaymentsRes,
      ].find((response) => response.error);

      if (failedRequest?.error) throw failedRequest.error;

      const incomeRows = coerceData<IncomeEntry[]>(incomeRes.data ?? []);
      const receivableRows = coerceData<Receivable[]>(receivablesRes.data ?? []);
      const expenseRows = coerceData<ExpenseEntry[]>(expensesRes.data ?? []);
      const billRows = coerceData<Bill[]>(billsRes.data ?? []);
      const installmentRows = coerceData<Installment[]>(installmentsRes.data ?? []);
      const paymentRows = coerceData<InstallmentPayment[]>(paymentsRes.data ?? []);
      const consortiumRows = coerceData<Consortium[]>(consortiumsRes.data ?? []);
      const consortiumPaymentRows = coerceData<ConsortiumPayment[]>(consortiumPaymentsRes.data ?? []);
      const installmentsById = new Map(installmentRows.map((installment) => [installment.id, installment]));
      const consortiumsById = new Map(consortiumRows.map((consortium) => [consortium.id, consortium]));

      const nextEvents: PersonalCashFlowEvent[] = [
        ...incomeRows.map((entry) => ({
          id: `income-${entry.id}`,
          direction: "income" as const,
          date: entry.received_at,
          amount: entry.amount,
          description: entry.description,
          category: entry.category,
          source: "income" as const,
        })),
        ...receivableRows
          .filter((entry) => entry.received_at)
          .map((entry) => ({
            id: `receivable-${entry.id}`,
            direction: "income" as const,
            date: entry.received_at!.slice(0, 10),
            amount: entry.amount,
            description: entry.description,
            category: entry.category,
            source: "receivable" as const,
          })),
        ...expenseRows.map((entry) => ({
          id: `expense-${entry.id}`,
          direction: "expense" as const,
          date: entry.payment_method === "Cartão Crédito" && entry.card_due_date
            ? entry.card_due_date
            : entry.spent_at,
          amount: entry.amount,
          description: entry.description,
          category: entry.category,
          source: "expense" as const,
        })),
        ...billRows
          .filter((entry) => entry.paid_at && appliesMaeFilter(user.id, "exclude-mae", entry.name))
          .map((entry) => ({
            id: `bill-${entry.id}`,
            direction: "expense" as const,
            date: entry.paid_at!.slice(0, 10),
            amount: entry.amount,
            description: entry.name,
            category: entry.category,
            source: "bill" as const,
          })),
        ...paymentRows
          .filter((entry) => {
            const installment = installmentsById.get(entry.installment_id);
            return isInstallmentPaid(entry.status) && !!entry.paid_at &&
              appliesMaeFilter(user.id, "exclude-mae", installment?.description);
          })
          .map((entry) => {
            const installment = installmentsById.get(entry.installment_id);
            return {
              id: `installment-${entry.id}`,
              direction: "expense" as const,
              date: entry.paid_at!.slice(0, 10),
              amount: getInstallmentPaidAmount(entry),
              description: installment
                ? `${installment.description} (${entry.installment_number}/${installment.installment_count})`
                : `Parcela ${entry.installment_number}`,
              category: installment?.category ?? "Parcelamento",
              source: "installment" as const,
            };
          }),
        ...consortiumPaymentRows
          .filter((entry) =>
            (entry.status === "paid" || entry.status === "paid_with_discount") && !!entry.paid_at
          )
          .map((entry) => {
            const consortium = consortiumsById.get(entry.consortium_id);
            return {
              id: `consortium-${entry.id}`,
              direction: "expense" as const,
              date: entry.paid_at!.slice(0, 10),
              amount: entry.paid_amount ?? entry.amount,
              description: consortium
                ? `${consortium.name} (${entry.installment_number}/${consortium.total_installments})`
                : `Consórcio - parcela ${entry.installment_number}`,
              category: "Consórcio",
              source: "consortium" as const,
            };
          }),
      ];

      setEvents(nextEvents);
    } catch (error) {
      console.error("Erro ao carregar fluxo de caixa pessoal", error);
      toast.error("Não foi possível carregar o fluxo de caixa agora.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadCashFlow();
  }, [loadCashFlow]);

  const periodEvents = useMemo(
    () => filterPersonalCashFlowEvents(events, period),
    [events, period]
  );
  const summary = useMemo(() => summarizePersonalCashFlow(periodEvents), [periodEvents]);
  const monthlyRows = useMemo(() => buildMonthlyPersonalCashFlow(periodEvents), [periodEvents]);
  const chartData = useMemo(
    () => monthlyRows.map((row) => ({ ...row, label: formatShortMonth(row.month) })),
    [monthlyRows]
  );
  const recentEvents = useMemo(
    () => [...periodEvents].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 16),
    [periodEvents]
  );
  const periodLabel = PERSONAL_CASH_FLOW_PERIODS.find((option) => option.value === period)?.label ?? "Período";
  const currencyCode = currency === "USD" ? "USD" : "BRL";
  const pdfDefaultRange = useMemo(() => {
    const selectedRange = getPersonalCashFlowDateRange(period);
    const today = toDateKey(new Date());

    if (selectedRange) {
      return { startDate: selectedRange.start, endDate: selectedRange.end };
    }

    const firstEventDate = [...events]
      .sort((a, b) => a.date.localeCompare(b.date))[0]?.date.slice(0, 10);

    return { startDate: firstEventDate ?? today, endDate: today };
  }, [events, period]);

  const handleDownloadPdf = async ({
    startDate,
    endDate,
  }: {
    startDate: string;
    endDate: string;
  }) => {
    try {
      const selectedEvents = events.filter(
        (event) => event.date >= startDate && event.date <= endDate
      );
      const selectedSummary = summarizePersonalCashFlow(selectedEvents);

      await downloadCashFlowPdf({
        title: "Extrato do Fluxo de Caixa",
        accountLabel: "Finanças pessoais",
        startDate,
        endDate,
        currency: currencyCode,
        summary: [
          { label: "Entradas", value: selectedSummary.income, tone: "income" },
          { label: "Saídas", value: selectedSummary.expenses, tone: "expense" },
          {
            label: "Saldo",
            value: selectedSummary.balance,
            tone: selectedSummary.balance >= 0 ? "income" : "expense",
          },
        ],
        transactions: selectedEvents.map((event) => ({
          date: event.date,
          description: event.description,
          category: `${event.category} · ${SOURCE_LABELS[event.source]}`,
          direction: event.direction,
          amount: event.amount,
        })),
        filenamePrefix: "extrato-fluxo-caixa-pessoal",
      });

      toast.success("Extrato PDF baixado.");
    } catch (error) {
      console.error("Erro ao gerar extrato pessoal em PDF", error);
      toast.error("Não foi possível gerar o extrato PDF.");
      throw error;
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={WalletCards}
        iconTone="accent"
        title="Fluxo de Caixa"
        description="Entradas recebidas, saídas pagas e saldo das suas finanças pessoais"
        actions={
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled={loading}
            onClick={() => setPdfOpen(true)}
          >
            <FileDown className="h-4 w-4" />
            Extrato PDF
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Período do fluxo de caixa">
        {PERSONAL_CASH_FLOW_PERIODS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setPeriod(option.value)}
            className={cn(
              "rounded-lg border px-3.5 py-1.5 text-xs font-medium transition-colors",
              period === option.value
                ? "border-accent bg-accent/15 text-accent"
                : "border-border/60 bg-surface/60 text-text-secondary hover:border-border hover:text-text-primary"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          title={period === "all" ? "Entradas totais" : "Entradas"}
          value={formatCurrency(summary.income, currencyCode)}
          icon={ArrowUpCircle}
          variant="profit"
          loading={loading}
        />
        <StatCard
          title={period === "all" ? "Saídas totais" : "Saídas"}
          value={formatCurrency(summary.expenses, currencyCode)}
          icon={ArrowDownCircle}
          variant="expense"
          loading={loading}
        />
        <StatCard
          title="Saldo"
          value={formatCurrency(summary.balance, currencyCode)}
          icon={WalletCards}
          variant={summary.balance >= 0 ? "profit" : "expense"}
          loading={loading}
        />
      </div>

      {!loading && summary.eventCount === 0 ? (
        <Card>
          <EmptyState
            icon={WalletCards}
            title="Nenhuma movimentação no período"
            description="As entradas recebidas e saídas pagas aparecerão aqui."
          />
        </Card>
      ) : (
        <>
          <Card className="mb-6 overflow-hidden">
            <CardHeader className="flex-row items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Entradas e saídas</CardTitle>
                <p className="mt-1 text-xs text-text-secondary">{periodLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-[11px] text-text-secondary">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-profit" />Entradas</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-expense" />Saídas</span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[300px] w-full rounded-lg" />
              ) : (
                <div className="overflow-x-auto pb-1">
                  <div
                    className="h-[300px] min-w-full"
                    style={{ width: Math.max(520, chartData.length * 64) }}
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke={chartColors.grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: chartColors.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis
                          tick={{ fill: chartColors.axis, fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          width={52}
                          tickFormatter={(value) => Math.abs(Number(value)) >= 1000 ? `${(Number(value) / 1000).toFixed(1)}k` : String(Math.round(Number(value)))}
                        />
                        <Tooltip content={<CashFlowTooltip currency={currencyCode} />} cursor={{ fill: chartColors.cursor }} />
                        <Bar dataKey="income" fill={chartColors.profit} radius={[4, 4, 0, 0]} maxBarSize={34} />
                        <Bar dataKey="expenses" fill={chartColors.expense} radius={[4, 4, 0, 0]} maxBarSize={34} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo mensal</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {[...monthlyRows].reverse().map((row) => (
                      <div key={row.month} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary">{formatMonthLabel(row.month)}</p>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            <span className="text-profit">+{formatCurrency(row.income, currencyCode)}</span>
                            <span className="text-expense">-{formatCurrency(row.expenses, currencyCode)}</span>
                          </div>
                        </div>
                        <span className={cn("self-center text-sm font-bold tabular-nums", row.balance >= 0 ? "text-profit" : "text-expense")}>
                          {formatCurrency(row.balance, currencyCode)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Movimentações recentes</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {recentEvents.map((event) => {
                      const isIncome = event.direction === "income";
                      const EventIcon = isIncome ? ArrowUpCircle : ArrowDownCircle;
                      return (
                        <div key={event.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", isIncome ? "bg-profit/10 text-profit" : "bg-expense/10 text-expense")}>
                            <EventIcon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-text-primary">{event.description}</p>
                            <p className="mt-0.5 truncate text-[11px] text-text-secondary">
                              {SOURCE_LABELS[event.source]} · {formatDate(event.date)}
                            </p>
                          </div>
                          <span className={cn("shrink-0 text-sm font-bold tabular-nums", isIncome ? "text-profit" : "text-expense")}>
                            {isIncome ? "+" : "-"}{formatCurrency(event.amount, currencyCode)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
      <CashFlowPdfDialog
        open={pdfOpen}
        onOpenChange={setPdfOpen}
        defaultStartDate={pdfDefaultRange.startDate}
        defaultEndDate={pdfDefaultRange.endDate}
        onDownload={handleDownloadPdf}
      />
    </div>
  );
}

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatMonthLabel(month: string): string {
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(`${month}-15T12:00:00`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatShortMonth(month: string): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(new Date(`${month}-15T12:00:00`))
    .replace(" de ", "/")
    .replace(".", "");
}
