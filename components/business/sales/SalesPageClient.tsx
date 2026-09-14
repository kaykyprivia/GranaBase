"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clock3, HandCoins, PackageCheck, Plus, Search, SlidersHorizontal, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RecordPaymentDialog } from "@/components/business/sales/RecordPaymentDialog";
import { SalesList } from "@/components/business/sales/SalesList";
import type { SaleRow, SalesPageRpcResult, SalesSummaryRpcResult, WorkspaceRpcResult } from "@/components/business/sales/types";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SALE_FILTER_OPTIONS,
  SALE_CHANNEL_OPTIONS,
  SALE_PAYMENT_FILTER_OPTIONS,
  SALE_PERIOD_OPTIONS,
  getSaleErrorMessage,
  getSalesDateRange,
  type SaleListFilter,
  type SalePaymentFilter,
  type SaleChannelFilter,
  type SalesDateRangePreset,
} from "@/lib/business-sales";
import { makeBusinessStableIdempotencyKey } from "@/lib/business-purchases";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency, toLocalDateString } from "@/lib/utils";
import type {
  BusinessCustomer,
  BusinessPayment,
  BusinessProduct,
  BusinessSale,
  BusinessSaleItem,
  BusinessSaleOrderStatus,
  BusinessSaleReturn,
  BusinessSaleReturnItem,
  Database,
} from "@/types/database";

type AdvanceArgs = Database["public"]["Functions"]["advance_business_sale_status"]["Args"];
type DeliverArgs = Database["public"]["Functions"]["deliver_business_sale"]["Args"];
type CancelArgs = Database["public"]["Functions"]["cancel_business_sale"]["Args"];
type PaymentArgs = Database["public"]["Functions"]["record_business_payment"]["Args"];
type SalesPageArgs = Database["public"]["Functions"]["get_business_sales_page"]["Args"];
type SalesSummaryArgs = Database["public"]["Functions"]["get_business_sales_summary"]["Args"];

const SALES_PAGE_SIZE = 25;

export function SalesPageClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<SaleListFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<SalePaymentFilter>("all");
  const [channelFilter, setChannelFilter] = useState<SaleChannelFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<SalesDateRangePreset>("month");
  const [customStart, setCustomStart] = useState(toLocalDateString(new Date()));
  const [customEnd, setCustomEnd] = useState(toLocalDateString(new Date()));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<SalesPageRpcResult>({
    sale_ids: [],
    total_count: 0,
    page: 1,
    page_size: SALES_PAGE_SIZE,
    total_pages: 0,
  });
  const [summary, setSummary] = useState<SalesSummaryRpcResult>({
    count: 0,
    realized: 0,
    revenue: 0,
    receivable: 0,
    profit: 0,
    ticket: 0,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState<SaleRow | null>(null);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<SaleRow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [advancingSaleId, setAdvancingSaleId] = useState<string | null>(null);

  const dateRange = useMemo(
    () => getSalesDateRange(periodFilter, new Date(), customStart, customEnd),
    [customEnd, customStart, periodFilter]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, paymentFilter, channelFilter, periodFilter, customStart, customEnd]);

  const loadSales = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        toast.error("Sessao expirada. Entre novamente.");
        router.push("/login");
        return;
      }

      const workspaceRes = await supabase.rpc(
        "get_or_create_business_workspace",
        coerceMutation({ p_name: "Meu Negocio" })
      );

      if (workspaceRes.error) throw workspaceRes.error;

      const workspace = coerceData<WorkspaceRpcResult>(workspaceRes.data);

      const pageArgs = {
        p_workspace_id: workspace.workspace_id,
        p_page: page,
        p_page_size: SALES_PAGE_SIZE,
        p_status: statusFilter,
        p_payment_status: paymentFilter,
        p_sales_channel: channelFilter,
        p_start_date: dateRange?.start ?? null,
        p_end_date: dateRange?.end ?? null,
        p_search: debouncedSearch || null,
      } satisfies SalesPageArgs;

      const summaryArgs = {
        p_workspace_id: workspace.workspace_id,
        p_status: statusFilter,
        p_payment_status: paymentFilter,
        p_sales_channel: channelFilter,
        p_start_date: dateRange?.start ?? null,
        p_end_date: dateRange?.end ?? null,
        p_search: debouncedSearch || null,
      } satisfies SalesSummaryArgs;

      const [pageRes, summaryRes] = await Promise.all([
        supabase.rpc("get_business_sales_page", coerceMutation(pageArgs)),
        supabase.rpc("get_business_sales_summary", coerceMutation(summaryArgs)),
      ]);

      if (pageRes.error) throw pageRes.error;
      if (summaryRes.error) throw summaryRes.error;

      const pageData = coerceData<SalesPageRpcResult>(pageRes.data);
      const summaryData = coerceData<SalesSummaryRpcResult>(summaryRes.data);

      setPagination(pageData);
      setSummary(summaryData);

      if (pageData.total_pages > 0 && page > pageData.total_pages) {
        setPage(pageData.total_pages);
        return;
      }

      if (pageData.total_pages === 0 && page !== 1) {
        setPage(1);
        return;
      }

      const saleIds = pageData.sale_ids ?? [];

      if (saleIds.length === 0) {
        setSales([]);
        return;
      }

      const salesRes = await supabase
        .from("business_sales")
        .select("*")
        .in("id", saleIds);

      if (salesRes.error) throw salesRes.error;

      const unorderedSales = coerceData<BusinessSale[]>(salesRes.data ?? []);
      const salesById = new Map(unorderedSales.map((sale) => [sale.id, sale]));
      const saleRows = saleIds
        .map((saleId) => salesById.get(saleId))
        .filter((sale): sale is BusinessSale => Boolean(sale));

      const [itemsRes, paymentsRes, returnsRes] = await Promise.all([
        supabase
          .from("business_sale_items")
          .select("*")
          .in("sale_id", saleIds)
          .order("created_at", { ascending: true }),
        supabase
          .from("business_payments")
          .select("*")
          .in("sale_id", saleIds)
          .order("paid_at", { ascending: true }),
        supabase
          .from("business_sale_returns")
          .select("*")
          .in("sale_id", saleIds)
          .order("created_at", { ascending: true }),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (returnsRes.error) throw returnsRes.error;

      const items = coerceData<BusinessSaleItem[]>(itemsRes.data ?? []);
      const itemIds = items.map((item) => item.id);

      const returnItemsRes =
        itemIds.length > 0
          ? await supabase
              .from("business_sale_return_items")
              .select("*")
              .in("sale_item_id", itemIds)
              .order("created_at", { ascending: true })
          : { data: [], error: null };

      if (returnItemsRes.error) throw returnItemsRes.error;

      const productIds = Array.from(
        new Set(items.map((item) => item.product_id))
      );

      const customerIds = Array.from(
        new Set(
          saleRows
            .map((sale) => sale.customer_id)
            .filter((customerId): customerId is string => Boolean(customerId))
        )
      );

      const productsRes =
        productIds.length > 0
          ? await supabase
              .from("business_products")
              .select("*")
              .in("id", productIds)
          : { data: [], error: null };

      const customersRes =
        customerIds.length > 0
          ? await supabase
              .from("business_customers")
              .select("*")
              .in("id", customerIds)
          : { data: [], error: null };

      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;

      const productsById = new Map(
        coerceData<BusinessProduct[]>(productsRes.data ?? []).map((product) => [
          product.id,
          product,
        ])
      );

      const customersById = new Map(
        coerceData<BusinessCustomer[]>(customersRes.data ?? []).map((customer) => [
          customer.id,
          customer,
        ])
      );

      const itemsBySaleId = groupBy(items, "sale_id");
      const paymentsBySaleId = groupBy(
        coerceData<BusinessPayment[]>(paymentsRes.data ?? []),
        "sale_id"
      );
      const returnsBySaleId = groupBy(
        coerceData<BusinessSaleReturn[]>(returnsRes.data ?? []),
        "sale_id"
      );

      const returnItems = coerceData<BusinessSaleReturnItem[]>(
        returnItemsRes.data ?? []
      );

      const returnItemsBySaleItemId = groupBy(
        returnItems,
        "sale_item_id"
      );

      setSales(
        saleRows.map((sale) => ({
          ...sale,
          customer: sale.customer_id
            ? customersById.get(sale.customer_id) ?? null
            : null,
          items: (itemsBySaleId.get(sale.id) ?? []).map((item) => ({
            ...item,
            product: productsById.get(item.product_id) ?? null,
            returnedQuantity: (
              returnItemsBySaleItemId.get(item.id) ?? []
            ).reduce(
              (sum, row) => sum + Number(row.quantity || 0),
              0
            ),
          })),
          payments: paymentsBySaleId.get(sale.id) ?? [],
          returns: returnsBySaleId.get(sale.id) ?? [],
          returnItems: (itemsBySaleId.get(sale.id) ?? []).flatMap(
            (item) => returnItemsBySaleItemId.get(item.id) ?? []
          ),
        }))
      );
    } catch (error) {
      console.error("Erro ao carregar vendas", error);
      toast.error("Nao foi possivel carregar as vendas agora.");
    } finally {
      setLoading(false);
    }
  }, [
    router,
    supabase,
    page,
    statusFilter,
    paymentFilter,
    channelFilter,
    dateRange,
    debouncedSearch,
  ]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  async function handleAdvance(sale: SaleRow, nextStatus: Extract<BusinessSaleOrderStatus, "SEPARATED" | "SHIPPED" | "DELIVERED">) {
    setAdvancingSaleId(sale.id);
    try {
      if (nextStatus === "DELIVERED") {
        const args = {
          p_sale_id: sale.id,
          p_idempotency_key: makeBusinessStableIdempotencyKey("sale-deliver", [sale.id, sale.order_status]),
        } satisfies DeliverArgs;
        const { error } = await supabase.rpc("deliver_business_sale", coerceMutation(args));
        if (error) throw error;
        toast.success("Venda entregue.");
      } else {
        const args = {
          p_sale_id: sale.id,
          p_next_status: nextStatus,
          p_idempotency_key: makeBusinessStableIdempotencyKey("sale-advance", [sale.id, sale.order_status, nextStatus]),
        } satisfies AdvanceArgs;
        const { error } = await supabase.rpc("advance_business_sale_status", coerceMutation(args));
        if (error) throw error;
        toast.success(nextStatus === "SEPARATED" ? "Venda separada." : "Venda enviada.");
      }
      await loadSales();
    } catch (error) {
      console.error("Erro ao avancar venda", error);
      toast.error(getSaleErrorMessage(error));
    } finally {
      setAdvancingSaleId(null);
    }
  }

  async function handlePayment(payload: { amount: number; method: string; paidAt: string; notes?: string }) {
    if (!paymentTarget) return;
    setRecordingPayment(true);
    try {
      const args = {
        p_sale_id: paymentTarget.id,
        p_amount: payload.amount,
        p_idempotency_key: makeBusinessStableIdempotencyKey("sale-payment", [
          paymentTarget.id,
          paymentTarget.payments.length,
          payload.amount,
          payload.method,
          payload.paidAt,
          Date.now(),
        ]),
        p_payment_method: payload.method,
        p_status: "PAID",
        p_paid_at: new Date(`${payload.paidAt}T12:00:00`).toISOString(),
        p_notes: payload.notes?.trim() || null,
      } satisfies PaymentArgs;
      const { error } = await supabase.rpc("record_business_payment", coerceMutation(args));
      if (error) throw error;
      toast.success("Pagamento registrado.");
      setPaymentTarget(null);
      await loadSales();
    } catch (error) {
      console.error("Erro ao registrar pagamento", error);
      toast.error(getSaleErrorMessage(error));
    } finally {
      setRecordingPayment(false);
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const args = {
        p_sale_id: cancelTarget.id,
        p_idempotency_key: makeBusinessStableIdempotencyKey("sale-cancel", [cancelTarget.id, cancelTarget.order_status]),
      } satisfies CancelArgs;
      const { error } = await supabase.rpc("cancel_business_sale", coerceMutation(args));
      if (error) throw error;
      toast.success("Venda cancelada.");
      setCancelTarget(null);
      await loadSales();
    } catch (error) {
      console.error("Erro ao cancelar venda", error);
      toast.error(getSaleErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={PackageCheck}
        iconTone="accent"
        title="Vendas"
        description="Acompanhe pedidos, pagamentos, entregas e resultados."
        actions={
          <Button asChild size="sm" className="min-h-10 gap-1.5">
            <Link href="/business/sales/new">
              <Plus className="h-4 w-4" />
              Nova venda
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard title="Vendas no periodo" value={String(summary.count)} subtitle={`${summary.realized} realizadas`} icon={PackageCheck} variant="default" size="compact" loading={loading} />
        <StatCard title="Valor vendido" value={formatCurrency(summary.revenue)} icon={TrendingUp} variant="accent" size="compact" loading={loading} />
        <StatCard title="A receber" value={formatCurrency(summary.receivable)} icon={HandCoins} variant="warning" size="compact" loading={loading} />
        <StatCard title="Lucro realizado" value={formatCurrency(summary.profit)} icon={TrendingUp} variant={summary.profit < 0 ? "expense" : "profit"} size="compact" loading={loading} />
        <StatCard title="Ticket medio" value={formatCurrency(summary.ticket)} icon={Clock3} variant="default" size="compact" loading={loading} />
      </div>

      <div className="mb-5 space-y-3">
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por produto, cliente ou venda..."
            leftIcon={<Search className="h-4 w-4" />}
            className="min-h-11"
          />
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0"
            onClick={() => setFiltersOpen(true)}
            aria-label="Abrir filtros"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filtros</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl lg:h-16" />
          ))}
        </div>
      ) : (
        <>
          <SalesList
            sales={sales}
            emptyAction={() => router.push("/business/sales/new")}
            onPayment={setPaymentTarget}
            onAdvance={handleAdvance}
            onCancel={setCancelTarget}
          />

          {pagination.total_pages > 1 && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {Math.min(
                  (pagination.page - 1) * pagination.page_size + 1,
                  pagination.total_count
                )}
                {" - "}
                {Math.min(
                  pagination.page * pagination.page_size,
                  pagination.total_count
                )}
                {" de "}
                {pagination.total_count}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() =>
                    setPage((current) => Math.max(1, current - 1))
                  }
                >
                  Anterior
                </Button>

                <span className="min-w-24 text-center text-sm text-muted-foreground">
                  Pagina {pagination.page} de {pagination.total_pages}
                </span>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() =>
                    setPage((current) =>
                      Math.min(pagination.total_pages, current + 1)
                    )
                  }
                >
                  Proxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {advancingSaleId && <span className="sr-only">Atualizando venda {advancingSaleId}</span>}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Filters
              statusFilter={statusFilter}
              paymentFilter={paymentFilter}
              channelFilter={channelFilter}
              periodFilter={periodFilter}
              customStart={customStart}
              customEnd={customEnd}
              onStatusChange={setStatusFilter}
              onPaymentChange={setPaymentFilter}
              onChannelChange={setChannelFilter}
              onPeriodChange={setPeriodFilter}
              onCustomStartChange={setCustomStart}
              onCustomEndChange={setCustomEnd}
            />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setFiltersOpen(false)}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecordPaymentDialog
        open={paymentTarget !== null}
        sale={paymentTarget}
        loading={recordingPayment}
        onOpenChange={(open) => !open && setPaymentTarget(null)}
        onConfirm={handlePayment}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancelar esta venda?"
        description="A reserva sera liberada, a venda permanecera no historico e nenhum registro sera apagado."
        confirmLabel="Cancelar venda"
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </div>
  );
}

function Filters({
  statusFilter,
  paymentFilter,
  channelFilter,
  periodFilter,
  customStart,
  customEnd,
  onStatusChange,
  onPaymentChange,
  onChannelChange,
  onPeriodChange,
  onCustomStartChange,
  onCustomEndChange,
}: {
  statusFilter: SaleListFilter;
  paymentFilter: SalePaymentFilter;
  channelFilter: SaleChannelFilter;
  periodFilter: SalesDateRangePreset;
  customStart: string;
  customEnd: string;
  onStatusChange: (value: SaleListFilter) => void;
  onPaymentChange: (value: SalePaymentFilter) => void;
  onChannelChange: (value: SaleChannelFilter) => void;
  onPeriodChange: (value: SalesDateRangePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}) {
  return (
    <>
      <Select value={statusFilter} onValueChange={(value) => onStatusChange(value as SaleListFilter)}>
        <SelectTrigger className="w-full" aria-label="Filtrar pedido">
          <SelectValue placeholder="Pedido" />
        </SelectTrigger>
        <SelectContent>
          {SALE_FILTER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={paymentFilter} onValueChange={(value) => onPaymentChange(value as SalePaymentFilter)}>
        <SelectTrigger className="w-full" aria-label="Filtrar pagamento">
          <SelectValue placeholder="Pagamento" />
        </SelectTrigger>
        <SelectContent>
          {SALE_PAYMENT_FILTER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={channelFilter} onValueChange={(value) => onChannelChange(value as SaleChannelFilter)}>
        <SelectTrigger className="w-full" aria-label="Filtrar canal de venda">
          <SelectValue placeholder="Canal de venda" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os canais</SelectItem>
          {SALE_CHANNEL_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={periodFilter} onValueChange={(value) => onPeriodChange(value as SalesDateRangePreset)}>
        <SelectTrigger className="w-full" aria-label="Filtrar periodo">
          <SelectValue placeholder="Periodo" />
        </SelectTrigger>
        <SelectContent>
          {SALE_PERIOD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {periodFilter === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" value={customStart} onChange={(event) => onCustomStartChange(event.target.value)} aria-label="Data inicial" />
          <Input type="date" value={customEnd} onChange={(event) => onCustomEndChange(event.target.value)} aria-label="Data final" />
        </div>
      )}
    </>
  );
}

function groupBy<T extends Record<K, string>, K extends keyof T>(items: T[], key: K): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = item[key];
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}
