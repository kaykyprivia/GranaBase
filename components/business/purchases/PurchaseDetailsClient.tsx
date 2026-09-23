"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, PackageCheck, Pencil, ReceiptText, ShoppingCart, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { coerceData } from "@/lib/supabase/casts";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
import {
  buildPurchaseMultiRpcItems,
  calculatePurchasePaymentSummary,
  canCancelPurchase,
  canEditPurchase,
  canReceivePurchase,
  getPurchaseReceiptState,
  getPurchaseStatusMeta,
  makeBusinessStableIdempotencyKey,
} from "@/lib/business-purchases";
import type { MultiPurchaseDraft } from "@/lib/business-purchases";
import type {
  BusinessAuditLog,
  BusinessInventoryMovement,
  BusinessProduct,
  BusinessProductCategory,
  BusinessPurchaseItem,
  BusinessPurchaseOrder,
  BusinessPurchasePayment,
  BusinessPurchasePaymentStatus,
  Database,
} from "@/types/database";
import { PurchaseStatusBadge } from "@/components/business/purchases/PurchaseStatusBadge";
import { ReceivePurchaseDialog } from "@/components/business/purchases/ReceivePurchaseDialog";
import { EditPurchaseDialog } from "@/components/business/purchases/EditPurchaseDialog";
import { RecordPurchasePaymentDialog } from "@/components/business/purchases/RecordPurchasePaymentDialog";
import type { PurchaseDetail, PurchaseReceiptInput, WorkspaceRpcResult } from "@/components/business/purchases/types";

type PurchasePaymentArgs = Database["public"]["Functions"]["record_business_purchase_payment"]["Args"];

export function PurchaseDetailsClient({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [purchase, setPurchase] = useState<PurchaseDetail | null>(null);
  const [products, setProducts] = useState<BusinessProduct[]>([]);
  const [categories, setCategories] = useState<BusinessProductCategory[]>([]);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);

  const loadPurchase = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast.error("Sessão expirada. Entre novamente.");
        router.push("/login");
        return;
      }

      const workspaceRes = await supabase.rpc("get_or_create_business_workspace", { p_name: "Meu Negócio" });
      if (workspaceRes.error) throw workspaceRes.error;
      const workspace = coerceData<WorkspaceRpcResult>(workspaceRes.data);

      const orderRes = await supabase
        .from("business_purchase_orders")
        .select("*")
        .eq("id", purchaseId)
        .eq("workspace_id", workspace.workspace_id)
        .maybeSingle();

      if (orderRes.error) throw orderRes.error;
      if (!orderRes.data) {
        setPurchase(null);
        return;
      }

      const order = coerceData<BusinessPurchaseOrder>(orderRes.data);
      const [itemsRes, movementsRes, paymentsRes, auditRes] = await Promise.all([
        supabase
          .from("business_purchase_items")
          .select("*")
          .eq("purchase_order_id", order.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("business_inventory_movements")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .eq("reference_type", "purchase_order")
          .eq("reference_id", order.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("business_purchase_payments")
          .select("*")
          .eq("purchase_order_id", order.id)
          .order("paid_at", { ascending: true }),
        supabase
          .from("business_audit_logs")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .eq("entity_type", "purchase_order")
          .eq("entity_id", order.id)
          .order("created_at", { ascending: true }),
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (movementsRes.error) throw movementsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (auditRes.error) throw auditRes.error;

      const items = coerceData<BusinessPurchaseItem[]>(
        itemsRes.data ?? []
      );

      const [productsRes, categoriesRes] = await Promise.all([
        supabase
          .from("business_products")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .order("name", { ascending: true }),
        supabase
          .from("business_product_categories")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (productsRes.error) {
        throw productsRes.error;
      }
      if (categoriesRes.error) {
        throw categoriesRes.error;
      }

      const allProducts =
        coerceData<BusinessProduct[]>(
          productsRes.data ?? []
        );

      const productsById = new Map(
        allProducts.map((product) => [
          product.id,
          product,
        ])
      );

      setProducts(
        allProducts.filter(
          (product) => product.active
        )
      );
      setCategories(
        coerceData<BusinessProductCategory[]>(
          categoriesRes.data ?? []
        )
      );

      const purchaseItems = items.map((item) => ({
        item,
        product: productsById.get(item.product_id) ?? null,
      }));

      const primaryLine = purchaseItems[0] ?? null;

      setPurchase({
        ...order,
        items: purchaseItems,
        item: primaryLine?.item ?? null,
        product: primaryLine?.product ?? null,
        movements: coerceData<BusinessInventoryMovement[]>(movementsRes.data ?? []),
        auditLogs: coerceData<BusinessAuditLog[]>(auditRes.data ?? []),
        payments: coerceData<BusinessPurchasePayment[]>(paymentsRes.data ?? []),
      });
    } catch (error) {
      console.error("Erro ao carregar detalhe da compra", error);
      toast.error("Não foi possível carregar esta compra.");
    } finally {
      setLoading(false);
    }
  }, [purchaseId, router, supabase]);

  useEffect(() => {
    void loadPurchase();
  }, [loadPurchase]);

  const totalOrdered = purchase?.items.reduce(
    (sum, { item }) => sum + item.quantity_ordered,
    0
  ) ?? 0;

  const totalReceived = purchase?.items.reduce(
    (sum, { item }) => sum + item.quantity_received,
    0
  ) ?? 0;

  const receipt = purchase && totalOrdered > 0
    ? getPurchaseReceiptState({
        quantityOrdered: totalOrdered,
        quantityReceived: totalReceived,
      })
    : null;

  const paymentSummary = purchase
    ? calculatePurchasePaymentSummary({
        totalAmount: purchase.total_cost,
        payments: purchase.payments,
      })
    : null;

  const canReceive = purchase
    ? canReceivePurchase(
        purchase.status,
        totalOrdered,
        totalReceived
      )
    : false;

  const canCancel = purchase
    ? canCancelPurchase(
        purchase.status,
        totalReceived
      )
    : false;

  const canEdit = purchase
    ? canEditPurchase(
        purchase.status,
        totalReceived
      )
    : false;

  const primaryProductName =
    purchase?.items[0]?.product?.name ??
    "Compra";

  const extraProducts = Math.max(
    (purchase?.items.length ?? 0) - 1,
    0
  );

  const purchaseTitle =
    extraProducts > 0
      ? `${primaryProductName} + ${extraProducts} ${
          extraProducts === 1
            ? "produto"
            : "produtos"
        }`
      : primaryProductName;

  const statusMeta = purchase
    ? getPurchaseStatusMeta(purchase.status)
    : null;

  const timeline = useMemo(
    () => (purchase ? buildTimeline(purchase) : []),
    [purchase]
  );

  const handlePurchasePayment = async (payload: {
    amount: number;
    method: string;
    paidAt: string;
    notes?: string;
    status: BusinessPurchasePaymentStatus;
  }) => {
    if (!purchase) return;

    setRecordingPayment(true);
    try {
      const args = {
        p_purchase_order_id: purchase.id,
        p_amount: payload.amount,
        p_idempotency_key: makeBusinessStableIdempotencyKey(
          "purchase-payment",
          [
            purchase.id,
            purchase.payments.length,
            payload.status,
            payload.amount,
            payload.method,
            payload.paidAt,
            payload.notes?.trim() ?? "",
          ]
        ),
        p_payment_method: payload.method,
        p_status: payload.status,
        p_paid_at: new Date(`${payload.paidAt}T12:00:00`).toISOString(),
        p_notes: payload.notes?.trim() || null,
      } satisfies PurchasePaymentArgs;

      const { error } = await supabase.rpc(
        "record_business_purchase_payment",
        args
      );

      if (error) throw error;

      toast.success(
        payload.status === "PAID"
          ? "Pagamento registrado."
          : "Estorno registrado."
      );
      setPaymentOpen(false);
      await loadPurchase();
    } catch (error) {
      console.error("Erro ao registrar movimentação financeira da compra", error);
      toast.error(
        payload.status === "PAID"
          ? "Não foi possível registrar o pagamento."
          : "Não foi possível registrar o estorno."
      );
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleReceive = async (items: PurchaseReceiptInput[]) => {
    if (!purchase) return;

    setReceiving(true);

    try {
      const currentState = purchase.items.map(({ item }) => [
        item.id,
        item.quantity_received,
      ]);

      const totalRemaining = purchase.items.reduce(
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
        {
          p_purchase_order_id: purchase.id,
          p_items: items,
          p_idempotency_key: makeBusinessStableIdempotencyKey(
            "purchase-receipt-items",
            [
              purchase.id,
              JSON.stringify(currentState),
              JSON.stringify(items),
            ]
          ),
        }
      );

      if (error) throw error;

      toast.success(
        receivedNow >= totalRemaining
          ? "Compra recebida."
          : "Recebimento registrado."
      );

      setReceiveOpen(false);
      await loadPurchase();
    } catch (error) {
      console.error("Erro ao receber compra", error);
      toast.error("Não foi possível registrar o recebimento.");
    } finally {
      setReceiving(false);
    }
  };
  const handleEdit = async (draft: MultiPurchaseDraft) => {
    if (!purchase) return;

    setEditing(true);

    try {
      const rpcItems = buildPurchaseMultiRpcItems(draft);

      const clearExpectedArrivalDate =
        !draft.expectedArrivalDate;

      const clearOrigin =
        !draft.origin?.trim();

      const clearNotes =
        !draft.notes?.trim();

      const { error } = await supabase.rpc(
        "update_business_purchase_multi",
        {
          p_purchase_order_id: purchase.id,
          p_items: rpcItems,
          p_idempotency_key:
            makeBusinessStableIdempotencyKey(
              "purchase-update-multi",
              [
                purchase.id,
                JSON.stringify(rpcItems),
                draft.shippingCost ?? 0,
                draft.additionalCosts ?? 0,
                draft.purchaseDate,
                draft.expectedArrivalDate ?? "",
                draft.origin?.trim() ?? "",
                draft.notes?.trim() ?? "",
              ]
            ),
          p_shipping_cost:
            draft.shippingCost ?? 0,
          p_additional_costs:
            draft.additionalCosts ?? 0,
          p_purchase_date:
            draft.purchaseDate,
          p_expected_arrival_date:
            clearExpectedArrivalDate
              ? null
              : draft.expectedArrivalDate,
          p_origin:
            clearOrigin
              ? null
              : draft.origin?.trim(),
          p_notes:
            clearNotes
              ? null
              : draft.notes?.trim(),
          p_clear_expected_arrival_date:
            clearExpectedArrivalDate,
          p_clear_origin:
            clearOrigin,
          p_clear_notes:
            clearNotes,
        }
      );

      if (error) throw error;

      toast.success("Compra atualizada.");
      setEditOpen(false);
      await loadPurchase();
    } catch (error) {
      console.error(
        "Erro ao editar compra",
        error
      );
      toast.error(
        "Não foi possível salvar as alterações."
      );
    } finally {
      setEditing(false);
    }
  };

  const handleCancel = async () => {
    if (!purchase) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("cancel_business_purchase", {
        p_purchase_order_id: purchase.id,
        p_idempotency_key: makeBusinessStableIdempotencyKey("purchase-cancel", [purchase.id, purchase.status]),
      });

      if (error) throw error;
      toast.success("Compra cancelada.");
      setCancelOpen(false);
      await loadPurchase();
    } catch (error) {
      console.error("Erro ao cancelar compra", error);
      toast.error("Não foi possível cancelar esta compra.");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container animate-fade-in">
        <Skeleton className="mb-6 h-20 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-44 rounded-xl lg:col-span-2" />
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-56 rounded-xl lg:col-span-3" />
        </div>
      </div>
    );
  }

  if (!purchase || purchase.items.length === 0 || !receipt || !statusMeta || !paymentSummary) {
    return (
      <div className="page-container animate-fade-in">
        <div className="rounded-xl border border-border/60 bg-surface p-6 text-center">
          <p className="text-sm text-text-secondary">Compra não encontrada.</p>
          <Button type="button" className="mt-4" onClick={() => router.push("/business/purchases")}>
            Voltar para compras
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={ShoppingCart}
        iconTone="accent"
        title={purchaseTitle}
        description={statusMeta.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => router.push("/business/purchases")} className="min-h-10">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            {((purchase.status !== "CANCELLED" && paymentSummary.remainingAmount > 0) || paymentSummary.refundableAmount > 0) && (
              <Button type="button" size="sm" variant="outline" onClick={() => setPaymentOpen(true)} className="min-h-10">
                <ReceiptText className="h-4 w-4" />
                Pagamento / Estorno
              </Button>
            )}
            {canReceive && (
              <Button type="button" size="sm" variant="profit" onClick={() => setReceiveOpen(true)} className="min-h-10">
                <PackageCheck className="h-4 w-4" />
                Registrar recebimento
              </Button>
            )}
            {canEdit && (
              <Button type="button" size="sm" variant="outline" onClick={() => setEditOpen(true)} className="min-h-10">
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            )}
            {canCancel && (
              <Button type="button" size="sm" variant="outline" onClick={() => setCancelOpen(true)} className="min-h-10 hover:text-expense">
                <XCircle className="h-4 w-4" />
                Cancelar
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard title="Valor mercadoria" value={formatCurrency(purchase.product_subtotal)} icon={ReceiptText} variant="default" size="compact" />
        <StatCard title="Frete" value={formatCurrency(purchase.shipping_cost)} icon={Clock3} variant="warning" size="compact" />
        <StatCard title="Total" value={formatCurrency(purchase.total_cost)} icon={ShoppingCart} variant="accent" size="compact" />
        <StatCard title="Produtos" value={String(purchase.items.length)} subtitle={`${totalOrdered} unidades`} icon={PackageCheck} variant="profit" size="compact" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Recebimento</h2>
              <p className="mt-1 text-sm text-text-secondary">{receipt.received} / {receipt.ordered} recebidos</p>
            </div>
            <PurchaseStatusBadge status={purchase.status} />
          </div>
          <Progress value={receipt.progress} className="h-2.5" indicatorClassName={purchase.status === "RECEIVED" ? "bg-profit" : "bg-accent"} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <DetailMiniStat label="Comprado" value={receipt.ordered} />
            <DetailMiniStat label="Recebido" value={receipt.received} />
            <DetailMiniStat label="Faltando" value={receipt.remaining} />
          </div>
          {!canReceive && purchase.status !== "RECEIVED" && purchase.status !== "CANCELLED" && (
            <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              Esta compra não permite novo recebimento no estado atual.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Financeiro</h2>
              <p className="mt-1 text-sm text-text-secondary">Pagamento da compra separado do recebimento físico.</p>
            </div>
            <span className="rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-xs font-medium text-text-secondary">
              {paymentSummary.status === "PENDING"
                ? "Pendente"
                : paymentSummary.status === "PARTIALLY_PAID"
                  ? "Pago parcialmente"
                  : paymentSummary.status === "PAID"
                    ? "Pago"
                    : "Estornado"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DetailFinanceStat label="Total" value={formatCurrency(paymentSummary.totalAmount)} />
            <DetailFinanceStat label="Pago líquido" value={formatCurrency(paymentSummary.netPaidAmount)} />
            <DetailFinanceStat label="Restante" value={formatCurrency(paymentSummary.remainingAmount)} />
            <DetailFinanceStat label="Estornado" value={formatCurrency(paymentSummary.refundedAmount)} />
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Logística</h2>
          <div className="space-y-3 text-sm">
            <InfoRow label="Data da compra" value={formatDate(purchase.purchase_date)} />
            <InfoRow label="Previsão de chegada" value={purchase.expected_arrival_date ? formatDate(purchase.expected_arrival_date) : "Sem previsão"} />
            <InfoRow label="Origem" value={purchase.origin || "Não informada"} />
            <InfoRow label="Itens no pedido" value={`${purchase.items.length} ${purchase.items.length === 1 ? "produto" : "produtos"}`} />
          </div>
        </section>

        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Produtos da compra
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {purchase.items.length} {purchase.items.length === 1 ? "produto" : "produtos"} · {totalOrdered} unidades
              </p>
            </div>
          </div>

          <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
            {purchase.items.map(({ item, product }) => {
              const itemReceipt = getPurchaseReceiptState({
                quantityOrdered: item.quantity_ordered,
                quantityReceived: item.quantity_received,
              });

              return (
                <div
                  key={item.id}
                  className="grid gap-4 bg-background/30 p-4 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(90px,0.7fr))] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-text-primary">
                      {product?.name ?? "Produto não encontrado"}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {product?.sku || "Sem SKU"}
                    </p>
                  </div>

                  <DetailProductValue
                    label="Comprado"
                    value={`${item.quantity_ordered} un.`}
                  />

                  <DetailProductValue
                    label="Recebido"
                    value={`${item.quantity_received} un.`}
                  />

                  <DetailProductValue
                    label="Custo real/un."
                    value={formatCurrency(item.real_unit_cost)}
                  />

                  <DetailProductValue
                    label="Custo da linha"
                    value={formatCurrency(
                      item.real_unit_cost * item.quantity_ordered
                    )}
                  />

                  {itemReceipt.remaining > 0 && (
                    <div className="sm:col-span-5">
                      <div className="mb-1 flex justify-between text-[11px] text-text-secondary">
                        <span>
                          {itemReceipt.received} de {itemReceipt.ordered} recebidos
                        </span>
                        <span>
                          {itemReceipt.progress}%
                        </span>
                      </div>
                      <Progress
                        value={itemReceipt.progress}
                        className="h-1.5"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Histórico</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-text-secondary">Ainda não há eventos registrados para esta compra.</p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((event) => (
                <li key={`${event.createdAt}-${event.label}`} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{event.label}</p>
                    <p className="text-xs text-text-secondary">{formatDate(event.createdAt.slice(0, 10))} Ã s {formatTime(event.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <ReceivePurchaseDialog
        open={receiveOpen}
        purchase={purchase}
        loading={receiving}
        onOpenChange={setReceiveOpen}
        onConfirm={handleReceive}
      />

      <RecordPurchasePaymentDialog
        open={paymentOpen}
        purchase={purchase}
        loading={recordingPayment}
        onOpenChange={setPaymentOpen}
        onConfirm={handlePurchasePayment}
      />

      <EditPurchaseDialog
        open={editOpen}
        purchase={purchase}
        products={products}
        categories={categories}
        loading={editing}
        onOpenChange={setEditOpen}
        onConfirm={handleEdit}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar esta compra?"
        description="A compra será marcada como cancelada e permanecerá no histórico. Nenhum registro será excluído."
        confirmLabel="Cancelar compra"
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </div>
  );
}

function DetailMiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-background/50 px-3 py-3">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="mt-1 text-base font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function DetailFinanceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/50 px-3 py-3">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-0 last:pb-0">
      <span className="text-text-secondary">{label}</span>
      <span className="text-right font-medium text-text-primary">{value}</span>
    </div>
  );
}

function buildTimeline(purchase: PurchaseDetail): Array<{ createdAt: string; label: string }> {
  const auditEvents = purchase.auditLogs.map((log) => ({
    createdAt: log.created_at,
    label: auditLabel(log.action),
  }));
  const movementEvents = purchase.movements.map((movement) => ({
    createdAt: movement.created_at,
    label: `${movement.quantity_delta} unidade${Math.abs(movement.quantity_delta) === 1 ? "" : "s"} recebida${Math.abs(movement.quantity_delta) === 1 ? "" : "s"}`,
  }));

  const paymentEvents = purchase.payments.map((payment) => ({
    createdAt: payment.paid_at,
    label: payment.status === "PAID"
      ? `Pagamento registrado · ${formatCurrency(payment.amount)}`
      : `Estorno registrado · ${formatCurrency(payment.amount)}`,
  }));

  return [...auditEvents, ...movementEvents, ...paymentEvents]
    .filter((event) => event.label !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    purchase_created: "Compra registrada",
    purchase_updated: "Compra atualizada",
    purchase_received: "Recebimento registrado",
    purchase_cancelled: "Compra cancelada",
  };

  return labels[action] ?? "Evento registrado";
}
function DetailProductValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p className="mt-0.5 break-words text-sm font-semibold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}
