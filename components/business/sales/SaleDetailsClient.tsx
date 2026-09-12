"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, HandCoins, PackageCheck, ReceiptText, RotateCcw, Truck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RecordPaymentDialog } from "@/components/business/sales/RecordPaymentDialog";
import { ReturnSaleDialog } from "@/components/business/sales/ReturnSaleDialog";
import { SaleOrderStatusBadge, SalePaymentStatusBadge } from "@/components/business/sales/SaleStatusBadges";
import type { SaleDetail, SaleItemRow, WorkspaceRpcResult } from "@/components/business/sales/types";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  calculatePaymentSummary,
  canCancelSale,
  canReturnSale,
  getNextSaleAdvanceAction,
  getSaleErrorMessage,
} from "@/lib/business-sales";
import { makeBusinessStableIdempotencyKey } from "@/lib/business-purchases";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { cn, formatCurrency, formatDate, formatTime } from "@/lib/utils";
import type {
  BusinessAuditLog,
  BusinessCustomer,
  BusinessInventoryMovement,
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
type ReturnArgs = Database["public"]["Functions"]["return_business_sale"]["Args"];

export function SaleDetailsClient({ saleId }: { saleId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const loadSale = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        toast.error("Sessao expirada. Entre novamente.");
        router.push("/login");
        return;
      }

      const workspaceRes = await supabase.rpc("get_or_create_business_workspace", coerceMutation({ p_name: "Meu Negocio" }));
      if (workspaceRes.error) throw workspaceRes.error;
      const workspace = coerceData<WorkspaceRpcResult>(workspaceRes.data);

      const saleRes = await supabase
        .from("business_sales")
        .select("*")
        .eq("id", saleId)
        .eq("workspace_id", workspace.workspace_id)
        .maybeSingle();
      if (saleRes.error) throw saleRes.error;
      if (!saleRes.data) {
        setSale(null);
        return;
      }

      const saleRow = coerceData<BusinessSale>(saleRes.data);
      const [itemsRes, paymentsRes, returnsRes, movementsRes, auditRes, customerRes] = await Promise.all([
        supabase.from("business_sale_items").select("*").eq("sale_id", saleRow.id).order("created_at", { ascending: true }),
        supabase.from("business_payments").select("*").eq("sale_id", saleRow.id).order("paid_at", { ascending: true }),
        supabase.from("business_sale_returns").select("*").eq("sale_id", saleRow.id).order("created_at", { ascending: true }),
        supabase
          .from("business_inventory_movements")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .eq("reference_id", saleRow.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("business_audit_logs")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .eq("entity_type", "sale")
          .eq("entity_id", saleRow.id)
          .order("created_at", { ascending: true }),
        saleRow.customer_id
          ? supabase.from("business_customers").select("*").eq("id", saleRow.customer_id).maybeSingle()
          : { data: null, error: null },
      ]);

      if (itemsRes.error) throw itemsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (returnsRes.error) throw returnsRes.error;
      if (movementsRes.error) throw movementsRes.error;
      if (auditRes.error) throw auditRes.error;
      if (customerRes.error) throw customerRes.error;

      const items = coerceData<BusinessSaleItem[]>(itemsRes.data ?? []);
      const returns = coerceData<BusinessSaleReturn[]>(returnsRes.data ?? []);
      const returnIds = returns.map((item) => item.id);
      const returnItemsRes = returnIds.length > 0
        ? await supabase.from("business_sale_return_items").select("*").in("return_id", returnIds)
        : { data: [], error: null };
      if (returnItemsRes.error) throw returnItemsRes.error;

      const productIds = Array.from(new Set(items.map((item) => item.product_id)));
      const productsRes = productIds.length > 0
        ? await supabase.from("business_products").select("*").in("id", productIds)
        : { data: [], error: null };
      if (productsRes.error) throw productsRes.error;

      const productsById = new Map(coerceData<BusinessProduct[]>(productsRes.data ?? []).map((product) => [product.id, product]));
      const returnItems = coerceData<BusinessSaleReturnItem[]>(returnItemsRes.data ?? []);
      const returnedByItemId = returnItems.reduce((map, item) => {
        map.set(item.sale_item_id, (map.get(item.sale_item_id) ?? 0) + item.quantity);
        return map;
      }, new Map<string, number>());

      setSale({
        ...saleRow,
        customer: coerceData<BusinessCustomer | null>(customerRes.data ?? null),
        items: items.map((item) => ({
          ...item,
          product: productsById.get(item.product_id) ?? null,
          returnedQuantity: returnedByItemId.get(item.id) ?? 0,
        })),
        payments: coerceData<BusinessPayment[]>(paymentsRes.data ?? []),
        auditLogs: coerceData<BusinessAuditLog[]>(auditRes.data ?? []),
        movements: coerceData<BusinessInventoryMovement[]>(movementsRes.data ?? []),
        returns,
        returnItems,
      });
    } catch (error) {
      console.error("Erro ao carregar venda", error);
      toast.error("Nao foi possivel carregar esta venda.");
    } finally {
      setLoading(false);
    }
  }, [router, saleId, supabase]);

  useEffect(() => {
    void loadSale();
  }, [loadSale]);

  const totals = useMemo(() => getSaleTotals(sale?.items ?? []), [sale?.items]);
  const payment = useMemo(
    () => calculatePaymentSummary({ totalAmount: totals.totalAmount, payments: sale?.payments ?? [] }),
    [sale?.payments, totals.totalAmount]
  );
  const timeline = useMemo(() => (sale ? buildTimeline(sale) : []), [sale]);
  const advanceAction = sale ? getNextSaleAdvanceAction(sale.order_status) : null;

  async function handleAdvance(nextStatus: Extract<BusinessSaleOrderStatus, "SEPARATED" | "SHIPPED" | "DELIVERED">) {
    if (!sale) return;
    setAdvancing(true);
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
      await loadSale();
    } catch (error) {
      console.error("Erro ao avancar venda", error);
      toast.error(getSaleErrorMessage(error));
    } finally {
      setAdvancing(false);
    }
  }

  async function handlePayment(payload: { amount: number; method: string; paidAt: string; notes?: string }) {
    if (!sale) return;
    setRecordingPayment(true);
    try {
      const args = {
        p_sale_id: sale.id,
        p_amount: payload.amount,
        p_idempotency_key: makeBusinessStableIdempotencyKey("sale-payment", [
          sale.id,
          sale.payments.length,
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
      setPaymentOpen(false);
      await loadSale();
    } catch (error) {
      console.error("Erro ao registrar pagamento", error);
      toast.error(getSaleErrorMessage(error));
    } finally {
      setRecordingPayment(false);
    }
  }

  async function handleCancel() {
    if (!sale) return;
    setCancelling(true);
    try {
      const args = {
        p_sale_id: sale.id,
        p_idempotency_key: makeBusinessStableIdempotencyKey("sale-cancel", [sale.id, sale.order_status]),
      } satisfies CancelArgs;
      const { error } = await supabase.rpc("cancel_business_sale", coerceMutation(args));
      if (error) throw error;
      toast.success("Venda cancelada.");
      setCancelOpen(false);
      await loadSale();
    } catch (error) {
      console.error("Erro ao cancelar venda", error);
      toast.error(getSaleErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  async function handleReturn(payload: { items: Array<{ saleItemId: string; quantity: number; restockable: boolean }>; refundAmount: number; notes?: string }) {
    if (!sale) return;
    setReturning(true);
    try {
      const args = {
        p_sale_id: sale.id,
        p_items: payload.items.map((item) => ({
          sale_item_id: item.saleItemId,
          quantity: item.quantity,
          restockable: item.restockable,
        })),
        p_idempotency_key: makeBusinessStableIdempotencyKey("sale-return", [
          sale.id,
          payload.items,
          payload.refundAmount,
          sale.returns.length,
          Date.now(),
        ]),
        p_refund_amount: payload.refundAmount,
        p_notes: payload.notes?.trim() || null,
      } satisfies ReturnArgs;
      const { error } = await supabase.rpc("return_business_sale", coerceMutation(args));
      if (error) throw error;
      toast.success("Devolucao registrada.");
      setReturnOpen(false);
      await loadSale();
    } catch (error) {
      console.error("Erro ao devolver venda", error);
      toast.error(getSaleErrorMessage(error));
    } finally {
      setReturning(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container animate-fade-in">
        <Skeleton className="mb-6 h-20 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="page-container animate-fade-in">
        <div className="rounded-xl border border-border/60 bg-surface p-6 text-center">
          <p className="text-sm text-text-secondary">Venda nao encontrada.</p>
          <Button type="button" className="mt-4" onClick={() => router.push("/business/sales")}>
            Voltar para vendas
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={PackageCheck}
        iconTone="accent"
        title={`Venda #${sale.sale_number}`}
        description={`${sale.customer?.name ?? "Cliente nao informado"} - ${formatDate(sale.sale_date.slice(0, 10))} as ${formatTime(sale.sale_date)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => router.push("/business/sales")} className="min-h-10">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
            {payment.remainingAmount > 0 && !["CANCELLED", "RETURNED"].includes(sale.order_status) && (
              <Button type="button" size="sm" variant="profit" onClick={() => setPaymentOpen(true)} className="min-h-10">
                <ReceiptText className="h-4 w-4" />
                Pagamento
              </Button>
            )}
            {advanceAction && (
              <Button type="button" size="sm" variant="outline" loading={advancing} onClick={() => handleAdvance(advanceAction.nextStatus)} className="min-h-10">
                <Truck className="h-4 w-4" />
                {advanceAction.label}
              </Button>
            )}
            {canReturnSale(sale.order_status) && (
              <Button type="button" size="sm" variant="outline" onClick={() => setReturnOpen(true)} className="min-h-10">
                <RotateCcw className="h-4 w-4" />
                Devolucao
              </Button>
            )}
            {canCancelSale(sale.order_status) && (
              <Button type="button" size="sm" variant="outline" onClick={() => setCancelOpen(true)} className="min-h-10 hover:text-expense">
                <XCircle className="h-4 w-4" />
                Cancelar
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard title="Total vendido" value={formatCurrency(totals.totalAmount)} icon={PackageCheck} variant="accent" size="compact" />
        <StatCard title="Pago" value={formatCurrency(payment.netPaidAmount)} icon={HandCoins} variant="profit" size="compact" />
        <StatCard title="Restante" value={formatCurrency(payment.remainingAmount)} icon={Clock3} variant={payment.remainingAmount > 0 ? "warning" : "default"} size="compact" />
        <StatCard title="CMV oficial" value={formatCurrency(totals.cogsAmount)} icon={ReceiptText} variant="default" size="compact" />
        <StatCard title="Lucro liquido" value={formatCurrency(totals.netProfit)} icon={PackageCheck} variant={totals.netProfit < 0 ? "expense" : "profit"} size="compact" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-text-primary">Produtos</h2>
            <div className="flex gap-2">
              <SaleOrderStatusBadge status={sale.order_status} />
              <SalePaymentStatusBadge status={sale.payment_status} />
            </div>
          </div>
          <div className="space-y-3">
            {sale.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/60 bg-background/35 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-text-primary">{item.product?.name ?? "Produto"}</p>
                    <p className="text-xs text-text-secondary">
                      {item.quantity} x {formatCurrency(item.unit_sale_price)}
                      {item.returnedQuantity > 0 ? ` - devolvido ${item.returnedQuantity}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-text-primary">{formatCurrency(item.final_amount)}</p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Mini label="Desconto" value={formatCurrency(item.discount_amount)} />
                  <Mini label="CMV" value={formatCurrency(item.cogs_amount)} />
                  <Mini label="Lucro bruto" value={formatCurrency(item.gross_profit)} />
                  <Mini label="Margem liquida" value={item.margin_pct === null ? "-" : `${item.margin_pct.toFixed(2)}%`} strong />
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Resumo financeiro</h2>
            <div className="space-y-2 text-sm">
              <InfoRow label="Subtotal" value={formatCurrency(totals.subtotal)} />
              <InfoRow label="Desconto" value={formatCurrency(totals.discountAmount)} />
              <InfoRow label="Total vendido" value={formatCurrency(totals.totalAmount)} strong />
              <InfoRow label="CMV" value={formatCurrency(totals.cogsAmount)} />
              <InfoRow label="Taxas" value={formatCurrency(totals.platformFee)} />
              <InfoRow label="Entrega" value={formatCurrency(totals.shippingCost)} />
              <InfoRow label="Outros custos" value={formatCurrency(totals.additionalCosts)} />
              <InfoRow label="Lucro bruto" value={formatCurrency(totals.grossProfit)} strong />
              <InfoRow label="Lucro liquido" value={formatCurrency(totals.netProfit)} strong danger={totals.netProfit < 0} />
              <InfoRow label="Margem liquida" value={totals.netMarginPct === null ? "-" : `${totals.netMarginPct.toFixed(2)}%`} strong />
            </div>
          </section>

          <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card">
            <h2 className="mb-4 text-base font-semibold text-text-primary">Pagamento</h2>
            <div className="space-y-2 text-sm">
              <InfoRow label="Total" value={formatCurrency(payment.totalAmount)} />
              <InfoRow label="Pago" value={formatCurrency(payment.paidAmount)} />
              <InfoRow label="Reembolsado" value={formatCurrency(payment.refundedAmount)} />
              <InfoRow label="Restante" value={formatCurrency(payment.remainingAmount)} strong />
            </div>
            <div className="mt-4 space-y-2">
              {sale.payments.length === 0 ? (
                <p className="text-sm text-text-secondary">Nenhum pagamento registrado.</p>
              ) : (
                sale.payments.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-background/35 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-text-primary">{item.payment_method || "Pagamento"}</p>
                      <p className="text-xs text-text-secondary">{item.paid_at ? formatDate(item.paid_at.slice(0, 10)) : "Sem data"}</p>
                    </div>
                    <p className={cn("font-semibold tabular-nums", item.status === "REFUNDED" ? "text-expense" : "text-profit")}>
                      {item.status === "REFUNDED" ? "-" : ""}{formatCurrency(item.amount)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="rounded-xl border border-border/60 bg-surface p-5 shadow-card lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-text-primary">Historico</h2>
          {timeline.length === 0 ? (
            <p className="text-sm text-text-secondary">Ainda nao ha eventos registrados para esta venda.</p>
          ) : (
            <ol className="space-y-3">
              {timeline.map((event, index) => (
                <li key={`${event.createdAt}-${event.label}-${index}`} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{event.label}</p>
                    <p className="text-xs text-text-secondary">{formatDate(event.createdAt.slice(0, 10))} as {formatTime(event.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <RecordPaymentDialog
        open={paymentOpen}
        sale={sale}
        loading={recordingPayment}
        onOpenChange={setPaymentOpen}
        onConfirm={handlePayment}
      />

      <ReturnSaleDialog
        open={returnOpen}
        sale={sale}
        loading={returning}
        onOpenChange={setReturnOpen}
        onConfirm={handleReturn}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar esta venda?"
        description="A reserva sera liberada, a venda permanecera no historico e nenhum registro sera apagado."
        confirmLabel="Cancelar venda"
        loading={cancelling}
        onConfirm={handleCancel}
      />
    </div>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={strong ? "truncate font-semibold tabular-nums text-text-primary" : "truncate tabular-nums text-text-secondary"}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-0 last:pb-0">
      <span className="text-text-secondary">{label}</span>
      <span className={cn("text-right tabular-nums", danger ? "font-semibold text-expense" : strong ? "font-semibold text-text-primary" : "text-text-primary")}>
        {value}
      </span>
    </div>
  );
}

function getSaleTotals(items: SaleItemRow[]) {
  const subtotal = items.reduce((sum, item) => sum + item.gross_amount, 0);
  const discountAmount = items.reduce((sum, item) => sum + item.discount_amount, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.final_amount, 0);
  const cogsAmount = items.reduce((sum, item) => sum + item.cogs_amount, 0);
  const platformFee = items.reduce((sum, item) => sum + item.platform_fee, 0);
  const shippingCost = items.reduce((sum, item) => sum + item.shipping_cost, 0);
  const additionalCosts = items.reduce((sum, item) => sum + item.additional_costs, 0);
  const grossProfit = items.reduce((sum, item) => sum + item.gross_profit, 0);
  const netProfit = items.reduce((sum, item) => sum + item.net_profit, 0);

  return {
    subtotal,
    discountAmount,
    totalAmount,
    cogsAmount,
    platformFee,
    shippingCost,
    additionalCosts,
    grossProfit,
    netProfit,
    netMarginPct: totalAmount > 0 ? (netProfit / totalAmount) * 100 : null,
  };
}

function buildTimeline(sale: SaleDetail): Array<{ createdAt: string; label: string }> {
  const auditEvents = sale.auditLogs.map((log) => ({ createdAt: log.created_at, label: auditLabel(log.action) }));
  const paymentEvents = sale.payments.map((payment) => ({
    createdAt: payment.paid_at ?? payment.created_at,
    label: `${payment.status === "REFUNDED" ? "Reembolso" : "Pagamento"} ${payment.payment_method || ""} de ${formatCurrency(payment.amount)}`.trim(),
  }));
  const movementEvents = sale.movements.map((movement) => ({
    createdAt: movement.created_at,
    label: movement.movement_type === "SALE_OUT"
      ? `${Math.abs(movement.quantity_delta)} unidade(s) baixada(s) do estoque`
      : `${Math.abs(movement.quantity_delta)} unidade(s) retornada(s) ao estoque`,
  }));
  const returnEvents = sale.returns.map((item) => ({
    createdAt: item.created_at,
    label: `Devolucao registrada${item.refund_amount > 0 ? ` com reembolso de ${formatCurrency(item.refund_amount)}` : ""}`,
  }));

  return [...auditEvents, ...paymentEvents, ...movementEvents, ...returnEvents]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    sale_created: "Venda registrada",
    sale_reserved: "Estoque reservado",
    sale_separated: "Pedido separado",
    sale_shipped: "Pedido enviado",
    sale_delivered: "Venda entregue",
    sale_cancelled: "Venda cancelada",
    payment_recorded: "Pagamento registrado",
    sale_returned: "Devolucao registrada",
  };

  return labels[action] ?? "Evento registrado";
}
