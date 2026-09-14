"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, ClipboardList, PackageCheck, PackagePlus, Plus, Search, SlidersHorizontal, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { AdjustInventoryDialog } from "@/components/business/inventory/AdjustInventoryDialog";
import { InventoryList } from "@/components/business/inventory/InventoryList";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  INVENTORY_FILTER_OPTIONS,
  INVENTORY_SORT_OPTIONS,
  type InventoryFilter,
  type InventoryIntelligenceItem,
  type InventoryIntelligenceSummary,
  type InventoryPageResponse,
  type InventorySort,
} from "@/lib/business-inventory";
import { makeBusinessStableIdempotencyKey } from "@/lib/business-purchases";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency } from "@/lib/utils";
import type { Database } from "@/types/database";
import type { WorkspaceRpcResult } from "@/components/business/inventory/types";

type AdjustArgs = Database["public"]["Functions"]["adjust_business_inventory"]["Args"];
type InventoryPageArgs = Database["public"]["Functions"]["get_business_inventory_page"]["Args"];

const INVENTORY_PAGE_SIZE = 25;
const INVENTORY_WINDOW_DAYS = 30;
const INVENTORY_TARGET_DAYS = 30;

const EMPTY_SUMMARY: InventoryIntelligenceSummary = {
  inventory_value: 0,
  products_in_stock: 0,
  available_units: 0,
  low_stock_products: 0,
  out_of_stock_products: 0,
  in_transit_units: 0,
  reorder_now_products: 0,
  attention_products: 0,
  no_recent_turnover_products: 0,
  suggested_reorder_units: 0,
};

export function InventoryPageClient() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryIntelligenceItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [sort, setSort] = useState<InventorySort>("name");
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({
    total_count: 0,
    page: 1,
    page_size: INVENTORY_PAGE_SIZE,
    total_pages: 0,
  });

  const [summary, setSummary] =
    useState<InventoryIntelligenceSummary>(EMPTY_SUMMARY);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const initializeWorkspace = useCallback(async () => {
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        toast.error("Sessão expirada. Entre novamente.");
        router.push("/login");
        setLoading(false);
        return;
      }

      const workspaceRes = await supabase.rpc(
        "get_or_create_business_workspace",
        coerceMutation({ p_name: "Meu Negócio" })
      );

      if (workspaceRes.error) throw workspaceRes.error;

      const workspace =
        coerceData<WorkspaceRpcResult>(workspaceRes.data);

      setWorkspaceId(workspace.workspace_id);
    } catch (error) {
      console.error("Erro ao preparar estoque", error);
      toast.error("Não foi possível carregar o estoque agora.");
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void initializeWorkspace();
  }, [initializeWorkspace]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  const loadInventory = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);

    try {
      const args = {
        p_workspace_id: workspaceId,
        p_page: page,
        p_page_size: INVENTORY_PAGE_SIZE,
        p_filter: filter,
        p_sort: sort,
        p_search: debouncedSearch || null,
        p_window_days: INVENTORY_WINDOW_DAYS,
        p_target_days: INVENTORY_TARGET_DAYS,
      } satisfies InventoryPageArgs;

      const inventoryRes = await supabase.rpc(
        "get_business_inventory_page",
        coerceMutation(args)
      );

      if (inventoryRes.error) throw inventoryRes.error;

      const result =
        coerceData<InventoryPageResponse>(inventoryRes.data);

      const totalPages = Number(result.total_pages ?? 0);
      const totalCount = Number(result.total_count ?? 0);
      const resultPage = Number(result.page ?? 1);
      const resultPageSize = Number(
        result.page_size ?? INVENTORY_PAGE_SIZE
      );

      setPagination({
        total_count: totalCount,
        page: resultPage,
        page_size: resultPageSize,
        total_pages: totalPages,
      });

      setSummary({
        inventory_value: Number(
          result.summary?.inventory_value ?? 0
        ),
        products_in_stock: Number(
          result.summary?.products_in_stock ?? 0
        ),
        available_units: Number(
          result.summary?.available_units ?? 0
        ),
        low_stock_products: Number(
          result.summary?.low_stock_products ?? 0
        ),
        out_of_stock_products: Number(
          result.summary?.out_of_stock_products ?? 0
        ),
        in_transit_units: Number(
          result.summary?.in_transit_units ?? 0
        ),
        reorder_now_products: Number(
          result.summary?.reorder_now_products ?? 0
        ),
        attention_products: Number(
          result.summary?.attention_products ?? 0
        ),
        no_recent_turnover_products: Number(
          result.summary?.no_recent_turnover_products ?? 0
        ),
        suggested_reorder_units: Number(
          result.summary?.suggested_reorder_units ?? 0
        ),
      });

      if (totalPages > 0 && page > totalPages) {
        setPage(totalPages);
        return;
      }

      if (totalPages === 0 && page !== 1) {
        setPage(1);
        return;
      }

      setItems(
        (result.rows ?? []).map((item) => ({
          ...item,
          on_hand: Number(item.on_hand ?? 0),
          reserved: Number(item.reserved ?? 0),
          available: Number(item.available ?? 0),
          in_transit: Number(item.in_transit ?? 0),
          inventory_value: Number(item.inventory_value ?? 0),
          average_unit_cost: Number(item.average_unit_cost ?? 0),
          estimated_profit: Number(item.estimated_profit ?? 0),
          total_purchased: Number(item.total_purchased ?? 0),
          total_received: Number(item.total_received ?? 0),
          total_sold: Number(item.total_sold ?? 0),
          gross_sold_window: Number(item.gross_sold_window ?? 0),
          customer_returns_window: Number(
            item.customer_returns_window ?? 0
          ),
          net_outflow_window: Number(
            item.net_outflow_window ?? 0
          ),
          observation_days: Number(item.observation_days ?? 0),
          average_daily_outflow: Number(
            item.average_daily_outflow ?? 0
          ),
          coverage_days:
            item.coverage_days === null
              ? null
              : Number(item.coverage_days),
          projected_coverage_days:
            item.projected_coverage_days === null
              ? null
              : Number(item.projected_coverage_days),
          target_stock: Number(item.target_stock ?? 0),
          days_since_last_sale:
            item.days_since_last_sale === null
              ? null
              : Number(item.days_since_last_sale),
          suggested_reorder_quantity: Number(
            item.suggested_reorder_quantity ?? 0
          ),
        }))
      );
    } catch (error) {
      console.error("Erro ao carregar estoque", error);
      toast.error("Não foi possível carregar o estoque agora.");
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    filter,
    page,
    sort,
    supabase,
    workspaceId,
  ]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  function handleFilterChange(value: InventoryFilter) {
    setFilter(value);
    setPage(1);
  }

  function handleSortChange(value: InventorySort) {
    setSort(value);
    setPage(1);
  }

  async function handleAdjust(payload: {
    productId: string;
    quantityDelta: number;
    movementType: AdjustArgs["p_movement_type"];
    reason: string;
    unitCost?: number;
  }) {
    if (!workspaceId) return;

    setAdjusting(true);

    try {
      const args = {
        p_workspace_id: workspaceId,
        p_product_id: payload.productId,
        p_quantity_delta: payload.quantityDelta,
        p_movement_type: payload.movementType,
        p_reason: payload.reason,
        p_idempotency_key: makeBusinessStableIdempotencyKey(
          "inventory-adjustment",
          [
            workspaceId,
            payload.productId,
            payload.quantityDelta,
            payload.movementType,
            payload.reason,
            payload.unitCost ?? null,
            Date.now(),
          ]
        ),
        p_unit_cost: payload.unitCost,
      } satisfies AdjustArgs;

      const { error } = await supabase.rpc(
        "adjust_business_inventory",
        coerceMutation(args)
      );

      if (error) throw error;

      toast.success("Ajuste registrado.");
      setAdjustOpen(false);
      await loadInventory();
    } catch (error) {
      console.error("Erro ao ajustar estoque", error);
      toast.error(getInventoryErrorMessage(error));
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={Boxes}
        iconTone="accent"
        title="Estoque"
        description="Controle estoque, cobertura, reposição, custos e movimentações."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="min-h-10"
            >
              <Link href="/business/purchases/new">
                <PackagePlus className="h-4 w-4" />
                Registrar compra
              </Link>
            </Button>

            <Button
              type="button"
              size="sm"
              className="min-h-10"
              onClick={() => setAdjustOpen(true)}
              disabled={!workspaceId}
            >
              <Plus className="h-4 w-4" />
              Ajustar estoque
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-6">
        <StatCard
          title="Capital em estoque"
          value={formatCurrency(summary.inventory_value)}
          icon={TrendingUp}
          variant="accent"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Produtos em estoque"
          value={String(summary.products_in_stock)}
          icon={Boxes}
          variant="profit"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Unidades disponíveis"
          value={String(summary.available_units)}
          icon={PackageCheck}
          variant="default"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Estoque baixo"
          value={String(summary.low_stock_products)}
          icon={ClipboardList}
          variant="warning"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Repor agora"
          value={String(summary.reorder_now_products)}
          icon={PackagePlus}
          variant="warning"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="A caminho"
          value={String(summary.in_transit_units)}
          icon={PackagePlus}
          variant="warning"
          size="compact"
          loading={loading}
        />
      </div>

      <div className="mb-5 space-y-3">
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por produto, SKU ou código..."
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
            <Skeleton
              key={index}
              className="h-32 rounded-xl lg:h-16"
            />
          ))}
        </div>
      ) : (
        <InventoryList
          items={items}
          emptyAction={() =>
            router.push("/business/purchases/new")
          }
        />
      )}

      {pagination.total_pages > 1 && !loading && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border/60 bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">
            {Math.min(
              (pagination.page - 1) *
                pagination.page_size +
                1,
              pagination.total_count
            )}{" "}
            -{" "}
            {Math.min(
              pagination.page * pagination.page_size,
              pagination.total_count
            )}{" "}
            de {pagination.total_count}
          </p>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) =>
                  Math.max(current - 1, 1)
                )
              }
            >
              Anterior
            </Button>

            <span className="px-2 text-sm text-text-secondary">
              Página {pagination.page} de{" "}
              {pagination.total_pages}
            </span>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= pagination.total_pages}
              onClick={() =>
                setPage((current) =>
                  Math.min(
                    current + 1,
                    pagination.total_pages
                  )
                )
              }
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Filters
              filter={filter}
              sort={sort}
              onFilterChange={handleFilterChange}
              onSortChange={handleSortChange}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => setFiltersOpen(false)}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdjustInventoryDialog
        open={adjustOpen}
        products={[]}
        workspaceId={workspaceId}
        loading={adjusting}
        onOpenChange={setAdjustOpen}
        onConfirm={handleAdjust}
      />
    </div>
  );
}

function Filters({
  filter,
  sort,
  onFilterChange,
  onSortChange,
}: {
  filter: InventoryFilter;
  sort: InventorySort;
  onFilterChange: (value: InventoryFilter) => void;
  onSortChange: (value: InventorySort) => void;
}) {
  return (
    <>
      <Select
        value={filter}
        onValueChange={(value) =>
          onFilterChange(value as InventoryFilter)
        }
      >
        <SelectTrigger
          className="w-full"
          aria-label="Filtrar estoque"
        >
          <SelectValue placeholder="Filtro" />
        </SelectTrigger>

        <SelectContent>
          {INVENTORY_FILTER_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={sort}
        onValueChange={(value) =>
          onSortChange(value as InventorySort)
        }
      >
        <SelectTrigger
          className="w-full"
          aria-label="Ordenar estoque"
        >
          <SelectValue placeholder="Ordenação" />
        </SelectTrigger>

        <SelectContent>
          {INVENTORY_SORT_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function getInventoryErrorMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "";

  if (
    message.includes("negativo") ||
    message.includes("maior que o estoque") ||
    message.includes("disponivel negativo")
  ) {
    return "A quantidade informada é maior que o estoque disponível.";
  }

  if (
    message.includes("Custo unitario") ||
    message.includes("Custo unitário")
  ) {
    return "Informe um custo unitário válido para a entrada.";
  }

  return "Não foi possível ajustar o estoque.";
}