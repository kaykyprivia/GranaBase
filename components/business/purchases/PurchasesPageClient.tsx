"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock3, PackageCheck, Plus, Search, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency, toLocalDateString } from "@/lib/utils";
import {
  getDateRange,
  makeBusinessStableIdempotencyKey,
  type DateRangePreset,
} from "@/lib/business-purchases";
import type {
  BusinessInventoryMovement,
  BusinessProduct,
  BusinessPurchaseItem,
  BusinessPurchaseOrder,
  BusinessPurchaseOrderStatus,
} from "@/types/database";
import { PurchaseList } from "@/components/business/purchases/PurchaseList";
import { NewPurchaseFormClient } from "@/components/business/purchases/NewPurchasePageClient";
import { ReceivePurchaseDialog } from "@/components/business/purchases/ReceivePurchaseDialog";
import type { PurchaseReceiptInput, PurchaseRow, WorkspaceRpcResult } from "@/components/business/purchases/types";

const statusOptions: Array<{ value: "all" | BusinessPurchaseOrderStatus; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "PURCHASED", label: "Compradas" },
  { value: "IN_TRANSIT", label: "Em transporte" },
  { value: "PARTIALLY_RECEIVED", label: "Recebidas parcialmente" },
  { value: "RECEIVED", label: "Recebidas" },
  { value: "CANCELLED", label: "Canceladas" },
];

const periodOptions: Array<{ value: DateRangePreset; label: string }> = [
  { value: "month", label: "Este mês" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "year", label: "Este ano" },
  { value: "custom", label: "Personalizado" },
];

export function PurchasesPageClient() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [movements, setMovements] = useState<BusinessInventoryMovement[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | BusinessPurchaseOrderStatus>("all");
  const [periodFilter, setPeriodFilter] = useState<DateRangePreset>("month");
  const [customStart, setCustomStart] = useState(toLocalDateString(new Date()));
  const [customEnd, setCustomEnd] = useState(toLocalDateString(new Date()));
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseRow | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<PurchaseRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const activeFilterCount =
    Number(statusFilter !== "all") +
    Number(periodFilter !== "month");

  const loadPurchases = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast.error("Sessão expirada. Entre novamente.");
        router.push("/login");
        return;
      }

      const workspaceRes = await supabase.rpc("get_or_create_business_workspace", coerceMutation({ p_name: "Meu Negócio" }));
      if (workspaceRes.error) {
        throw workspaceRes.error;
      }

      const workspace = coerceData<WorkspaceRpcResult>(workspaceRes.data);

      const [ordersRes, productsRes] = await Promise.all([
        supabase
          .from("business_purchase_orders")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .order("purchase_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("business_products")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .order("name", { ascending: true }),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (productsRes.error) throw productsRes.error;

      const orders = coerceData<BusinessPurchaseOrder[]>(ordersRes.data ?? []);
      const orderIds = orders.map((order) => order.id);
      const itemsRes = orderIds.length > 0
        ? await supabase.from("business_purchase_items").select("*").in("purchase_order_id", orderIds)
        : { data: [], error: null };
      const movementsRes = orderIds.length > 0
        ? await supabase
            .from("business_inventory_movements")
            .select("*")
            .eq("workspace_id", workspace.workspace_id)
            .eq("movement_type", "PURCHASE_RECEIPT")
            .in("reference_id", orderIds)
        : { data: [], error: null };

      if (itemsRes.error) throw itemsRes.error;
      if (movementsRes.error) throw movementsRes.error;

      const items = coerceData<BusinessPurchaseItem[]>(itemsRes.data ?? []);
      const products = coerceData<BusinessProduct[]>(productsRes.data ?? []);
      const productsById = new Map(products.map((product) => [product.id, product]));
      const itemsByOrderId = new Map<string, BusinessPurchaseItem[]>();

      for (const item of items) {
        const currentItems = itemsByOrderId.get(item.purchase_order_id) ?? [];
        currentItems.push(item);
        itemsByOrderId.set(item.purchase_order_id, currentItems);
      }

      setPurchases(
        orders.map((order) => {
          const orderItems = itemsByOrderId.get(order.id) ?? [];

          const purchaseItems = orderItems.map((item) => ({
            item,
            product: productsById.get(item.product_id) ?? null,
          }));

          const primaryLine = purchaseItems[0] ?? null;

          return {
            ...order,
            items: purchaseItems,
            item: primaryLine?.item ?? null,
            product: primaryLine?.product ?? null,
          };
        })
      );
      setMovements(coerceData<BusinessInventoryMovement[]>(movementsRes.data ?? []));
    } catch (error) {
      console.error("Erro ao carregar compras", error);
      toast.error("Não foi possível carregar as compras agora.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  const dateRange = useMemo(() => getDateRange(periodFilter, new Date(), customStart, customEnd), [customEnd, customStart, periodFilter]);

  const filteredPurchases = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return purchases.filter((purchase) => {
      const matchStatus = statusFilter === "all" || purchase.status === statusFilter;
      const matchDate =
        !dateRange ||
        (purchase.purchase_date >= dateRange.start && purchase.purchase_date <= dateRange.end);
      const searchable = [
        ...purchase.items.flatMap(({ product }) => [
          product?.name,
          product?.sku,
        ]),
        purchase.origin,
        purchase.id.slice(0, 8),
      ].filter(Boolean).join(" ").toLowerCase();
      const matchSearch = !normalizedSearch || searchable.includes(normalizedSearch);

      return matchStatus && matchDate && matchSearch;
    });
  }, [dateRange, purchases, search, statusFilter]);

  const summary = useMemo(() => {
    const openPurchases = filteredPurchases.filter((purchase) => !["RECEIVED", "CANCELLED"].includes(purchase.status));
    const today = toLocalDateString();
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const soonDate = toLocalDateString(soon);
    const receivedMovementIds = new Set(
      movements
        .filter((movement) => {
          const date = movement.created_at.slice(0, 10);
          return (!dateRange || (date >= dateRange.start && date <= dateRange.end)) && movement.reference_id;
        })
        .map((movement) => movement.reference_id)
    );

    return {
      openCount: openPurchases.length,
      openInvestment: openPurchases.reduce((sum, purchase) => sum + purchase.total_cost, 0),
      arrivingSoon: openPurchases.filter((purchase) =>
        purchase.expected_arrival_date &&
        purchase.expected_arrival_date >= today &&
        purchase.expected_arrival_date <= soonDate
      ).length,
      receivedInPeriod: receivedMovementIds.size,
    };
  }, [dateRange, filteredPurchases, movements]);

  const handleReceive = async (items: PurchaseReceiptInput[]) => {
    if (!receiveTarget) return;

    setReceiving(true);

    try {
      const currentState = receiveTarget.items.map(({ item }) => [
        item.id,
        item.quantity_received,
      ]);

      const totalRemaining = receiveTarget.items.reduce(
        (sum, { item }) =>
          sum + (item.quantity_ordered - item.quantity_received),
        0
      );

      const receivedNow = items.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      const { error } = await supabase.rpc(
        "receive_business_purchase_items",
        coerceMutation({
          p_purchase_order_id: receiveTarget.id,
          p_items: items,
          p_idempotency_key: makeBusinessStableIdempotencyKey(
            "purchase-receipt-items",
            [
              receiveTarget.id,
              JSON.stringify(currentState),
              JSON.stringify(items),
            ]
          ),
        })
      );

      if (error) throw error;

      toast.success(
        receivedNow >= totalRemaining
          ? "Compra recebida."
          : "Recebimento registrado."
      );

      setReceiveTarget(null);
      await loadPurchases();
    } catch (error) {
      console.error("Erro ao receber compra", error);
      toast.error("Não foi possível registrar o recebimento.");
    } finally {
      setReceiving(false);
    }
  };
  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("cancel_business_purchase", coerceMutation({
        p_purchase_order_id: cancelTarget.id,
        p_idempotency_key: makeBusinessStableIdempotencyKey("purchase-cancel", [cancelTarget.id, cancelTarget.status]),
      }));

      if (error) throw error;
      toast.success("Compra cancelada.");
      setCancelTarget(null);
      await loadPurchases();
    } catch (error) {
      console.error("Erro ao cancelar compra", error);
      toast.error("Não foi possível cancelar esta compra.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={ShoppingCart}
        iconTone="accent"
        title="Compras"
        description="Acompanhe seus produtos desde a compra até a entrada no estoque."
        actions={
          <Button
            type="button"
            size="sm"
            className="min-h-10 gap-1.5"
            onClick={() => setNewPurchaseOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Nova compra
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard title="A caminho" value={String(summary.openCount)} subtitle="compras abertas" icon={ShoppingCart} variant="accent" size="compact" loading={loading} />
        <StatCard title="Investido em compras abertas" value={formatCurrency(summary.openInvestment)} icon={Clock3} variant="warning" size="compact" loading={loading} />
        <StatCard title="Previstas para chegar" value={String(summary.arrivingSoon)} subtitle="próximos 7 dias" icon={CalendarClock} variant="default" size="compact" loading={loading} />
        <StatCard title="Recebidas no período" value={String(summary.receivedInPeriod)} icon={PackageCheck} variant="profit" size="compact" loading={loading} />
      </div>

      <div className="mb-5 space-y-3">
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por produto, origem ou identificador..."
            leftIcon={<Search className="h-4 w-4" />}
            className="min-h-11"
          />
          <div className="relative shrink-0">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setFiltersOpen(true)}
              aria-label="Abrir filtros"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filtros</span>
            </Button>
            {activeFilterCount > 0 && (
              <Badge className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none">
                {activeFilterCount}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl lg:h-16" />
          ))}
        </div>
      ) : (
        <PurchaseList
          purchases={filteredPurchases}
          emptyAction={() => setNewPurchaseOpen(true)}
          onReceive={setReceiveTarget}
          onCancel={setCancelTarget}
        />
      )}

      <Dialog open={newPurchaseOpen} onOpenChange={setNewPurchaseOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova compra</DialogTitle>
          </DialogHeader>
          <NewPurchaseFormClient
            onCancel={() => setNewPurchaseOpen(false)}
            onCreated={async () => {
              setNewPurchaseOpen(false);
              await loadPurchases();
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Filters
              statusFilter={statusFilter}
              periodFilter={periodFilter}
              customStart={customStart}
              customEnd={customEnd}
              onStatusChange={setStatusFilter}
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

      <ReceivePurchaseDialog
        open={receiveTarget !== null}
        purchase={receiveTarget}
        loading={receiving}
        onOpenChange={(open) => !open && setReceiveTarget(null)}
        onConfirm={handleReceive}
      />

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancelar esta compra?"
        description="A compra será marcada como cancelada e permanecerá no histórico. Nenhum registro será excluído."
        confirmLabel="Cancelar compra"
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </div>
  );
}

function Filters({
  statusFilter,
  periodFilter,
  customStart,
  customEnd,
  onStatusChange,
  onPeriodChange,
  onCustomStartChange,
  onCustomEndChange,
}: {
  statusFilter: "all" | BusinessPurchaseOrderStatus;
  periodFilter: DateRangePreset;
  customStart: string;
  customEnd: string;
  onStatusChange: (value: "all" | BusinessPurchaseOrderStatus) => void;
  onPeriodChange: (value: DateRangePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}) {
  return (
    <>
      <Select value={statusFilter} onValueChange={(value) => onStatusChange(value as "all" | BusinessPurchaseOrderStatus)}>
        <SelectTrigger className="w-full" aria-label="Filtrar por status"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          {statusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={periodFilter} onValueChange={(value) => onPeriodChange(value as DateRangePreset)}>
        <SelectTrigger className="w-full" aria-label="Filtrar por período"><SelectValue placeholder="Período" /></SelectTrigger>
        <SelectContent>
          {periodOptions.map((option) => (
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
