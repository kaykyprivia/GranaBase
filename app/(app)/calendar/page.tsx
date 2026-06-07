"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Landmark, PiggyBank, Plus, Target, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { buildFinancialEvents, getCalendarMatrix, getEventTone, type FinancialEvent } from "@/lib/finance";
import { getEffectiveInstallmentStatus, getInstallmentStatusLabel, type EffectiveInstallmentStatus } from "@/lib/installments";
import { cn, formatCurrency, formatDate, getMonthYear } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import type { Bill, ExpenseEntry, FinancialGoal, IncomeEntry, InstallmentPayment, InvestmentContribution } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageIntro } from "@/components/shared/PageIntro";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/StatCard";

type QuickAddType = "income" | "expense" | "bill";

type InstallmentPaymentWithName = InstallmentPayment & {
  installments: { description: string; installment_count: number } | null;
};

interface CalendarPayload {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  bills: Bill[];
  installmentPayments: InstallmentPaymentWithName[];
  investmentContributions: InvestmentContribution[];
  goals: FinancialGoal[];
}

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

type TypeFilter = "all" | "income" | "expense" | "bill" | "installment";

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "income", label: "Entradas" },
  { value: "expense", label: "Gastos" },
  { value: "bill", label: "Contas" },
  { value: "installment", label: "Parcelas" },
];

function getSign(event: FinancialEvent) {
  if (event.type === "income" || (event.type === "investment" && event.status === "deposit")) return "+";
  if (event.type === "goal") return "";
  return "-";
}

export default function CalendarPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<QuickAddType>("expense");
  const [quickAddDescription, setQuickAddDescription] = useState("");
  const [quickAddAmount, setQuickAddAmount] = useState(0);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [payload, setPayload] = useState<CalendarPayload>({
    income: [],
    expenses: [],
    bills: [],
    installmentPayments: [],
    investmentContributions: [],
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
      contributionResponse,
      goalsResponse,
    ] = await Promise.all([
      supabase.from("income_entries").select("*").eq("user_id", user.id),
      supabase.from("expense_entries").select("*").eq("user_id", user.id),
      supabase.from("bills").select("*").eq("user_id", user.id),
      supabase.from("installment_payments").select("*, installments(description, installment_count)").eq("user_id", user.id),
      supabase.from("investment_contributions").select("*").eq("user_id", user.id),
      supabase.from("financial_goals").select("*").eq("user_id", user.id),
    ]);

    const error =
      incomeResponse.error ||
      expenseResponse.error ||
      billsResponse.error ||
      installmentResponse.error ||
      contributionResponse.error ||
      goalsResponse.error;

    if (error) {
      toast.error("Erro ao carregar calendario financeiro");
      setLoading(false);
      return;
    }

    setPayload({
      income: incomeResponse.data ?? [],
      expenses: expenseResponse.data ?? [],
      bills: billsResponse.data ?? [],
      installmentPayments: (installmentResponse.data ?? []) as InstallmentPaymentWithName[],
      investmentContributions: contributionResponse.data ?? [],
      goals: goalsResponse.data ?? [],
    });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const events = useMemo(() => {
    const installmentEvents: FinancialEvent[] = payload.installmentPayments.map((payment) => ({
      id: payment.id,
      date: payment.due_date,
      title: payment.installments?.description ?? `Parcela ${payment.installment_number}`,
      amount: payment.amount,
      type: "installment" as const,
      subtitle: `Parcela ${payment.installment_number}${payment.installments ? `/${payment.installments.installment_count}` : ""}`,
      status: getEffectiveInstallmentStatus(payment),
    }));

    const baseEvents = buildFinancialEvents({
      ...payload,
      installmentPayments: [],
      investments: [],
      investmentContributions: payload.investmentContributions,
    });

    return [...baseEvents, ...installmentEvents].sort((a, b) => a.date.localeCompare(b.date));
  }, [payload]);

  const monthKey = getMonthYear(referenceDate);
  const monthLabel = referenceDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const monthMatrix = useMemo(() => getCalendarMatrix(referenceDate), [referenceDate]);

  // Unfiltered month events for stat cards summary
  const monthEvents = useMemo(
    () => events.filter((event) => event.date.startsWith(monthKey)),
    [events, monthKey]
  );

  // Events filtered by the user's type selection
  const filteredEvents = useMemo(() => {
    if (typeFilter === "all") return events;
    return events.filter((e) => e.type === typeFilter);
  }, [events, typeFilter]);

  const filteredMonthEvents = useMemo(
    () => filteredEvents.filter((e) => e.date.startsWith(monthKey)),
    [filteredEvents, monthKey]
  );

  const selectedEvents = useMemo(
    () => filteredEvents.filter((event) => event.date === selectedDate),
    [filteredEvents, selectedDate]
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
          accumulator.investments += event.status === "withdraw" ? -event.amount : event.amount;
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
    return filteredEvents.reduce<Record<string, FinancialEvent[]>>((accumulator, event) => {
      accumulator[event.date] = [...(accumulator[event.date] ?? []), event];
      return accumulator;
    }, {});
  }, [filteredEvents]);

  const getEventStatusLabel = (event: FinancialEvent) => {
    if (event.type === "installment" && event.status) {
      return getInstallmentStatusLabel(event.status as EffectiveInstallmentStatus);
    }
    if (event.status === "deposit") return "Aporte";
    if (event.status === "withdraw") return "Retirada";
    return event.status ?? event.type;
  };

  const getEventStatusVariant = (event: FinancialEvent) => {
    if (event.status === "paid_with_discount") return "paid_with_discount" as const;
    if (event.status === "paid" || event.status === "overdue" || event.status === "pending") return event.status;
    if (event.status === "deposit") return "profit" as const;
    if (event.status === "withdraw") return "expense" as const;
    return "secondary" as const;
  };

  const openQuickAdd = () => {
    setQuickAddDescription("");
    setQuickAddAmount(0);
    setQuickAddType("expense");
    setQuickAddOpen(true);
  };

  const handleQuickAdd = async () => {
    if (!quickAddDescription.trim() || quickAddAmount <= 0) return;
    setQuickAddSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setQuickAddSaving(false); return; }

    let err: { message: string } | null = null;

    if (quickAddType === "income") {
      const { error } = await supabase.from("income_entries").insert(coerceMutation({
        user_id: user.id,
        description: quickAddDescription.trim(),
        amount: quickAddAmount,
        received_at: selectedDate,
        category: "Outro",
        payment_method: "Pix",
      }));
      err = error;
    } else if (quickAddType === "expense") {
      const { error } = await supabase.from("expense_entries").insert(coerceMutation({
        user_id: user.id,
        description: quickAddDescription.trim(),
        amount: quickAddAmount,
        spent_at: selectedDate,
        category: "Outro",
        payment_method: "Pix",
      }));
      err = error;
    } else {
      const { error } = await supabase.from("bills").insert(coerceMutation({
        user_id: user.id,
        name: quickAddDescription.trim(),
        amount: quickAddAmount,
        due_date: selectedDate,
        category: "Outro",
        status: "pending",
      }));
      err = error;
    }

    setQuickAddSaving(false);
    if (err) { toast.error("Erro ao adicionar"); return; }
    toast.success("Adicionado com sucesso!");
    setQuickAddOpen(false);
    fetchData();
  };

  const navigatePrev = () =>
    setReferenceDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const navigateNext = () =>
    setReferenceDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={CalendarDays}
        iconTone="warning"
        title="Calendario financeiro"
        description="Veja vencimentos, aportes, entradas e gastos organizados por data."
      />

      {/* Stat cards — 2 cols on mobile, 4 on xl */}
      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard title="Entradas no mes" value={formatCurrency(stats.income)} icon={TrendingUp} variant="profit" loading={loading} />
        <StatCard title="Saidas previstas" value={formatCurrency(stats.outflow)} icon={TrendingDown} variant="expense" loading={loading} />
        <StatCard title="Aportes liquidos" value={formatCurrency(stats.investments)} icon={PiggyBank} variant={stats.investments >= 0 ? "accent" : "expense"} loading={loading} />
        <StatCard title="Prazos de metas" value={String(stats.goalDeadlines)} icon={Target} variant="warning" loading={loading} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {/* Calendar card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="capitalize">{monthLabel}</CardTitle>
              <p className="mt-1 text-sm text-text-secondary">Toque em um dia para ver os eventos.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={navigatePrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon-sm" onClick={navigateNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Type filter chips */}
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setTypeFilter(f.value)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    typeFilter === f.value
                      ? "bg-accent text-white"
                      : "bg-border/50 text-text-secondary hover:bg-border"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Weekday headers */}
            <div className="mb-2 grid grid-cols-7 gap-1 sm:gap-2">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="py-1 text-center text-[10px] sm:text-xs font-medium uppercase tracking-wide text-text-secondary"
                >
                  {day.slice(0, 3)}
                </div>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
                {Array.from({ length: 35 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 sm:h-28 rounded-xl sm:rounded-2xl" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {monthMatrix.map(({ date, currentMonth }) => {
                    const isoDate = date.toISOString().split("T")[0];
                    const dayEvents = dailyGroups[isoDate] ?? [];
                    const isSelected = isoDate === selectedDate;
                    const incomeTotal = dayEvents
                      .filter((e) => e.type === "income")
                      .reduce((sum, e) => sum + e.amount, 0);
                    const outflowTotal = dayEvents
                      .filter((e) => e.type === "expense" || e.type === "bill" || e.type === "installment")
                      .reduce((sum, e) => sum + e.amount, 0);
                    const net = incomeTotal - outflowTotal;
                    const hasNet = incomeTotal > 0 || outflowTotal > 0;

                    return (
                      <button
                        key={isoDate}
                        type="button"
                        onClick={() => setSelectedDate(isoDate)}
                        className={cn(
                          "relative min-h-[3.5rem] sm:min-h-28 rounded-xl sm:rounded-2xl border p-1.5 sm:p-3 text-left transition-all overflow-hidden",
                          currentMonth
                            ? "border-border bg-surface/60 hover:border-accent/40"
                            : "border-border/40 bg-background/20 text-text-secondary/60",
                          isSelected && "border-accent bg-accent/10 shadow-[0_0_0_1px_rgba(56,189,248,0.3)]"
                        )}
                      >
                        {/* Mobile net indicator bar at bottom */}
                        {hasNet && (
                          <span
                            className={cn(
                              "absolute bottom-0 left-0 right-0 h-0.5 sm:hidden",
                              net > 0 ? "bg-profit/60" : "bg-expense/60"
                            )}
                          />
                        )}

                        {/* Day number + badge */}
                        <div className="flex items-start justify-between gap-0.5">
                          <span
                            className={cn(
                              "text-xs sm:text-sm font-semibold leading-none",
                              currentMonth ? "text-text-primary" : "text-text-secondary/60"
                            )}
                          >
                            {date.getDate()}
                          </span>
                          {dayEvents.length > 0 && (
                            <Badge
                              variant="secondary"
                              className="hidden sm:inline-flex h-4 px-1 py-0 text-[10px]"
                            >
                              {dayEvents.length}
                            </Badge>
                          )}
                        </div>

                        {/* Amounts + net: sm+ only */}
                        <div className="hidden sm:block mt-2 space-y-0.5">
                          {incomeTotal > 0 && (
                            <p className="truncate text-[11px] font-medium text-profit">
                              + {formatCurrency(incomeTotal)}
                            </p>
                          )}
                          {outflowTotal > 0 && (
                            <p className="truncate text-[11px] font-medium text-expense">
                              - {formatCurrency(outflowTotal)}
                            </p>
                          )}
                          {hasNet && (
                            <p className={cn(
                              "truncate text-[10px] font-bold border-t border-border/30 pt-0.5",
                              net >= 0 ? "text-profit" : "text-expense"
                            )}>
                              = {net >= 0 ? "+" : ""}{formatCurrency(net)}
                            </p>
                          )}
                        </div>

                        {/* Event dots */}
                        <div className="mt-1 flex flex-wrap gap-0.5 sm:gap-1">
                          {dayEvents.slice(0, 4).map((event) => (
                            <span
                              key={event.id}
                              className={cn(
                                "h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-full",
                                getEventTone(event.type).replace("text-", "bg-")
                              )}
                            />
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Mobile day detail accordion (hidden on xl where side panel takes over) */}
                <div className="mt-4 xl:hidden rounded-2xl border border-border/70 bg-background/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-semibold text-text-primary">{formatDate(selectedDate)}</p>
                    <button
                      type="button"
                      onClick={openQuickAdd}
                      className="flex items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/25 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      Adicionar
                    </button>
                  </div>
                  {selectedEvents.length === 0 ? (
                    <EmptyState
                      icon={Landmark}
                      title="Sem eventos neste dia"
                      description="Selecione outro dia no calendario acima."
                    />
                  ) : (
                    <div className="space-y-2">
                      {selectedEvents.map((event) => (
                        <div
                          key={event.id}
                          className="rounded-xl border border-border/70 bg-background/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text-primary">{event.title}</p>
                              {event.subtitle && (
                                <p className="mt-0.5 truncate text-xs text-text-secondary">{event.subtitle}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={cn("text-sm font-semibold", getEventTone(event.type))}>
                                {getSign(event)}{formatCurrency(event.amount)}
                              </p>
                              <Badge variant={getEventStatusVariant(event)} className="mt-1 text-[10px]">
                                {getEventStatusLabel(event)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Side panel — hidden on mobile, visible on xl */}
        <div className="hidden xl:block">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{formatDate(selectedDate)}</CardTitle>
                <p className="mt-1 text-sm text-text-secondary">Detalhamento do dia selecionado.</p>
              </div>
              <Button variant="outline" size="icon-sm" onClick={openQuickAdd} title="Adicionar evento">
                <Plus className="h-4 w-4" />
              </Button>
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
                          {event.subtitle && (
                            <p className="mt-1 text-sm text-text-secondary">{event.subtitle}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className={cn("text-sm font-semibold", getEventTone(event.type))}>
                            {getSign(event)}{formatCurrency(event.amount)}
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

              {!loading && filteredMonthEvents.length > 0 && (
                <div className="mt-6 border-t border-border pt-5">
                  <p className="mb-3 text-sm font-semibold text-text-primary">Agenda do mes</p>
                  <div className="space-y-2">
                    {filteredMonthEvents.slice(0, 8).map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-text-primary">{event.title}</p>
                          <p className="text-xs text-text-secondary">{formatDate(event.date)}</p>
                        </div>
                        <span className={cn("text-sm font-semibold", getEventTone(event.type))}>
                          {formatCurrency(event.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick add dialog */}
      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Adicionar em {formatDate(selectedDate)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Type selector */}
            <div className="flex gap-2">
              {(["expense", "income", "bill"] as QuickAddType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setQuickAddType(t)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    quickAddType === t
                      ? t === "income"
                        ? "bg-profit/20 text-profit border border-profit/30"
                        : t === "expense"
                          ? "bg-expense/20 text-expense border border-expense/30"
                          : "bg-warning/20 text-warning border border-warning/30"
                      : "bg-border/40 text-text-secondary hover:bg-border"
                  )}
                >
                  {t === "income" ? "Entrada" : t === "expense" ? "Gasto" : "Conta"}
                </button>
              ))}
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">Descricao</label>
              <Input
                placeholder="Ex: Almoço, Salário..."
                value={quickAddDescription}
                onChange={(e) => setQuickAddDescription(e.target.value)}
              />
            </div>

            {/* Amount */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">Valor</label>
              <CurrencyInput value={quickAddAmount} onChange={setQuickAddAmount} />
            </div>

            {/* Save */}
            <Button
              className="w-full"
              onClick={handleQuickAdd}
              disabled={quickAddSaving || !quickAddDescription.trim() || quickAddAmount <= 0}
            >
              {quickAddSaving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
