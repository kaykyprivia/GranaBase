"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageIntro } from "@/components/shared/PageIntro";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PurchaseForm } from "@/components/business/purchases/PurchaseForm";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import {
  calculatePurchasePreview,
  makeBusinessIdempotencyKey,
  makeBusinessStableIdempotencyKey,
  type PurchaseFormDraft,
} from "@/lib/business-purchases";
import type { BusinessProduct } from "@/types/database";
import type { PurchaseCreateResult, WorkspaceRpcResult } from "@/components/business/purchases/types";

export function NewPurchasePageClient() {
  const router = useRouter();
  const supabase = createClient();
  const createSessionKey = useRef(makeBusinessIdempotencyKey("purchase-create-session"));
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [products, setProducts] = useState<BusinessProduct[]>([]);

  const loadContext = useCallback(async () => {
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

      const productsRes = await supabase
        .from("business_products")
        .select("*")
        .eq("workspace_id", workspace.workspace_id)
        .eq("active", true)
        .order("name", { ascending: true });

      if (productsRes.error) throw productsRes.error;

      setWorkspaceId(workspace.workspace_id);
      setProducts(coerceData<BusinessProduct[]>(productsRes.data ?? []));
    } catch (error) {
      console.error("Erro ao preparar nova compra", error);
      toast.error("Não foi possível preparar a nova compra.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const handleSubmit = async (draft: PurchaseFormDraft, productMode: "existing" | "new") => {
    if (!workspaceId) {
      toast.error("Não foi possível identificar o negócio.");
      return;
    }

    setSubmitting(true);
    try {
      const preview = calculatePurchasePreview({
        quantity: draft.quantity,
        productSubtotal: draft.productSubtotal,
        shippingCost: draft.shippingCost,
        additionalCosts: draft.additionalCosts,
      });
      const idempotencyKey = makeBusinessStableIdempotencyKey("purchase-create", [
        createSessionKey.current,
        workspaceId,
        productMode,
        draft.productId ?? null,
        draft.productName?.trim() ?? null,
        draft.productSku?.trim() ?? null,
        draft.suggestedSalePrice ?? null,
        draft.minimumStock ?? 0,
        draft.quantity,
        preview.unitPurchaseCost,
        draft.shippingCost ?? 0,
        draft.additionalCosts ?? 0,
        draft.purchaseDate,
        draft.expectedArrivalDate || null,
        draft.origin?.trim() || null,
        draft.notes?.trim() || null,
      ]);

      const purchaseRes = productMode === "new"
        ? await supabase.rpc("create_business_product_and_purchase", coerceMutation({
            p_workspace_id: workspaceId,
            p_product_name: draft.productName!.trim(),
            p_product_sku: draft.productSku?.trim() || null,
            p_default_sale_price: draft.suggestedSalePrice ? draft.suggestedSalePrice : null,
            p_minimum_stock: draft.minimumStock ?? 0,
            p_quantity: draft.quantity,
            p_unit_purchase_cost: preview.unitPurchaseCost,
            p_idempotency_key: idempotencyKey,
            p_shipping_cost: draft.shippingCost ?? 0,
            p_additional_costs: draft.additionalCosts ?? 0,
            p_purchase_date: draft.purchaseDate,
            p_expected_arrival_date: draft.expectedArrivalDate || null,
            p_origin: draft.origin?.trim() || null,
            p_notes: draft.notes?.trim() || null,
          }))
        : await supabase.rpc("create_business_purchase", coerceMutation({
            p_workspace_id: workspaceId,
            p_product_id: draft.productId!,
            p_quantity: draft.quantity,
            p_unit_purchase_cost: preview.unitPurchaseCost,
            p_idempotency_key: idempotencyKey,
            p_shipping_cost: draft.shippingCost ?? 0,
            p_additional_costs: draft.additionalCosts ?? 0,
            p_purchase_date: draft.purchaseDate,
            p_expected_arrival_date: draft.expectedArrivalDate || null,
            p_origin: draft.origin?.trim() || null,
            p_notes: draft.notes?.trim() || null,
          }));

      if (purchaseRes.error) throw purchaseRes.error;
      const result = coerceData<PurchaseCreateResult>(purchaseRes.data);
      toast.success("Compra registrada com sucesso.");
      router.push(`/business/purchases/${result.purchase_order_id}`);
    } catch (error) {
      console.error("Erro ao registrar compra", error);
      toast.error("Não foi possível registrar a compra.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={ShoppingCart}
        iconTone="accent"
        title="Nova compra"
        description="Registre o que você comprou; o GranaBase cuida do custo real e da entrada no estoque."
        actions={
          <Button type="button" size="sm" variant="outline" onClick={() => router.push("/business/purchases")} className="min-h-10">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <div className="mx-auto max-w-3xl rounded-xl border border-border/60 bg-surface p-4 shadow-card sm:p-6">
          <PurchaseForm products={products} submitting={submitting} onSubmit={handleSubmit} />
        </div>
      )}
    </div>
  );
}
