"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ShoppingCart,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageIntro } from "@/components/shared/PageIntro";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PurchaseForm } from "@/components/business/purchases/PurchaseForm";
import { createClient } from "@/lib/supabase/client";
import {
  coerceData,
} from "@/lib/supabase/casts";
import {
  buildPurchaseMultiRpcItems,
  makeBusinessIdempotencyKey,
  makeBusinessStableIdempotencyKey,
  type MultiPurchaseDraft,
} from "@/lib/business-purchases";
import type {
  BusinessProductCategory,
  BusinessProduct,
} from "@/types/database";
import type {
  WorkspaceRpcResult,
} from "@/components/business/purchases/types";

interface NewPurchaseFormClientProps {
  onCreated?: (purchaseOrderId: string) => void | Promise<void>;
  onCancel?: () => void;
}

export function NewPurchaseFormClient({
  onCreated,
  onCancel,
}: NewPurchaseFormClientProps) {
  const router = useRouter();

  const supabase = useMemo(
    () => createClient(),
    []
  );

  const createSessionKey = useRef(
    makeBusinessIdempotencyKey(
      "purchase-create-session"
    )
  );

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [workspaceId, setWorkspaceId] =
    useState("");

  const [products, setProducts] =
    useState<BusinessProduct[]>([]);
  const [categories, setCategories] =
    useState<BusinessProductCategory[]>([]);

  const loadContext = useCallback(
    async () => {
      setLoading(true);

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          toast.error(
            "Sessão expirada. Entre novamente."
          );
          router.push("/login");
          return;
        }

        const workspaceRes =
          await supabase.rpc(
            "get_or_create_business_workspace",
            {
              p_name: "Meu Negócio",
            }
          );

        if (workspaceRes.error) {
          throw workspaceRes.error;
        }

        const workspace =
          coerceData<WorkspaceRpcResult>(
            workspaceRes.data
          );

        const [productsRes, categoriesRes] =
          await Promise.all([
            supabase
            .from("business_products")
            .select("*")
            .eq(
              "workspace_id",
              workspace.workspace_id
            )
            .eq("active", true)
            .order("name", {
              ascending: true,
            }),
            supabase
              .from("business_product_categories")
              .select("*")
              .eq(
                "workspace_id",
                workspace.workspace_id
              )
              .eq("active", true)
              .order("name", {
                ascending: true,
              }),
          ]);

        if (productsRes.error) {
          throw productsRes.error;
        }
        if (categoriesRes.error) {
          throw categoriesRes.error;
        }

        setWorkspaceId(
          workspace.workspace_id
        );

        setProducts(
          coerceData<BusinessProduct[]>(
            productsRes.data ?? []
          )
        );
        setCategories(
          coerceData<BusinessProductCategory[]>(
            categoriesRes.data ?? []
          )
        );
      } catch (error) {
        console.error(
          "Erro ao preparar nova compra",
          error
        );

        toast.error(
          "Não foi possível preparar a nova compra."
        );
      } finally {
        setLoading(false);
      }
    },
    [router, supabase]
  );

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const handleSubmit = async (
    draft: MultiPurchaseDraft
  ) => {
    if (!workspaceId) {
      toast.error(
        "Não foi possível identificar o negócio."
      );
      return;
    }

    setSubmitting(true);

    try {
      const rpcItems =
        buildPurchaseMultiRpcItems(draft);

      const idempotencyKey =
        makeBusinessStableIdempotencyKey(
          "purchase-create-multi",
          [
            createSessionKey.current,
            workspaceId,
            JSON.stringify(rpcItems),
            draft.shippingCost ?? 0,
            draft.additionalCosts ?? 0,
            draft.purchaseDate,
            draft.expectedArrivalDate ||
              null,
            draft.origin?.trim() || null,
            draft.notes?.trim() || null,
          ]
        );

      const purchaseRes =
        await supabase.rpc(
          "create_business_purchase_multi",
          {
            p_workspace_id: workspaceId,
            p_items: rpcItems,
            p_idempotency_key:
              idempotencyKey,
            p_shipping_cost:
              draft.shippingCost ?? 0,
            p_additional_costs:
              draft.additionalCosts ?? 0,
            p_purchase_date:
              draft.purchaseDate,
            p_expected_arrival_date:
              draft.expectedArrivalDate ||
              null,
            p_origin:
              draft.origin?.trim() ||
              null,
            p_notes:
              draft.notes?.trim() ||
              null,
          }
        );

      if (purchaseRes.error) {
        throw purchaseRes.error;
      }

      const result = coerceData<{
        purchase_order_id: string;
      }>(purchaseRes.data);

      toast.success(
        draft.items.length > 1
          ? `Compra com ${draft.items.length} produtos registrada com sucesso.`
          : "Compra registrada com sucesso."
      );

      if (onCreated) {
        await onCreated(result.purchase_order_id);
      } else {
        router.push(
          `/business/purchases/${result.purchase_order_id}`
        );
      }
    } catch (error) {
      console.error(
        "Erro ao registrar compra",
        error
      );

      toast.error(
        "Não foi possível registrar a compra."
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <PurchaseForm
      products={products}
      categories={categories}
      submitting={submitting}
      onSubmit={handleSubmit}
      onCancel={onCancel}
    />
  );
}

export function NewPurchasePageClient() {
  const router = useRouter();

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={ShoppingCart}
        iconTone="accent"
        title="Nova compra"
        description="Registre todos os produtos do pedido em uma única compra; o GranaBase distribui os custos e prepara a entrada correta no estoque."
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              router.push(
                "/business/purchases"
              )
            }
            className="min-h-10"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        }
      />

      <div className="mx-auto max-w-4xl rounded-xl border border-border/60 bg-surface p-4 shadow-card sm:p-6">
        <NewPurchaseFormClient />
      </div>
    </div>
  );
}
