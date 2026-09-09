"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  filterInventoryItems,
  INVENTORY_FILTER_OPTIONS,
  INVENTORY_SORT_OPTIONS,
  sortInventoryItems,
  summarizeInventory,
  type InventoryFilter,
  type InventoryItem,
  type InventorySort,
} from "@/lib/business-inventory";
import { makeBusinessStableIdempotencyKey } from "@/lib/business-purchases";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { cn, formatCurrency } from "@/lib/utils";
import type { Database } from "@/types/database";
import type { WorkspaceRpcResult } from "@/components/business/inventory/types";

type AdjustArgs = Database["public"]["Functions"]["adjust_business_inventory"]["Args"];

export function InventoryPageClient() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<InventoryFilter>("all");
  const [sort, setSort] = useState<InventorySort>("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  const loadInventory = useCallback(async () => {
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

      const inventoryRes = await supabase
        .from("business_inventory_summary")
        .select("*")
        .eq("workspace_id", workspace.workspace_id)
        .order("name", { ascending: true });

      if (inventoryRes.error) throw inventoryRes.error;
      setItems(coerceData<InventoryItem[]>(inventoryRes.data ?? []));
    } catch (error) {
      console.error("Erro ao carregar estoque", error);
      toast.error("Não foi possível carregar o estoque agora.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const visibleItems = useMemo(
    () => sortInventoryItems(filterInventoryItems(items, filter, search), sort),
    [filter, items, search, sort]
  );
  const summary = useMemo(() => summarizeInventory(items), [items]);
  const activeProducts = useMemo(() => items.filter((item) => item.active), [items]);

  async function handleAdjust(payload: {
    productId: string;
    quantityDelta: number;
    movementType: AdjustArgs["p_movement_type"];
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
        description="Controle seus produtos, quantidades, custos e movimentações."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="min-h-10">
              <Link href="/business/purchases/new">
                <PackagePlus className="h-4 w-4" />
                Registrar compra
              </Link>
            </Button>
            <Button type="button" size="sm" className="min-h-10" onClick={() => setAdjustOpen(true)}>
              <Plus className="h-4 w-4" />
              Ajustar estoque
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard title="Capital em estoque" value={formatCurrency(summary.inventoryValue)} icon={TrendingUp} variant="accent" size="compact" loading={loading} />
        <StatCard title="Produtos em estoque" value={String(summary.productsInStock)} icon={Boxes} variant="profit" size="compact" loading={loading} />
        <StatCard title="Unidades disponíveis" value={String(summary.availableUnits)} icon={PackageCheck} variant="default" size="compact" loading={loading} />
        <StatCard title="Estoque baixo" value={String(summary.lowStockProducts)} icon={ClipboardList} variant="warning" size="compact" loading={loading} />
        <StatCard title="A caminho" value={String(summary.inTransitUnits)} icon={PackagePlus} variant="warning" size="compact" loading={loading} />
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
          <Button type="button" variant="outline" className="min-h-11 lg:hidden" onClick={() => setFiltersOpen(true)} aria-label="Abrir filtros">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <div className="hidden gap-3 lg:flex">
          <Filters filter={filter} sort={sort} onFilterChange={setFilter} onSortChange={setSort} />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {INVENTORY_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                "min-h-10 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors",
                filter === option.value
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border/60 bg-surface text-text-secondary"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl lg:h-16" />
          ))}
        </div>
      ) : (
        <InventoryList items={visibleItems} emptyAction={() => router.push("/business/purchases/new")} />
      )}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Filters filter={filter} sort={sort} onFilterChange={setFilter} onSortChange={setSort} />
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setFiltersOpen(false)}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AdjustInventoryDialog
        open={adjustOpen}
        products={activeProducts}
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
      <Select value={filter} onValueChange={(value) => onFilterChange(value as InventoryFilter)}>
        <SelectTrigger className="w-full lg:w-56" aria-label="Filtrar estoque"><SelectValue placeholder="Filtro" /></SelectTrigger>
        <SelectContent>
          {INVENTORY_FILTER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(value) => onSortChange(value as InventorySort)}>
        <SelectTrigger className="w-full lg:w-56" aria-label="Ordenar estoque"><SelectValue placeholder="Ordenação" /></SelectTrigger>
        <SelectContent>
          {INVENTORY_SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function getInventoryErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("negativo") || message.includes("maior que o estoque") || message.includes("disponivel negativo")) {
    return "A quantidade informada é maior que o estoque disponível.";
  }
  if (message.includes("Custo unitario") || message.includes("Custo unitário")) {
    return "Informe um custo unitário válido para a entrada.";
  }
  return "Não foi possível ajustar o estoque.";
}
