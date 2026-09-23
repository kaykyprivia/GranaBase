"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SaleForm } from "@/components/business/sales/SaleForm";
import type { SaleCreateResult, WorkspaceRpcResult } from "@/components/business/sales/types";
import { PageIntro } from "@/components/shared/PageIntro";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSaleErrorMessage, type SaleFormDraft } from "@/lib/business-sales";
import { makeBusinessIdempotencyKey } from "@/lib/business-purchases";
import { createClient } from "@/lib/supabase/client";
import { coerceData } from "@/lib/supabase/casts";
import type { BusinessCustomer, BusinessInventorySummary, Database } from "@/types/database";

type CreateSaleArgs = Database["public"]["Functions"]["create_business_sale"]["Args"];
type SearchCustomersArgs = Database["public"]["Functions"]["search_business_customers"]["Args"];

export function NewSalePageClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [products, setProducts] = useState<BusinessInventorySummary[]>([]);
  const [customers, setCustomers] = useState<BusinessCustomer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast.error("Sessao expirada. Entre novamente.");
        router.push("/login");
        return;
      }
      setUserId(user.id);

      const workspaceRes = await supabase.rpc("get_or_create_business_workspace", { p_name: "Meu Negocio" });
      if (workspaceRes.error) throw workspaceRes.error;
      const workspace = coerceData<WorkspaceRpcResult>(workspaceRes.data);
      setWorkspaceId(workspace.workspace_id);

      const inventoryRes = await supabase
        .from("business_inventory_summary")
        .select("*")
        .eq("workspace_id", workspace.workspace_id)
        .gt("available", 0)
        .eq("active", true)
        .order("name", { ascending: true });

      if (inventoryRes.error) throw inventoryRes.error;

      setProducts(
        coerceData<BusinessInventorySummary[]>(
          inventoryRes.data ?? []
        )
      );
    } catch (error) {
      console.error("Erro ao carregar nova venda", error);
      toast.error("Nao foi possivel preparar a venda agora.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedCustomerSearch(
        customerSearch.trim()
      );
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [customerSearch]);

  useEffect(() => {
    if (!workspaceId) return;

    let active = true;

    async function loadCustomers() {
      const args = {
        p_workspace_id: workspaceId,
        p_search:
          debouncedCustomerSearch || null,
        p_limit: 20,
      } satisfies SearchCustomersArgs;

      const result = await supabase.rpc(
        "search_business_customers",
        args
      );

      if (!active) return;

      if (result.error) {
        console.error(
          "Erro ao buscar clientes",
          result.error
        );
        return;
      }

      setCustomers(
        coerceData<BusinessCustomer[]>(
          result.data ?? []
        )
      );
    }

    void loadCustomers();

    return () => {
      active = false;
    };
  }, [
    debouncedCustomerSearch,
    supabase,
    workspaceId,
  ]);
  async function handleSubmit(draft: SaleFormDraft) {
    setSubmitting(true);
    try {
      let customerId = draft.customerId || null;
      const quickCustomerName = draft.quickCustomerName?.trim();
      if (!customerId && quickCustomerName) {
        const customerRes = await supabase
          .from("business_customers")
          .insert({
            user_id: userId,
            workspace_id: workspaceId,
            name: quickCustomerName,
            whatsapp: draft.quickCustomerWhatsapp?.trim() || null,
          })
          .select("*")
          .single();
        if (customerRes.error) throw customerRes.error;
        customerId = coerceData<BusinessCustomer>(customerRes.data).id;
      }

      const args = {
        p_workspace_id: workspaceId,
        p_items: draft.items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_sale_price: item.unitSalePrice,
          discount_amount: item.discountAmount ?? 0,
          platform_fee: item.platformFee ?? 0,
          shipping_cost: 0,
          additional_costs: item.additionalCosts ?? 0,
        })),
        p_idempotency_key: makeBusinessIdempotencyKey("sale-create"),
        p_customer_id: customerId,
        p_sale_date: (() => {
          const [year, month, day] = draft.saleDate
            .split("-")
            .map(Number);
          const now = new Date();

          return new Date(
            year,
            month - 1,
            day,
            now.getHours(),
            now.getMinutes(),
            now.getSeconds(),
            now.getMilliseconds()
          ).toISOString();
        })(),
        p_notes: draft.notes?.trim() || null,
        p_reserve: true,
        p_sales_channel: draft.salesChannel,
        p_delivery_fee: draft.deliveryFee,
        p_delivery_cost: draft.deliveryCost,
        p_delivery_method: draft.deliveryMethod,
      } satisfies CreateSaleArgs;

      const { data, error } = await supabase.rpc("create_business_sale", args);
      if (error) throw error;
      const result = coerceData<SaleCreateResult>(data);
      toast.success("Venda registrada com sucesso.");
      router.push(`/business/sales/${result.sale_id}`);
    } catch (error) {
      console.error("Erro ao registrar venda", error);
      toast.error(getSaleErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container animate-fade-in">
        <Skeleton className="mb-6 h-20 rounded-xl" />
        <Skeleton className="mx-auto h-[560px] max-w-4xl rounded-xl" />
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={PackageCheck}
        iconTone="accent"
        title="Nova venda"
        description="Registre produtos, reserve estoque e acompanhe pagamento e entrega."
        actions={
          <Button type="button" size="sm" variant="outline" onClick={() => router.push("/business/sales")} className="min-h-10">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        }
      />

      <div className="mx-auto max-w-5xl rounded-xl border border-border/60 bg-surface p-4 shadow-card sm:p-6">
        {products.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-text-secondary">Nao ha produtos disponiveis para venda.</p>
            <Button type="button" className="mt-4" onClick={() => router.push("/business/purchases/new")}>
              Registrar compra
            </Button>
          </div>
        ) : (
          <SaleForm
            products={products}
            customers={customers}
            customerSearch={customerSearch}
            onCustomerSearchChange={setCustomerSearch}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  );
}
