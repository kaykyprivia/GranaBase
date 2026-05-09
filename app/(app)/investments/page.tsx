"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Calculator, Landmark, PiggyBank, Plus, Search, Pencil, Trash2, TrendingUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { getMonthOptions, INVESTMENT_TYPES } from "@/lib/finance";
import { buildFallbackMarketOverview, calculateCdb100CdiReturn, calculateTesouroSelicReturn, type MarketOverview } from "@/lib/market";
import { formatCurrency, formatDate } from "@/lib/utils";
import { investmentSchema, type InvestmentFormData } from "@/lib/validations";
import type { Investment, InvestmentContribution, InvestmentWallet } from "@/types/database";
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
import { GlobalContributionButton } from "@/components/wallet/WalletContributionProvider";
import {
  InvestmentsSubSidebar,
  investmentTabs,
  type InvestmentTabId,
} from "@/components/investments/InvestmentsSubSidebar";

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
    description: "Todos os registros que compõem a sua carteira atual, mantendo os filtros da página.",
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

function InvestmentsTable({
  entries,
  onEdit,
  onDelete,
}: {
  entries: Investment[];
  onEdit: (entry: Investment) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="hidden grid-cols-[1fr_180px_140px_110px_88px] gap-4 bg-border/30 px-5 py-3 text-xs font-medium uppercase tracking-wide text-text-secondary sm:grid">
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
            className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-border/20 sm:grid sm:grid-cols-[1fr_180px_140px_110px_88px]"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">{entry.name}</p>
              {entry.notes && <p className="truncate text-xs text-text-secondary">{entry.notes}</p>}
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
            <span className="min-w-0 truncate text-sm text-text-primary">{entry.description ?? "Movimentacao da carteira"}</span>
            <span className="text-sm text-text-secondary">{formatContributionDate(entry.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InvestmentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<Investment[]>([]);
  const [wallet, setWallet] = useState<InvestmentWallet | null>(null);
  const [contributions, setContributions] = useState<InvestmentContribution[]>([]);
  const [marketOverview, setMarketOverview] = useState<MarketOverview>(() => buildFallbackMarketOverview());
  const [simulationAmount, setSimulationAmount] = useState(10000);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Investment | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [monthFilter, setMonthFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<InvestmentTabId>("overview");

  const monthOptions = getMonthOptions(18);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvestmentFormData>({
    resolver: zodResolver(investmentSchema),
    defaultValues: { name: "", amount: 0, investment_type: "", invested_at: "", notes: "" },
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
    const [investmentsResponse, walletResponse, contributionsResponse] = await Promise.all([
      supabase
        .from("investments")
        .select("*")
        .eq("user_id", user.id)
        .order("invested_at", { ascending: false }),
      supabase.from("investment_wallets").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("investment_contributions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    if (investmentsResponse.error || walletResponse.error || contributionsResponse.error) {
      toast.error("Erro ao carregar investimentos");
      setLoading(false);
      return;
    }

    setEntries(investmentsResponse.data ?? []);
    setWallet(walletResponse.data ?? null);
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
            notes: data.notes || null,
          }))
          .eq("id", editingEntry.id);

        if (error) {
          throw error;
        }

        toast.success("Investimento atualizado");
      } else {
        const { error } = await supabase.from("investments").insert(coerceMutation({
          user_id: userId,
          name: data.name,
          amount: data.amount,
          investment_type: data.investment_type,
          invested_at: data.invested_at,
          notes: data.notes || null,
        }));

        if (error) {
          throw error;
        }

        toast.success("Investimento registrado");
      }

      setModalOpen(false);
      await fetchEntries();
    } catch {
      toast.error("Nao foi possivel salvar o investimento");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) {
      return;
    }

    setDeleting(true);
    try {
      const { error } = await supabase.from("investments").delete().eq("id", deleteId);

      if (error) {
        throw error;
      }

      setEntries((current) => current.filter((entry) => entry.id !== deleteId));
      toast.success("Investimento excluido");
    } catch {
      toast.error("Erro ao excluir investimento");
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyDeposits = contributions
    .filter((entry) => entry.created_at.startsWith(currentMonth) && entry.type === "deposit")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyWithdrawals = contributions
    .filter((entry) => entry.created_at.startsWith(currentMonth) && entry.type === "withdraw")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyTotal = monthlyDeposits - monthlyWithdrawals;
  const totalAll = wallet?.total_balance ?? 0;
  const uniqueTypes = [...new Set(entries.map((entry) => entry.investment_type))].sort();
  const activeTabItem = investmentTabs.find((tab) => tab.id === activeTab) ?? investmentTabs[0];
  const activeTabMeta = investmentCategoryMeta[activeTab];
  const ActiveTabIcon = activeTabItem.icon;
  const cdiReturn = calculateCdb100CdiReturn(simulationAmount, marketOverview.cdi.annualizedValue);
  const tesouroReturn = calculateTesouroSelicReturn(totalAll || simulationAmount, marketOverview.selic.annualizedValue);

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
  const hasFilterApplied = Boolean(search) || monthFilter !== "all" || typeFilter !== "all";

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={PiggyBank}
        iconTone="accent"
        title="Investimentos"
        description="Carteira global, aportes centralizados e uma base preparada para dados reais de mercado."
        actions={
          <div className="flex flex-wrap gap-2">
            <GlobalContributionButton />
            <Button onClick={openCreate} variant="secondary" className="gap-2">
              <Plus className="h-4 w-4" />
              Novo ativo
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Movimento no mes" value={formatCurrency(monthlyTotal)} icon={TrendingUp} variant={monthlyTotal >= 0 ? "accent" : "expense"} loading={loading} />
        <StatCard title="Patrimonio total" value={formatCurrency(totalAll)} icon={Wallet} variant="profit" loading={loading} subtitle="Carteira global" />
        <StatCard title="Tipos ativos" value={String(uniqueTypes.length)} icon={PiggyBank} variant="default" loading={loading} />
        <StatCard title="Movimentacoes" value={String(contributions.length)} icon={TrendingUp} variant="warning" loading={loading} subtitle={`${filtered.length} ativos exibindo`} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
        <Card className="border-border/70 bg-surface/90">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-profit/15 p-2.5 text-profit">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">CDB 100% CDI</CardTitle>
                <CardDescription className="mt-1">CDI anualizado: {marketOverview.cdi.annualizedValue.toFixed(2)}%</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary">Diario</span>
              <strong className="text-profit">{formatCurrency(cdiReturn.daily)}</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary">Mensal</span>
              <strong className="text-profit">{formatCurrency(cdiReturn.monthly)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-surface/90">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent/15 p-2.5 text-accent">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Quanto renderia hoje</CardTitle>
                <CardDescription className="mt-1">Simulacao bruta a 100% CDI</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <CurrencyInput value={simulationAmount} onChange={setSimulationAmount} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">Rendimento mensal</span>
              <strong className="text-profit">{formatCurrency(cdiReturn.monthly)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-surface/90">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-warning/15 p-2.5 text-warning">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Tesouro Selic</CardTitle>
                <CardDescription className="mt-1">Selic: {marketOverview.selic.annualizedValue.toFixed(2)}% a.a.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary">Base calculada</span>
              <strong>{formatCurrency(tesouroReturn.principal)}</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary">Rendimento diario</span>
              <strong className="text-profit">{formatCurrency(tesouroReturn.daily)}</strong>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-surface/90">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent/15 p-2.5 text-accent">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Ibovespa</CardTitle>
                <CardDescription className="mt-1">Fonte: {marketOverview.ibovespa.source === "brapi" ? "BRAPI" : "fallback"}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary">Pontos</span>
              <strong>{marketOverview.ibovespa.price ? marketOverview.ibovespa.price.toLocaleString("pt-BR") : "Indisponivel"}</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-text-secondary">Variacao</span>
              <strong className={(marketOverview.ibovespa.changePercent ?? 0) >= 0 ? "text-profit" : "text-expense"}>
                {marketOverview.ibovespa.changePercent !== null ? `${marketOverview.ibovespa.changePercent.toFixed(2)}%` : "--"}
              </strong>
            </div>
          </CardContent>
        </Card>
      </div>

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

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <InvestmentsSubSidebar activeTab={activeTab} onTabChange={setActiveTab} />

        <main className="min-w-0 flex-1">
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
            filtered.length === 0 ? (
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
                onDelete={setDeleteId}
              />
            )
          ) : (
            <div className="space-y-4">
              <Card className="border-border/70 bg-surface/90">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-accent/12 p-2.5 text-accent">
                      <ActiveTabIcon className="h-5 w-5" />
                    </div>
                    <div>
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
                        {tabEntries.length} registro{tabEntries.length !== 1 ? "s" : ""} visível{tabEntries.length !== 1 ? "is" : ""}
                      </span>
                      <span className="rounded-full border border-border/70 bg-background/50 px-3 py-1">
                        Total filtrado: {formatCurrency(tabEntries.reduce((sum, entry) => sum + entry.amount, 0))}
                      </span>
                    </div>
                  </CardContent>
                )}
              </Card>

              {tabEntries.length > 0 ? (
                <InvestmentsTable
                  entries={tabEntries}
                  onEdit={openEdit}
                  onDelete={setDeleteId}
                />
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
                      : activeTab === "portfolio" || hasFilterApplied
                        ? "Ainda não há registros suficientes para compor esta visão com os filtros ativos."
                        : "Essa categoria já tem espaço reservado e pode receber dados assim que você começar a registrar esse tipo de investimento."
                  }
                  actionLabel={!hasFilterApplied && activeTab !== "dividends" && activeTab !== "earnings" && activeTab !== "profitability" && activeTab !== "reports" ? "+ Novo investimento" : undefined}
                  onAction={!hasFilterApplied && activeTab !== "dividends" && activeTab !== "earnings" && activeTab !== "profitability" && activeTab !== "reports" ? openCreate : undefined}
                />
              )}
            </div>
          )}
        </main>
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
    </div>
  );
}
