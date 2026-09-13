"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CircleDollarSign,
  MessageCircle,
  Package,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  UserRound,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";

import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency } from "@/lib/utils";
import type {
  BusinessCustomer,
  Database,
} from "@/types/database";

type Customer360Args =
  Database["public"]["Functions"]["get_business_customer_360"]["Args"];

type Customer360Summary = {
  orders: number;
  realized_orders: number;
  total_purchased: number;
  total_paid: number;
  open_balance: number;
  ticket_average: number;
  total_refunded: number;
  realized_profit: number;
  last_purchase: string | null;
  customer_since: string;
};

type Customer360Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  image_url: string | null;
  purchased_quantity: number;
  returned_quantity: number;
  net_quantity: number;
  orders_count: number;
  gross_value: number;
};

type Customer360Payment = {
  id: string;
  sale_id: string;
  sale_number: number | null;
  amount: number;
  payment_method: string | null;
  status: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
};

type Customer360ReturnItem = {
  id: string;
  sale_item_id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  quantity: number;
  restockable: boolean;
};

type Customer360Return = {
  id: string;
  sale_id: string;
  sale_number: number | null;
  refund_amount: number;
  notes: string | null;
  created_at: string;
  items: Customer360ReturnItem[];
};

type Customer360Sale = {
  id: string;
  sale_number: number | null;
  order_status: string;
  payment_status: string;
  sale_date: string;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  gross_revenue: number;
  refunded_amount: number;
  net_revenue: number;
  paid_total: number;
  refunded_payments: number;
  net_paid: number;
  remaining_amount: number;
  net_profit: number;
  returns_count: number;
};

type Customer360Data = {
  customer: Pick<
    BusinessCustomer,
    "id" | "name" | "whatsapp" | "notes" | "created_at" | "updated_at"
  >;
  summary: Customer360Summary;
  top_products: Customer360Product[];
  payments: Customer360Payment[];
  returns: Customer360Return[];
  sales: {
    rows: Customer360Sale[];
    total_count: number;
    page: number;
    page_size: number;
    total_pages: number;
  };
};

interface Customer360DialogProps {
  open: boolean;
  customerId: string | null;
  workspaceId: string;
  onOpenChange: (open: boolean) => void;
}

function formatDate(value: string | null) {
  if (!value) return "Sem registro";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem registro";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function buildWhatsappLink(value: string | null) {
  if (!value) return null;

  let digits = value.replace(/\D/g, "");

  if (!digits) return null;

  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  return `https://wa.me/${digits}`;
}

export function Customer360Dialog({
  open,
  customerId,
  workspaceId,
  onOpenChange,
}: Customer360DialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Customer360Data | null>(null);

  useEffect(() => {
    if (!open || !customerId || !workspaceId) {
      return;
    }

    let active = true;
    const resolvedCustomerId = customerId;

    async function loadCustomer360() {
      setLoading(true);

      try {
        const args = {
          p_workspace_id: workspaceId,
          p_customer_id: resolvedCustomerId,
          p_page: 1,
          p_page_size: 20,
        } satisfies Customer360Args;

        const { data: rpcData, error } = await supabase.rpc(
          "get_business_customer_360",
          coerceMutation(args)
        );

        if (error) {
          throw error;
        }

        if (!active) {
          return;
        }

        setData(coerceData<Customer360Data>(rpcData));
      } catch (error) {
        console.error("Erro ao carregar Customer 360", error);

        if (active) {
          toast.error("Não foi possível carregar os detalhes do cliente.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadCustomer360();

    return () => {
      active = false;
    };
  }, [customerId, open, supabase, workspaceId]);

  useEffect(() => {
    if (!open) {
      setData(null);
    }
  }, [open]);

  const whatsappLink = buildWhatsappLink(
    data?.customer.whatsapp ?? null
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do cliente</DialogTitle>
        </DialogHeader>

        {loading ? (
          <Customer360Skeleton />
        ) : !data ? (
          <div className="rounded-xl border border-border/60 bg-surface p-8 text-center text-sm text-text-secondary">
            Nenhum detalhe disponível para este cliente.
          </div>
        ) : (
          <div className="space-y-6">
            <section className="rounded-xl border border-border/60 bg-surface p-4 shadow-card">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                    <UserRound className="h-5 w-5" />
                  </div>

                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold text-text-primary">
                      {data.customer.name}
                    </h3>

                    <p className="text-sm text-text-secondary">
                      {data.customer.whatsapp || "WhatsApp não informado"}
                    </p>

                    {data.customer.notes && (
                      <p className="mt-1 text-xs text-text-secondary">
                        {data.customer.notes}
                      </p>
                    )}
                  </div>
                </div>

                {whatsappLink && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp
                    </a>
                  </Button>
                )}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard
                title="Total comprado"
                value={formatCurrency(data.summary.total_purchased)}
                icon={ShoppingBag}
                variant="accent"
                size="compact"
              />

              <StatCard
                title="Total pago"
                value={formatCurrency(data.summary.total_paid)}
                icon={WalletCards}
                variant="profit"
                size="compact"
              />

              <StatCard
                title="Em aberto"
                value={formatCurrency(data.summary.open_balance)}
                icon={CircleDollarSign}
                variant={
                  data.summary.open_balance > 0
                    ? "warning"
                    : "default"
                }
                size="compact"
              />

              <StatCard
                title="Ticket médio"
                value={formatCurrency(data.summary.ticket_average)}
                icon={ReceiptText}
                variant="default"
                size="compact"
              />

              <StatCard
                title="Compras"
                value={String(data.summary.orders)}
                subtitle={`${data.summary.realized_orders} realizadas`}
                icon={ShoppingBag}
                variant="default"
                size="compact"
              />

              <StatCard
                title="Lucro realizado"
                value={formatCurrency(data.summary.realized_profit)}
                icon={CircleDollarSign}
                variant={
                  data.summary.realized_profit < 0
                    ? "expense"
                    : "profit"
                }
                size="compact"
              />

              <StatCard
                title="Devolvido"
                value={formatCurrency(data.summary.total_refunded)}
                icon={RotateCcw}
                variant="warning"
                size="compact"
              />

              <StatCard
                title="Última compra"
                value={formatDate(data.summary.last_purchase)}
                subtitle={`Cliente desde ${formatDate(
                  data.summary.customer_since
                )}`}
                icon={CalendarDays}
                variant="default"
                size="compact"
              />
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-border/60 bg-surface p-4 shadow-card">
                <div className="mb-4 flex items-center gap-2">
                  <Package className="h-4 w-4 text-accent" />
                  <h4 className="font-semibold text-text-primary">
                    Produtos mais comprados
                  </h4>
                </div>

                {data.top_products.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    Nenhum produto comprado ainda.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.top_products.map((product) => (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {product.name}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {product.sku
                              ? `SKU ${product.sku} · `
                              : ""}
                            {product.orders_count} venda(s)
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-semibold text-text-primary">
                            {product.net_quantity} un.
                          </p>
                          <p className="text-xs text-text-secondary">
                            {formatCurrency(product.gross_value)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-border/60 bg-surface p-4 shadow-card">
                <div className="mb-4 flex items-center gap-2">
                  <WalletCards className="h-4 w-4 text-accent" />
                  <h4 className="font-semibold text-text-primary">
                    Pagamentos
                  </h4>
                </div>

                {data.payments.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    Nenhum pagamento registrado.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.payments.slice(0, 10).map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/50 p-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            Venda #{payment.sale_number ?? "—"}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {payment.payment_method || "Método não informado"} ·{" "}
                            {formatDateTime(
                              payment.paid_at ?? payment.created_at
                            )}
                          </p>
                        </div>

                        <p className="text-sm font-semibold text-text-primary">
                          {formatCurrency(payment.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border/60 bg-surface p-4 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-accent" />
                <h4 className="font-semibold text-text-primary">
                  Histórico de vendas
                </h4>
              </div>

              {data.sales.rows.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Este cliente ainda não possui vendas.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.sales.rows.map((sale) => (
                    <div
                      key={sale.id}
                      className="rounded-lg border border-border/50 p-3"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            Venda #{sale.sale_number ?? "—"}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {formatDateTime(sale.sale_date)}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:grid-cols-4">
                          <div>
                            <p className="text-xs text-text-secondary">
                              Líquido
                            </p>
                            <p className="font-medium text-text-primary">
                              {formatCurrency(sale.net_revenue)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-text-secondary">
                              Pago
                            </p>
                            <p className="font-medium text-text-primary">
                              {formatCurrency(sale.net_paid)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-text-secondary">
                              Em aberto
                            </p>
                            <p className="font-medium text-text-primary">
                              {formatCurrency(sale.remaining_amount)}
                            </p>
                          </div>

                          <div>
                            <p className="text-xs text-text-secondary">
                              Status
                            </p>
                            <p className="font-medium text-text-primary">
                              {sale.order_status} · {sale.payment_status}
                            </p>
                          </div>
                        </div>
                      </div>

                      {sale.notes && (
                        <p className="mt-2 text-xs text-text-secondary">
                          {sale.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-border/60 bg-surface p-4 shadow-card">
              <div className="mb-4 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-accent" />
                <h4 className="font-semibold text-text-primary">
                  Devoluções
                </h4>
              </div>

              {data.returns.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Nenhuma devolução registrada.
                </p>
              ) : (
                <div className="space-y-3">
                  {data.returns.map((saleReturn) => (
                    <div
                      key={saleReturn.id}
                      className="rounded-lg border border-border/50 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            Venda #{saleReturn.sale_number ?? "—"}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {formatDateTime(saleReturn.created_at)}
                          </p>
                        </div>

                        <p className="text-sm font-semibold text-text-primary">
                          {formatCurrency(saleReturn.refund_amount)}
                        </p>
                      </div>

                      {saleReturn.items.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {saleReturn.items.map((item) => (
                            <p
                              key={item.id}
                              className="text-xs text-text-secondary"
                            >
                              {item.product_name} · {item.quantity} un.
                            </p>
                          ))}
                        </div>
                      )}

                      {saleReturn.notes && (
                        <p className="mt-2 text-xs text-text-secondary">
                          {saleReturn.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Customer360Skeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 rounded-xl" />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>

      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}