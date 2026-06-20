"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BarChart, Bar, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, LabelList } from "recharts";
import { Calculator, PiggyBank, Pencil, Plus, Search, TrendingDown, Trash2, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { getMonthOptions, INVESTMENT_TYPES } from "@/lib/finance";
import {
  buildFallbackMarketOverview,
  calculateCdb100CdiReturn,
  calculateTesouroSelicReturn,
  type MarketOverview,
} from "@/lib/market";
import { formatCurrency, formatDate } from "@/lib/utils";
import { investmentSchema, type InvestmentFormData } from "@/lib/validations";
import type { Investment, InvestmentContribution } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  investmentTabs,
  type InvestmentTabId,
} from "@/components/investments/InvestmentsSubSidebar";
import { MarketTicker } from "@/components/investments/MarketTicker";
import { PortfolioAllocationChart } from "@/components/investments/PortfolioAllocationChart";

interface InvestmentCategoryMeta {
  title: string;
  description: string;
}

const investmentCategoryMeta: Record<InvestmentTabId, InvestmentCategoryMeta> = {
  overview: {
    title: "Visão geral",
    description: "Uma leitura ampla dos seus aportes, filtros ativos e movimentações recentes.",
  },
  portfolio: {
    title: "Carteira",
    description: "Todos os registros que compõem a sua carteira atual.",
  },
  stocks: {
    title: "Ações",
    description: "Posições de renda variável local agrupadas em ações e ETFs.",
  },
  fiis: {
    title: "FIIs",
    description: "Fundos imobiliários que já foram registrados como investimento.",
  },
  "fixed-income": {
    title: "Renda fixa",
    description: "Tesouro, CDBs e reservas que funcionam como caixa ou proteção.",
  },
  crypto: {
    title: "Criptomoedas",
    description: "Acompanhe seus ativos digitais dentro da mesma experiência da carteira.",
  },
  international: {
    title: "Exterior",
    description: "Espaço reservado para ativos internacionais quando a base tiver esse recorte explícito.",
  },
  dividends: {
    title: "Dividendos",
    description: "Área preparada para consolidar renda passiva quando o app passar a registrar proventos.",
  },
  earnings: {
    title: "Proventos",
    description: "Uma visão futura para JCP, dividendos, amortizações e demais eventos de caixa.",
  },
  contributions: {
    title: "Aportes",
    description: "Histórico de registros lançados na sua carteira, destacando os aportes feitos.",
  },
  profitability: {
    title: "Rentabilidade",
    description: "Pronta para receber comparativos e evolução de performance quando houver métricas dedicadas.",
  },
  reports: {
    title: "Relatórios",
    description: "Seção reservada para análises consolidadas, exportações e visões executivas.",
  },
};

function matchesInvestmentTab(entry: Investment, tab: InvestmentTabId) {
  const normalizedType = entry.investment_type.trim().toLowerCase();
  const normalizedName = entry.name.trim().toLowerCase();

  switch (tab) {
    case "overview":
    case "portfolio":
    case "contributions":
      return true;
    case "stocks":
      return normalizedType === "acao" || normalizedType === "etf";
    case "fiis":
      return normalizedType === "fii";
    case "fixed-income":
      return normalizedType === "tesouro" || normalizedType === "cdb" || normalizedType === "reserva";
    case "crypto":
      return normalizedType === "crypto";
    case "international":
      return (
        normalizedType.includes("bdr")
        || normalizedName.includes("exterior")
        || normalizedName.includes("internacional")
        || normalizedName.includes("global")
        || normalizedName.includes("usa")
        || normalizedName.includes("eua")
        || normalizedName.includes("nasdaq")
        || normalizedName.includes("nyse")
        || normalizedName.includes("s&p")
        || normalizedName.includes("sp500")
      );
    case "dividends":
    case "earnings":
    case "profitability":
    case "reports":
      return false;
    default:
      return false;
  }
}

function AssetCard({
  entry,
  portfolioTotal,
  onEdit,
  onSell,
  onDelete,
}: {
  entry: Investment;
  portfolioTotal: number;
  onEdit: (e: Investment) => void;
  onSell: (e: Investment) => void;
  onDelete: (id: string) => void;
}) {
  const pct = portfolioTotal > 0 ? (entry.amount / portfolioTotal) * 100 : 0;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-surface/60 p-4 transition-all hover:border-border hover:bg-border/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-text-primary">{entry.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="default" className="text-[10px]">{entry.investment_type}</Badge>
            <span className="text-[10px] text-text-secondary">{formatDate(entry.invested_at)}</span>
          </div>
          {entry.notes && (
            <p className="mt-1 break-words text-[10px] text-text-secondary">{entry.notes}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-profit">{formatCurrency(entry.amount)}</p>
          <p className="mt-0.5 text-[10px] text-text-secondary">{pct.toFixed(1)}% carteira</p>
        </div>
      </div>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-border/30">
        <div
          className="h-full rounded-full bg-accent/60 transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="absolute right-2 top-2 flex gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
        <Button variant="ghost" size="icon-sm" onClick={() => onEdit(entry)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onSell(entry)}
          className="hover:bg-profit/10 hover:text-profit"
          title="Vender ativo"
        >
          <TrendingDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(entry.id)}
          className="hover:bg-expense/10 hover:text-expense"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function InvestmentsTable({
  entries,
  onEdit,
  onSell,
  onDelete,
}: {
  entries: Investment[];
  onEdit: (entry: Investment) => void;
  onSell: (entry: Investment) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="hidden grid-cols-[1fr_180px_140px_110px_112px] gap-4 bg-border/30 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary sm:grid">
        <span>Investimento</span>
        <span>Tipo</span>
        <span>Valor</span>
        <span>Data</span>
        <span className="text-right">Acoes</span>
      </div>
      <div className="divide-y divide-border">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-border/20 sm:grid sm:grid-cols-[1fr_180px_140px_110px_112px]"
          >
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-text-primary">{entry.name}</p>
              {entry.notes && <p className="break-words text-xs text-text-secondary">{entry.notes}</p>}
              <div className="mt-1 flex items-center gap-2 sm:hidden">
                <Badge variant="default" className="text-[10px]">
                  {entry.investment_type}
                </Badge>
                <span className="text-xs text-text-secondary">{formatDate(entry.invested_at)}</span>
              </div>
            </div>
            <div className="hidden sm:block">
              <Badge variant="default">{entry.investment_type}</Badge>
            </div>
            <div className="hidden text-sm font-semibold text-accent sm:block">{formatCurrency(entry.amount)}</div>
            <div className="hidden text-sm text-text-secondary sm:block">{formatDate(entry.invested_at)}</div>
            <div className="flex shrink-0 items-center gap-1 sm:justify-end">
              <span className="mr-2 text-sm font-semibold text-accent sm:hidden">{formatCurrency(entry.amount)}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(entry)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onSell(entry)}
                className="hover:bg-profit/10 hover:text-profit"
                title="Vender ativo"
              >
                <TrendingDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(entry.id)}
                className="hover:bg-expense/10 hover:text-expense"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatContributionDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR").format(new Date(value));
}

function ContributionsTable({ entries }: { entries: InvestmentContribution[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="hidden grid-cols-[140px_140px_1fr_140px] gap-4 bg-border/30 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary sm:grid">
        <span>Tipo</span>
        <span>Valor</span>
        <span>Descricao</span>
        <span>Data</span>
      </div>
      <div className="divide-y divide-border">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-border/20 sm:grid sm:grid-cols-[140px_140px_1fr_140px] sm:items-center"
          >
            <Badge variant={entry.type === "deposit" ? "default" : "expense"} className="w-fit">
              {entry.type === "deposit" ? "Aporte" : "Retirada"}
            </Badge>
            <span className={entry.type === "deposit" ? "text-sm font-semibold text-profit" : "text-sm font-semibold text-expense"}>
              {entry.type === "deposit" ? "+" : "-"}{formatCurrency(entry.amount)}
            </span>
            <span className="min-w-0 break-words text-sm text-text-primary">{entry.description ?? "Movimentacao da carteira"}</span>
            <span className="text-sm text-text-secondary">{formatContributionDate(entry.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface MonthlyChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function MonthlyChartTooltip({ active, payload, label }: MonthlyChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 shadow-xl">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="text-sm font-bold text-profit">{formatCurrency(payload[0].value)}</p>
    </div>
  );
}

export default function InvestmentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<Investment[]>([]);
  const [contributions, setContributions] = useState<InvestmentContribution[]>([]);
  const [marketOverview, setMarketOverview] = useState<MarketOverview>(() => buildFallbackMarketOverview());
  const [simulationAmount, setSimulationAmount] = useState(10000);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Investment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sellingEntry, setSellingEntry] = useState<Investment | null>(null);
  const [selling, setSelling] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<InvestmentTabId>(() => {
    const tabParam = searchParams.get("tab") as InvestmentTabId | null;
    return tabParam && investmentTabs.some((tab) => tab.id === tabParam) ? tabParam : "overview";
  });

  useEffect(() => {
    const tabParam = searchParams.get("tab") as InvestmentTabId | null;
    if (tabParam && investmentTabs.some((tab) => tab.id === tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const monthOptions = getMonthOptions(18);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvestmentFormData>({
    resolver: zodResolver(investmentSchema),
    defaultValues: { name: "", amount: 0, investment_type: "", invested_at: "", ticker: "", notes: "" },
  });

  const fetchEntries = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    const [investmentsResponse, contributionsResponse] = await Promise.all([
      supabase
        .from("investments")
        .select("*")
        .eq("user_id", user.id)
        .order("invested_at", { ascending: false }),
      supabase
        .from("investment_contributions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (investmentsResponse.error || contributionsResponse.error) {
      toast.error("Erro ao carregar investimentos");
      setLoading(false);
      return;
    }

    setEntries(investmentsResponse.data ?? []);
    setContributions(contributionsResponse.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    window.addEventListener("wallet:changed", fetchEntries);
    return () => window.removeEventListener("wallet:changed", fetchEntries);
  }, [fetchEntries]);

  useEffect(() => {
    let alive = true;

    fetch("/api/market/overview")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: MarketOverview | null) => {
        if (alive && data) {
          setMarketOverview(data);
        }
      })
      .catch(() => {
        if (alive) {
          setMarketOverview(buildFallbackMarketOverview());
        }
      });

    return () => {
      alive = false;
    };
  }, []);

  const openCreate = () => {
    setEditingEntry(null);
    reset({
      name: "",
      amount: 0,
      investment_type: "",
      invested_at: new Date().toISOString().split("T")[0],
      ticker: "",
      notes: "",
    });
    setModalOpen(true);
  };

  const openEdit = (entry: Investment) => {
    setEditingEntry(entry);
    reset({
      name: entry.name,
      amount: entry.amount,
      investment_type: entry.investment_type,
      invested_at: entry.invested_at,
      ticker: entry.ticker ?? "",
      notes: entry.notes ?? "",
    });
    setModalOpen(true);
  };

  const onSubmit = async (data: InvestmentFormData) => {
    try {
      if (editingEntry) {
        const { error } = await supabase
          .from("investments")
          .update(coerceMutation({
            name: data.name,
            amount: data.amount,
            investment_type: data.investment_type,
            invested_at: data.invested_at,
            ticker: data.ticker?.trim().toUpperCase() || null,
            notes: data.notes || null,
          }))
          .eq("id", editingEntry.id);

        if (error) throw error;
        toast.success("Investimento atualizado");
      } else {
        const { error } = await supabase.from("investments").insert(coerceMutation({
          user_id: userId,
          name: data.name,
          amount: data.amount,
          investment_type: data.investment_type,
          invested_at: data.invested_at,
          ticker: data.ticker?.trim().toUpperCase() || null,
          notes: data.notes || null,
        }));

        if (error) throw error;
        toast.success("Investimento registrado");
      }

      setModalOpen(false);
      await fetchEntries();
    } catch {
      toast.error("Nao foi possivel salvar o investimento");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    setDeleting(true);
    try {
      const { error } = await supabase.from("investments").delete().eq("id", deleteId);
      if (error) throw error;

      setEntries((current) => current.filter((entry) => entry.id !== deleteId));
      toast.success("Investimento excluido");
    } catch {
      toast.error("Erro ao excluir investimento");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const handleSell = async () => {
    if (!sellingEntry) return;

    setSelling(true);
    try {
      const { error } = await supabase.from("investments").delete().eq("id", sellingEntry.id);
      if (error) throw error;

      setEntries((current) => current.filter((entry) => entry.id !== sellingEntry.id));
      toast.success(`${sellingEntry.name} vendido e removido da carteira`);
    } catch {
      toast.error("Erro ao registrar venda");
    } finally {
      setSelling(false);
      setSellingEntry(null);
    }
  };

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyTotal = useMemo(
    () => entries
      .filter((entry) => entry.invested_at.startsWith(currentMonth))
      .reduce((sum, entry) => sum + entry.amount, 0),
    [entries, currentMonth]
  );
  const portfolioTotal = useMemo(() => entries.reduce((sum, entry) => sum + entry.amount, 0), [entries]);
  const uniqueTypes = [...new Set(entries.map((entry) => entry.investment_type))].sort();
  const activeTabItem = investmentTabs.find((tab) => tab.id === activeTab) ?? investmentTabs[0];
  const activeTabMeta = investmentCategoryMeta[activeTab];
  const ActiveTabIcon = activeTabItem.icon;
  const cdiReturn = calculateCdb100CdiReturn(simulationAmount, marketOverview.cdi.annualizedValue);
  const tesouroReturn = calculateTesouroSelicReturn(portfolioTotal || simulationAmount, marketOverview.selic.annualizedValue);
  const portfolioCdiMonthly = useMemo(
    () => calculateCdb100CdiReturn(portfolioTotal, marketOverview.cdi.annualizedValue).monthly,
    [portfolioTotal, marketOverview.cdi.annualizedValue]
  );

  const monthlyChartData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - (5 - i));
      const key = d.toISOString().slice(0, 7);
      const label = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", "");
      const value = entries
        .filter((e) => e.invested_at.startsWith(key))
        .reduce((s, e) => s + e.amount, 0);
      return { month: label, value };
    });
  }, [entries]);

  const hasMonthlyData = monthlyChartData.some((d) => d.value > 0);

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const matchMonth = monthFilter === "all" || entry.invested_at.startsWith(monthFilter);
      const matchType = typeFilter === "all" || entry.investment_type === typeFilter;
      const matchSearch = !search || entry.name.toLowerCase().includes(search.toLowerCase());
      return matchMonth && matchType && matchSearch;
    });
  }, [entries, monthFilter, search, typeFilter]);

  const tabEntries = useMemo(
    () => filtered.filter((entry) => matchesInvestmentTab(entry, activeTab)),
    [activeTab, filtered]
  );

  const unfilteredTabEntries = useMemo(
    () => entries.filter((entry) => matchesInvestmentTab(entry, activeTab)),
    [activeTab, entries]
  );

  const isOverviewTab = activeTab === "overview";
  const isPortfolioTab = activeTab === "portfolio";
  const hasFilterApplied = Boolean(search) || monthFilter !== "all" || typeFilter !== "all";

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={PiggyBank}
        iconTone="accent"
        title="Investimentos"
        description="Carteira global, aportes centralizados e uma base preparada para dados reais de mercado."
        actions={
          <Button onClick={openCreate} variant="secondary" className="gap-2">
            <Plus className="h-4 w-4" />
            Novo ativo
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Patrimônio total"
          value={formatCurrency(portfolioTotal)}
          icon={Wallet}
          variant="profit"
          loading={loading}
          subtitle={`${entries.length} ativo${entries.length !== 1 ? "s" : ""} cadastrado${entries.length !== 1 ? "s" : ""}`}
        />
        <StatCard
          title="Aporte no mês"
          value={formatCurrency(monthlyTotal)}
          icon={TrendingUp}
          variant={monthlyTotal >= 0 ? "accent" : "expense"}
          loading={loading}
        />
        <StatCard
          title="Tipos de ativo"
          value={String(uniqueTypes.length)}
          icon={PiggyBank}
          variant="default"
          loading={loading}
          subtitle={uniqueTypes.join(", ") || "—"}
        />
        <StatCard
          title="CDI mensal est."
          value={formatCurrency(portfolioCdiMonthly)}
          icon={Calculator}
          variant="warning"
          loading={loading}
          subtitle="Rendimento simulado"
        />
      </div>

      {/* Market ticker */}
      <div className="mb-6">
        <MarketTicker data={marketOverview} />
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row">
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full lg:w-52">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {uniqueTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar investimento..."
          leftIcon={<Search className="h-4 w-4" />}
          className="flex-1"
        />
      </div>

      {/* Main panel */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-surface/85 backdrop-blur">
        <div className="flex flex-col">
          <main className="min-w-0 flex-1 p-4 lg:p-5">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
              </div>

            ) : activeTab === "contributions" ? (
              contributions.length === 0 ? (
                <EmptyState
                  icon={PiggyBank}
                  title="Nenhuma movimentacao"
                  description="Use Novo aporte para registrar aportes e retiradas da carteira global."
                />
              ) : (
                <ContributionsTable entries={contributions} />
              )

            ) : isOverviewTab ? (
              <div className="space-y-4">
                {filtered.length > 0 && (
                  <>
                    {/* Allocation chart + Simulator */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface/60 p-5 lg:col-span-2">
                        <p className="mb-4 text-sm font-semibold text-text-primary">Distribuição da carteira</p>
                        <PortfolioAllocationChart investments={filtered} />
                      </div>

                      <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface/60 p-5">
                        <p className="mb-4 text-sm font-semibold text-text-primary">Simulador CDI / SELIC</p>
                        <div className="space-y-3">
                          <CurrencyInput value={simulationAmount} onChange={setSimulationAmount} />
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-text-secondary">Diário</span>
                              <strong className="text-profit">{formatCurrency(cdiReturn.daily)}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-secondary">Mensal</span>
                              <strong className="text-profit">{formatCurrency(cdiReturn.monthly)}</strong>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-text-secondary">Anual</span>
                              <strong className="text-profit">{formatCurrency(cdiReturn.annual)}</strong>
                            </div>
                          </div>
                          <div className="border-t border-border/40 pt-3 space-y-1.5 text-xs text-text-secondary">
                            <div className="flex justify-between">
                              <span>CDI a.a.</span>
                              <span className="font-medium text-profit">{marketOverview.cdi.annualizedValue.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span>SELIC a.a.</span>
                              <span className="font-medium text-profit">{marketOverview.selic.annualizedValue.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span>IPCA a.a.</span>
                              <span className="font-medium text-expense">{marketOverview.ipca.annualizedValue.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Carteira / CDI mês</span>
                              <strong className="text-profit">{formatCurrency(tesouroReturn.monthly)}</strong>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Monthly contributions bar chart */}
                    {hasMonthlyData && (
                      <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface/60 p-5">
                        <p className="mb-4 text-sm font-semibold text-text-primary">Aportes mensais</p>
                        <ResponsiveContainer width="100%" height={140}>
                          <BarChart data={monthlyChartData} margin={{ top: 24, right: 0, left: 0, bottom: 0 }}>
                            <XAxis
                              dataKey="month"
                              tick={{ fontSize: 11, fill: "#94A3B8" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <RechartsTooltip content={<MonthlyChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                            <Bar dataKey="value" fill="#38BDF8" radius={[4, 4, 0, 0]} maxBarSize={44}>
                              <LabelList
                                dataKey="value"
                                position="top"
                                formatter={(v: number) => v > 0 ? `R$${(v / 1000).toFixed(1)}k` : ""}
                                style={{ fontSize: 10, fill: "#94A3B8" }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}

                {filtered.length === 0 ? (
                  <EmptyState
                    icon={PiggyBank}
                    title="Nenhum investimento encontrado"
                    description={hasFilterApplied
                      ? "Ajuste os filtros para encontrar seus registros."
                      : "Comece registrando seu primeiro aporte."}
                    actionLabel={!hasFilterApplied ? "+ Novo investimento" : undefined}
                    onAction={!hasFilterApplied ? openCreate : undefined}
                  />
                ) : (
                  <InvestmentsTable
                    entries={filtered}
                    onEdit={openEdit}
                    onSell={setSellingEntry}
                    onDelete={setDeleteId}
                  />
                )}
              </div>

            ) : isPortfolioTab ? (
              <div className="space-y-4">
                {tabEntries.length === 0 ? (
                  <EmptyState
                    icon={Wallet}
                    title="Carteira vazia"
                    description={hasFilterApplied
                      ? "Ajuste os filtros para ver seus ativos."
                      : "Registre seu primeiro investimento para compor a carteira."}
                    actionLabel={!hasFilterApplied ? "+ Novo investimento" : undefined}
                    onAction={!hasFilterApplied ? openCreate : undefined}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-text-secondary">
                        {tabEntries.length} ativo{tabEntries.length !== 1 ? "s" : ""} ·{" "}
                        <span className="font-semibold text-profit">
                          {formatCurrency(tabEntries.reduce((s, e) => s + e.amount, 0))}
                        </span>
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {tabEntries.map((entry) => (
                        <AssetCard
                          key={entry.id}
                          entry={entry}
                          portfolioTotal={portfolioTotal}
                          onEdit={openEdit}
                          onSell={setSellingEntry}
                          onDelete={setDeleteId}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

            ) : (
              <div className="space-y-4">
                <Card className="border-border/70 bg-surface/90">
                  <CardHeader>
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-accent/12 p-2.5 text-accent">
                        <ActiveTabIcon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <CardTitle>{activeTabMeta.title}</CardTitle>
                        <CardDescription className="mt-1">
                          {activeTabMeta.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  {tabEntries.length > 0 && (
                    <CardContent>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                        <span className="rounded-full border border-border/70 bg-background/50 px-3 py-1">
                          {tabEntries.length} registro{tabEntries.length !== 1 ? "s" : ""}
                        </span>
                        <span className="rounded-full border border-border/70 bg-background/50 px-3 py-1">
                          {formatCurrency(tabEntries.reduce((sum, entry) => sum + entry.amount, 0))}
                        </span>
                        <span className="rounded-full border border-border/70 bg-background/50 px-3 py-1">
                          {portfolioTotal > 0
                            ? `${((tabEntries.reduce((s, e) => s + e.amount, 0) / portfolioTotal) * 100).toFixed(1)}% carteira`
                            : "0% carteira"
                          }
                        </span>
                      </div>
                    </CardContent>
                  )}
                </Card>

                {tabEntries.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {tabEntries.map((entry) => (
                      <AssetCard
                        key={entry.id}
                        entry={entry}
                        portfolioTotal={portfolioTotal}
                        onEdit={openEdit}
                        onSell={setSellingEntry}
                        onDelete={setDeleteId}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={activeTabItem.icon}
                    title={
                      unfilteredTabEntries.length > 0
                        ? `Nenhum registro visível em ${activeTabMeta.title}`
                        : `${activeTabMeta.title} em preparação`
                    }
                    description={
                      unfilteredTabEntries.length > 0
                        ? "Os filtros atuais esconderam essa categoria. Ajuste mês, tipo ou busca para reencontrar os investimentos."
                        : hasFilterApplied
                          ? "Ainda não há registros suficientes para compor esta visão com os filtros ativos."
                          : "Essa categoria já tem espaço reservado e pode receber dados assim que você começar a registrar esse tipo de investimento."
                    }
                    actionLabel={
                      !hasFilterApplied
                      && activeTab !== "dividends"
                      && activeTab !== "earnings"
                      && activeTab !== "profitability"
                      && activeTab !== "reports"
                        ? "+ Novo investimento"
                        : undefined
                    }
                    onAction={
                      !hasFilterApplied
                      && activeTab !== "dividends"
                      && activeTab !== "earnings"
                      && activeTab !== "profitability"
                      && activeTab !== "reports"
                        ? openCreate
                        : undefined
                    }
                  />
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Editar investimento" : "Novo investimento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <FormField label="Nome" error={errors.name?.message} required>
              <Input placeholder="Ex: Tesouro Selic" error={errors.name?.message} {...register("name")} />
            </FormField>

            <FormField label="Ticker / Símbolo" error={errors.ticker?.message}>
              <Input placeholder="Ex: PETR4, MXRF11, BTC" error={errors.ticker?.message} {...register("ticker")} />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Valor" error={errors.amount?.message} required>
                <Controller
                  name="amount"
                  control={control}
                  render={({ field }) => (
                    <CurrencyInput value={field.value} onChange={field.onChange} error={errors.amount?.message} />
                  )}
                />
              </FormField>
              <FormField label="Data do aporte" error={errors.invested_at?.message} required>
                <Input type="date" error={errors.invested_at?.message} {...register("invested_at")} />
              </FormField>
            </div>

            <FormField label="Tipo" error={errors.investment_type?.message} required>
              <Controller
                name="investment_type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger error={errors.investment_type?.message}>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {INVESTMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </FormField>

            <FormField label="Observacoes">
              <Textarea rows={3} placeholder="Notas opcionais..." {...register("notes")} />
            </FormField>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {editingEntry ? "Salvar" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Excluir investimento"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        loading={deleting}
      />

      <ConfirmDialog
        open={sellingEntry !== null}
        onOpenChange={(open) => !open && setSellingEntry(null)}
        title="Vender ativo"
        description={sellingEntry ? `Confirmar venda de "${sellingEntry.name}" (${formatCurrency(sellingEntry.amount)})? O ativo será removido da carteira.` : ""}
        confirmLabel="Confirmar venda"
        onConfirm={handleSell}
        loading={selling}
      />
    </div>
  );
}
