"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Landmark, PiggyBank, Target, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { buildFinancialEvents, getCalendarMatrix, getEventTone, type FinancialEvent } from "@/lib/finance";
import { getInstallmentStatusLabel, type EffectiveInstallmentStatus } from "@/lib/installments";
import { cn, formatCurrency, formatDate, getMonthYear } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { Bill, ExpenseEntry, FinancialGoal, IncomeEntry, InstallmentPayment, Investment } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageIntro } from "@/components/shared/PageIntro";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";

interface CalendarPayload {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  bills: Bill[];
  installmentPayments: InstallmentPayment[];
  investments: Investment[];
  goals: FinancialGoal[];
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

export default function CalendarPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payload, setPayload] = useState<CalendarPayload>({
    income: [],
    expenses: [],
    bills: [],
    installmentPayments: [],
    investments: [],
    goals: [],
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

    const [
      incomeResponse,
      expenseResponse,
      billsResponse,
      installmentResponse,
      investmentResponse,
      goalsResponse,
    ] = await Promise.all([
      supabase.from("income_entries").select("*").eq("user_id", user.id),
      supabase.from("expense_entries").select("*").eq("user_id", user.id),
      supabase.from("bills").select("*").eq("user_id", user.id),
      supabase.from("installment_payments").select("*").eq("user_id", user.id),
      supabase.from("investments").select("*").eq("user_id", user.id),
      supabase.from("financial_goals").select("*").eq("user_id", user.id),
    ]);

    const error = incomeResponse.error || expenseResponse.error || billsResponse.error || installmentResponse.error || investmentResponse.error || goalsResponse.error;

    if (error) {
      toast.error("Erro ao carregar calendario financeiro");
      setLoading(false);
      return;
    }

    setPayload({
      income: incomeResponse.data ?? [],
      expenses: expenseResponse.data ?? [],
      bills: billsResponse.data ?? [],
      installmentPayments: installmentResponse.data ?? [],
      investments: investmentResponse.data ?? [],
      goals: goalsResponse.data ?? [],
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const events = useMemo(
    () => buildFinancialEvents(payload),
    [payload]
  );

  const monthKey = getMonthYear(referenceDate);
  const monthLabel = referenceDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthMatrix = useMemo(() => getCalendarMatrix(referenceDate), [referenceDate]);

  const monthEvents = useMemo(
    () => events.filter((event) => event.date.startsWith(monthKey)),
    [events, monthKey]
  );

  const selectedEvents = useMemo(
    () => events.filter((event) => event.date === selectedDate),
    [events, selectedDate]
  );

  const stats = useMemo(() => {
    return monthEvents.reduce(
      (accumulator, event) => {
        if (event.type === "income") {
          accumulator.income += event.amount;
        }
        if (event.type === "expense" || event.type === "bill" || event.type === "installment") {
          accumulator.outflow += event.amount;
        }
        if (event.type === "investment") {
          accumulator.investments += event.amount;
        }
        if (event.type === "goal") {
          accumulator.goalDeadlines += 1;
        }
        return accumulator;
      },
      { income: 0, outflow: 0, investments: 0, goalDeadlines: 0 }
    );
  }, [monthEvents]);

  const dailyGroups = useMemo(() => {
    return events.reduce<Record<string, FinancialEvent[]>>((accumulator, event) => {
      accumulator[event.date] = [...(accumulator[event.date] ?? []), event];
      return accumulator;
    }, {});
  }, [events]);

  const getEventStatusLabel = (event: FinancialEvent) => {
    if (event.type === "installment" && event.status) {
      return getInstallmentStatusLabel(event.status as EffectiveInstallmentStatus);
    }

    return event.status ?? event.type;
  };

  const getEventStatusVariant = (event: FinancialEvent) => {
    if (event.status === "paid_with_discount") {
      return "paid_with_discount" as const;
    }

    if (event.status === "paid" || event.status === "overdue" || event.status === "pending") {
      return event.status;
    }

    return "secondary" as const;
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={CalendarDays}
        iconTone="warning"
        title="Calendario financeiro"
        description="Veja vencimentos, aportes, entradas e gastos organizados por data."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Entradas no mes" value={formatCurrency(stats.income)} icon={TrendingUp} variant="profit" loading={loading} />
        <StatCard title="Saidas previstas" value={formatCurrency(stats.outflow)} icon={TrendingDown} variant="expense" loading={loading} />
        <StatCard title="Aportes no mes" value={formatCurrency(stats.investments)} icon={PiggyBank} variant="accent" loading={loading} />
        <StatCard title="Prazos de metas" value={String(stats.goalDeadlines)} icon={Target} variant="warning" loading={loading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="capitalize">{monthLabel}</CardTitle>
              <p className="mt-1 text-sm text-text-secondary">Clique em um dia para ver a agenda financeira.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={() => setReferenceDate((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={() => setReferenceDate((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 grid grid-cols-7 gap-2">
              {WEEKDAYS.map((day) => (
                <div key={day} className="px-2 py-1 text-center text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {day}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-7 gap-2">
                {monthMatrix.map(({ date, currentMonth }) => {
                  const isoDate = date.toISOString().split("T")[0];
                  const dayEvents = dailyGroups[isoDate] ?? [];
                  const isSelected = isoDate === selectedDate;
                  const incomeTotal = dayEvents.filter((event) => event.type === "income").reduce((sum, event) => sum + event.amount, 0);
                  const outflowTotal = dayEvents
                    .filter((event) => event.type === "expense" || event.type === "bill" || event.type === "installment")
                    .reduce((sum, event) => sum + event.amount, 0);

                  return (
                    <button
                      key={isoDate}
                      type="button"
                      onClick={() => setSelectedDate(isoDate)}
                      className={cn(
                        "min-h-28 rounded-2xl border p-3 text-left transition-all",
                        currentMonth ? "border-border bg-surface/60 hover:border-accent/40" : "border-border/40 bg-background/20 text-text-secondary/60",
                        isSelected && "border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]"
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className={cn("text-sm font-semibold", currentMonth ? "text-text-primary" : "text-text-secondary/60")}>
                          {date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <Badge variant="secondary" className="text-[10px]">
                            {dayEvents.length}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1">
                        {incomeTotal > 0 && <p className="truncate text-[11px] font-medium text-profit">+ {formatCurrency(incomeTotal)}</p>}
                        {outflowTotal > 0 && <p className="truncate text-[11px] font-medium text-expense">- {formatCurrency(outflowTotal)}</p>}
                        <div className="flex flex-wrap gap-1 pt-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <span key={event.id} className={cn("h-1.5 w-1.5 rounded-full", getEventTone(event.type).replace("text-", "bg-"))} />
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{formatDate(selectedDate)}</CardTitle>
            <p className="text-sm text-text-secondary">Detalhamento do dia selecionado.</p>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : selectedEvents.length === 0 ? (
              <EmptyState
                icon={Landmark}
                title="Sem eventos neste dia"
                description="Selecione outra data ou registre movimentacoes para preencher a agenda."
              />
            ) : (
              <div className="space-y-3">
                {selectedEvents.map((event) => (
                  <div key={event.id} className="rounded-2xl border border-border/70 bg-background/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">{event.title}</p>
                        {event.subtitle && <p className="mt-1 text-sm text-text-secondary">{event.subtitle}</p>}
                      </div>
                      <div className="text-right">
                        <p className={cn("text-sm font-semibold", getEventTone(event.type))}>
                          {(event.type === "income" ? "+" : "-").replace("-", event.type === "goal" ? "" : "-")}
                          {formatCurrency(event.amount)}
                        </p>
                        <Badge variant={getEventStatusVariant(event)} className="mt-2 text-[10px]">
                          {getEventStatusLabel(event)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && monthEvents.length > 0 && (
              <div className="mt-6 border-t border-border pt-5">
                <p className="mb-3 text-sm font-semibold text-text-primary">Agenda do mes</p>
                <div className="space-y-2">
                  {monthEvents.slice(0, 8).map((event) => (
                    <div key={event.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{event.title}</p>
                        <p className="text-xs text-text-secondary">{formatDate(event.date)}</p>
                      </div>
                      <span className={cn("text-sm font-semibold", getEventTone(event.type))}>{formatCurrency(event.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
