"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, Clock3, PackageCheck, PackagePlus, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AdjustInventoryDialog } from "@/components/business/inventory/AdjustInventoryDialog";
import { EditProductDialog } from "@/components/business/inventory/EditProductDialog";
import { InventoryLotsList } from "@/components/business/inventory/InventoryLotsList";
import { InventoryMovementsTimeline } from "@/components/business/inventory/InventoryMovementsTimeline";
import { InventoryStatusBadges } from "@/components/business/inventory/InventoryStatusBadges";
import type { InventoryLotWithOrigin, InventoryProductDetail, WorkspaceRpcResult } from "@/components/business/inventory/types";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPotentialProfit, type InventoryItem } from "@/lib/business-inventory";
import { makeBusinessStableIdempotencyKey } from "@/lib/business-purchases";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
import type {
  BusinessInventoryLot,
  BusinessInventoryMovement,
  BusinessInventoryMovementType,
  BusinessInventorySummary,
  BusinessProduct,
  BusinessPurchaseItem,
  BusinessPurchaseOrder,
  Database,
} from "@/types/database";

type AdjustArgs = Database["public"]["Functions"]["adjust_business_inventory"]["Args"];
type ProductUpdateArgs = Database["public"]["Functions"]["update_business_product_metadata"]["Args"];

const INVENTORY_HISTORY_PAGE_SIZE = 40;

export function InventoryProductDetailsClient({ productId }: { productId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<InventoryProductDetail | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadLotOrigins = useCallback(async (lots: BusinessInventoryLot[]): Promise<InventoryLotWithOrigin[]> => {
    const purchaseItemIds = lots.map((lot) => lot.purchase_item_id).filter((id): id is string => Boolean(id));
    if (purchaseItemIds.length === 0) {
      return lots.map((lot) => ({ ...lot, origin: null, purchase_order_id: null }));
    }

    const itemsRes = await supabase
      .from("business_purchase_items")
      .select("*")
      .in("id", purchaseItemIds);
    if (itemsRes.error) throw itemsRes.error;

    const items = coerceData<BusinessPurchaseItem[]>(itemsRes.data ?? []);
    const orderIds = items.map((item) => item.purchase_order_id);
    const ordersRes = orderIds.length > 0
      ? await supabase.from("business_purchase_orders").select("*").in("id", orderIds)
      : { data: [], error: null };
    if (ordersRes.error) throw ordersRes.error;

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const ordersById = new Map(coerceData<BusinessPurchaseOrder[]>(ordersRes.data ?? []).map((order) => [order.id, order]));

    return lots.map((lot) => {
      const item = lot.purchase_item_id ? itemsById.get(lot.purchase_item_id) : null;
      const order = item ? ordersById.get(item.purchase_order_id) : null;
      return {
        ...lot,
        origin: order?.origin ?? null,
        purchase_order_id: order?.id ?? null,
      };
    });
  }, [supabase]);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast.error("Sessão expirada. Entre novamente.");
        router.push("/login");
        return;
      }

      const workspaceRes = await supabase.rpc("get_or_create_business_workspace", coerceMutation({ p_name: "Meu Negócio" }));
      if (workspaceRes.error) throw workspaceRes.error;
      const workspace = coerceData<WorkspaceRpcResult>(workspaceRes.data);
      setWorkspaceId(workspace.workspace_id);

      const [summaryRes, productRes, lotsRes, movementsRes] = await Promise.all([
        supabase
          .from("business_inventory_summary")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .eq("product_id", productId)
          .maybeSingle(),
        supabase
          .from("business_products")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .eq("id", productId)
          .maybeSingle(),
        supabase
          .from("business_inventory_lots")
          .select("*", { count: "exact" })
          .eq("workspace_id", workspace.workspace_id)
          .eq("product_id", productId)
          .order("received_at", { ascending: false })
          .order("id", { ascending: false })
          .range(0, INVENTORY_HISTORY_PAGE_SIZE - 1),
        supabase
          .from("business_inventory_movements")
          .select("*", { count: "exact" })
          .eq("workspace_id", workspace.workspace_id)
          .eq("product_id", productId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(0, INVENTORY_HISTORY_PAGE_SIZE - 1),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      if (productRes.error) throw productRes.error;
      if (lotsRes.error) throw lotsRes.error;
      if (movementsRes.error) throw movementsRes.error;
      if (!productRes.data) {
        setDetail(null);
        return;
      }

      const lots = coerceData<BusinessInventoryLot[]>(lotsRes.data ?? []);
      const lotsWithOrigin = await loadLotOrigins(lots);

      setDetail({
        product: coerceData<BusinessProduct>(productRes.data),
        summary: coerceData<BusinessInventorySummary | null>(summaryRes.data ?? null),
        lots: lotsWithOrigin,
        movements: coerceData<BusinessInventoryMovement[]>(movementsRes.data ?? []),
      });
    } catch (error) {
      console.error("Erro ao carregar detalhe do estoque", error);
      toast.error("Não foi possível carregar este produto.");
    } finally {
      setLoading(false);
    }
  }, [loadLotOrigins, productId, router, supabase]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const inventoryItem = useMemo(() => buildInventoryItem(detail), [detail]);
  const potential = inventoryItem
    ? getPotentialProfit({
        defaultSalePrice: inventoryItem.default_sale_price,
        averageUnitCost: inventoryItem.average_unit_cost,
      })
    : { profitPerUnit: null, marginPct: null };

  async function handleAdjust(payload: {
    productId: string;
    quantityDelta: number;
    movementType: BusinessInventoryMovementType;
    reason: string;
    unitCost?: number;
  }) {
    setAdjusting(true);
    try {
      const args = {
        p_workspace_id: workspaceId,
        p_product_id: payload.productId,
        p_quantity_delta: payload.quantityDelta,
        p_movement_type: payload.movementType,
        p_reason: payload.reason,
        p_idempotency_key: makeBusinessStableIdempotencyKey("inventory-adjustment", [
          workspaceId,
          payload.productId,
          payload.quantityDelta,
          payload.movementType,
          payload.reason,
          payload.unitCost ?? null,
          Date.now(),
        ]),
        p_unit_cost: payload.unitCost,
      } satisfies AdjustArgs;

      const { error } = await supabase.rpc("adjust_business_inventory", coerceMutation(args));
      if (error) throw error;
      toast.success("Ajuste registrado.");
      setAdjustOpen(false);
      await loadDetail();
    } catch (error) {
      console.error("Erro ao ajustar estoque", error);
      toast.error("Não foi possível ajustar o estoque.");
    } finally {
      setAdjusting(false);
    }
  }

  async function handleEdit(payload: {
    name: string;
    sku: string | null;
    defaultSalePrice: number | null;
    minimumStock: number;
    active: boolean;
  }) {
    if (!detail) return;
    setEditing(true);
    try {
      const args = {
        p_workspace_id: workspaceId,
        p_product_id: detail.product.id,
        p_idempotency_key: makeBusinessStableIdempotencyKey("product-metadata", [
          detail.product.id,
          payload.name,
          payload.sku,
          payload.defaultSalePrice,
          payload.minimumStock,
          payload.active,
          Date.now(),
        ]),
        p_name: payload.name,
        p_sku: payload.sku,
        p_default_sale_price: payload.defaultSalePrice,
        p_minimum_stock: payload.minimumStock,
        p_active: payload.active,
      } satisfies ProductUpdateArgs;

      const { error } = await supabase.rpc("update_business_product_metadata", coerceMutation(args));
      if (error) throw error;
      toast.success("Produto atualizado.");
      setEditOpen(false);
      await loadDetail();
    } catch (error) {
      console.error("Erro ao editar produto", error);
      toast.error("Não foi possível salvar este produto.");
    } finally {
      setEditing(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container animate-fade-in">
        <Skeleton className="mb-6 h-20 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!detail || !inventoryItem) {
    return (
      <div className="page-container animate-fade-in">
        <div className="rounded-xl border border-border/60 bg-surface p-6 text-center">
          <p className="text-sm text-text-secondary">Produto não encontrado.</p>
          <Button type="button" className="mt-4" onClick={() => router.push("/business/inventory")}>
            Voltar para estoque
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={Boxes}
        iconTone="accent"
        title={inventoryItem.name}
        description={inventoryItem.sku || "Produto sem SKU"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => router.push("/business/inventory")} className="min-h-10">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            <Button asChild size="sm" variant="outline" className="min-h-10">
              <Link href="/business/purchases/new">
                <PackagePlus className="h-4 w-4" />
                Registrar compra
              </Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditOpen(true)} className="min-h-10">
              <Pencil className="h-4 w-4" />
              Editar
            </Button>
            {inventoryItem.active && (
              <Button type="button" size="sm" onClick={() => setAdjustOpen(true)} className="min-h-10">
                <Plus className="h-4 w-4" />
                Ajustar estoque
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <InventoryStatusBadges item={inventoryItem} />
        <p className="text-sm text-text-secondary">
          Venda padrão: <span className="font-semibold tabular-nums text-text-primary">{inventoryItem.default_sale_price !== null ? formatCurrency(inventoryItem.default_sale_price) : "Sem preço"}</span>
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard title="Físico" value={String(inventoryItem.on_hand)} icon={Boxes} variant="accent" size="compact" />
        <StatCard title="Reservado" value={String(inventoryItem.reserved)} icon={Clock3} variant="warning" size="compact" />
        <StatCard title="Disponível" value={String(inventoryItem.available)} icon={PackageCheck} variant="profit" size="compact" />
        <StatCard title="A caminho" value={String(inventoryItem.in_transit)} icon={PackagePlus} variant="warning" size="compact" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Financeiro</h2>
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Custo médio" value={formatCurrency(inventoryItem.average_unit_cost)} />
            <Metric label="Capital atual" value={formatCurrency(inventoryItem.inventory_value)} />
            <Metric label="Preço padrão" value={inventoryItem.default_sale_price !== null ? formatCurrency(inventoryItem.default_sale_price) : "Sem preço"} />
            <Metric label="Lucro potencial/un." value={potential.profitPerUnit !== null ? formatCurrency(potential.profitPerUnit) : "Indefinido"} />
            <Metric label="Margem potencial" value={potential.marginPct !== null ? `${potential.marginPct}%` : "Indefinida"} />
            <Metric label="Estoque mínimo" value={inventoryItem.minimum_stock > 0 ? String(inventoryItem.minimum_stock) : "Não configurado"} />
          </div>
          <p className="mt-4 rounded-lg bg-background/50 px-3 py-2 text-xs text-text-secondary">
            Lucro e margem potenciais são estimativas por unidade, não lucro realizado.
          </p>
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Indicadores</h2>
          <div className="space-y-3 text-sm">
            <InfoRow label="Total comprado" value={String(inventoryItem.total_purchased)} />
            <InfoRow label="Total recebido" value={String(inventoryItem.total_received)} />
            <InfoRow label="Atualmente em estoque" value={String(inventoryItem.on_hand)} />
            <InfoRow label="Reservado" value={String(inventoryItem.reserved)} />
            <InfoRow label="Total vendido" value={String(inventoryItem.total_sold)} />
            <InfoRow label="Última entrada" value={detail.movements[0] ? `${formatDate(detail.movements[0].created_at.slice(0, 10))} às ${formatTime(detail.movements[0].created_at)}` : "Sem movimento"} />
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Lotes</h2>
          <InventoryLotsList lots={detail.lots} />
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Histórico de movimentações</h2>
          <InventoryMovementsTimeline movements={detail.movements} />
        </section>
      </div>

      <AdjustInventoryDialog
        open={adjustOpen}
        products={[inventoryItem]}
        selectedProductId={inventoryItem.product_id}
        loading={adjusting}
        onOpenChange={setAdjustOpen}
        onConfirm={handleAdjust}
      />

      <EditProductDialog
        open={editOpen}
        product={inventoryItem}
        loading={editing}
        onOpenChange={setEditOpen}
        onConfirm={handleEdit}
      />
    </div>
  );
}

function buildInventoryItem(detail: InventoryProductDetail | null): InventoryItem | null {
  if (!detail) return null;
  if (detail.summary) return detail.summary;

  return {
    product_id: detail.product.id,
    user_id: detail.product.user_id,
    workspace_id: detail.product.workspace_id,
    name: detail.product.name,
    sku: detail.product.sku,
    barcode: detail.product.barcode,
    image_url: detail.product.image_url,
    default_sale_price: detail.product.default_sale_price,
    minimum_stock: detail.product.minimum_stock,
    on_hand: 0,
    reserved: 0,
    available: 0,
    in_transit: 0,
    inventory_value: 0,
    average_unit_cost: 0,
    estimated_profit: 0,
    active: detail.product.active,
    created_at: detail.product.created_at,
    updated_at: detail.product.updated_at,
    last_movement_at: detail.movements[0]?.created_at ?? null,
    total_purchased: 0,
    total_received: 0,
    total_sold: 0,
  };
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/50 px-3 py-3">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="mt-1 break-words text-base font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-0 last:pb-0">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right font-medium tabular-nums text-text-primary">{value}</span>
    </div>
  );
}
