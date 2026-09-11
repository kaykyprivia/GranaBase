"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MessageCircle,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  UserRoundCheck,
  Users,
  WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { PageIntro } from "@/components/shared/PageIntro";
import { StatCard } from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency } from "@/lib/utils";
import type {
  BusinessCustomer,
  BusinessSale,
  BusinessSaleItem,
} from "@/types/database";

type WorkspaceRpcResult = {
  workspace_id: string;
};

type CustomerSaleSnapshot = Pick<
  BusinessSale,
  "id" | "customer_id" | "sale_date" | "order_status"
>;

type SaleItemSnapshot = Pick<
  BusinessSaleItem,
  "sale_id" | "final_amount"
>;

type CustomerMetrics = {
  orders: number;
  totalPurchased: number;
  lastPurchase: string | null;
};

type CustomerRow = BusinessCustomer & CustomerMetrics;

type CustomerForm = {
  name: string;
  whatsapp: string;
  notes: string;
};

const emptyForm: CustomerForm = {
  name: "",
  whatsapp: "",
  notes: "",
};

function formatDate(value: string | null) {
  if (!value) return "Sem compras";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
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

export function CustomersPageClient() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] =
    useState<BusinessCustomer | null>(null);

  const [form, setForm] = useState<CustomerForm>(emptyForm);

  const loadCustomers = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        toast.error("Sessão expirada. Entre novamente.");
        router.push("/login");
        return;
      }

      setUserId(user.id);

      const workspaceRes = await supabase.rpc(
        "get_or_create_business_workspace",
        coerceMutation({
          p_name: "Meu Negocio",
        })
      );

      if (workspaceRes.error) {
        throw workspaceRes.error;
      }

      const workspace = coerceData<WorkspaceRpcResult>(workspaceRes.data);

      setWorkspaceId(workspace.workspace_id);

      const [customersRes, salesRes] = await Promise.all([
        supabase
          .from("business_customers")
          .select("*")
          .eq("workspace_id", workspace.workspace_id)
          .order("created_at", { ascending: false })
          .limit(500),

        supabase
          .from("business_sales")
          .select("id, customer_id, sale_date, order_status")
          .eq("workspace_id", workspace.workspace_id)
          .order("sale_date", { ascending: false })
          .limit(1000),
      ]);

      if (customersRes.error) {
        throw customersRes.error;
      }

      if (salesRes.error) {
        throw salesRes.error;
      }

      const customerRows = coerceData<BusinessCustomer[]>(
        customersRes.data ?? []
      );

      const sales = coerceData<CustomerSaleSnapshot[]>(
        salesRes.data ?? []
      ).filter(
        (sale) =>
          Boolean(sale.customer_id) &&
          sale.order_status !== "CANCELLED"
      );

      const saleIds = sales.map((sale) => sale.id);

      let saleItems: SaleItemSnapshot[] = [];

      if (saleIds.length > 0) {
        const itemsRes = await supabase
          .from("business_sale_items")
          .select("sale_id, final_amount")
          .in("sale_id", saleIds);

        if (itemsRes.error) {
          throw itemsRes.error;
        }

        saleItems = coerceData<SaleItemSnapshot[]>(
          itemsRes.data ?? []
        );
      }

      const amountBySaleId = new Map<string, number>();

      for (const item of saleItems) {
        amountBySaleId.set(
          item.sale_id,
          (amountBySaleId.get(item.sale_id) ?? 0) +
            Number(item.final_amount ?? 0)
        );
      }

      const metricsByCustomer = new Map<string, CustomerMetrics>();

      for (const sale of sales) {
        if (!sale.customer_id) continue;

        const current =
          metricsByCustomer.get(sale.customer_id) ?? {
            orders: 0,
            totalPurchased: 0,
            lastPurchase: null,
          };

        current.orders += 1;
        current.totalPurchased += amountBySaleId.get(sale.id) ?? 0;

        if (
          !current.lastPurchase ||
          sale.sale_date > current.lastPurchase
        ) {
          current.lastPurchase = sale.sale_date;
        }

        metricsByCustomer.set(sale.customer_id, current);
      }

      setCustomers(
        customerRows.map((customer) => ({
          ...customer,
          ...(metricsByCustomer.get(customer.id) ?? {
            orders: 0,
            totalPurchased: 0,
            lastPurchase: null,
          }),
        }))
      );
    } catch (error) {
      console.error("Erro ao carregar clientes", error);
      toast.error("Não foi possível carregar os clientes agora.");
    } finally {
      setLoading(false);
    }
  }, [router, supabase]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return customers;
    }

    return customers.filter((customer) => {
      const searchable = [
        customer.name,
        customer.whatsapp,
        customer.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(term);
    });
  }, [customers, search]);

  const summary = useMemo(() => {
    const buyers = customers.filter(
      (customer) => customer.orders > 0
    );

    const recurring = customers.filter(
      (customer) => customer.orders >= 2
    );

    const totalSold = customers.reduce(
      (sum, customer) => sum + customer.totalPurchased,
      0
    );

    return {
      total: customers.length,
      buyers: buyers.length,
      recurring: recurring.length,
      totalSold,
    };
  }, [customers]);

  function openCreateCustomer() {
    setEditingCustomer(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEditCustomer(customer: BusinessCustomer) {
    setEditingCustomer(customer);

    setForm({
      name: customer.name,
      whatsapp: customer.whatsapp ?? "",
      notes: customer.notes ?? "",
    });

    setFormOpen(true);
  }

  async function saveCustomer() {
    const name = form.name.trim();

    if (!name) {
      toast.error("Informe o nome do cliente.");
      return;
    }

    if (!userId || !workspaceId) {
      toast.error("O ambiente do negócio ainda não está pronto.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name,
        whatsapp: form.whatsapp.trim() || null,
        notes: form.notes.trim() || null,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from("business_customers")
          .update(coerceMutation(payload))
          .eq("id", editingCustomer.id)
          .eq("workspace_id", workspaceId);

        if (error) {
          throw error;
        }

        toast.success("Cliente atualizado.");
      } else {
        const { error } = await supabase
          .from("business_customers")
          .insert(
            coerceMutation({
              user_id: userId,
              workspace_id: workspaceId,
              ...payload,
            })
          );

        if (error) {
          throw error;
        }

        toast.success("Cliente cadastrado.");
      }

      setFormOpen(false);
      setEditingCustomer(null);
      setForm(emptyForm);

      await loadCustomers();
    } catch (error) {
      console.error("Erro ao salvar cliente", error);
      toast.error("Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-container animate-fade-in">
      <PageIntro
        icon={Users}
        iconTone="accent"
        title="Clientes"
        description="Centralize contatos, histórico de compras e relacionamento com seus clientes."
        actions={
          <Button
            type="button"
            size="sm"
            className="min-h-10 gap-1.5"
            onClick={openCreateCustomer}
          >
            <Plus className="h-4 w-4" />
            Novo cliente
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          title="Clientes cadastrados"
          value={String(summary.total)}
          icon={Users}
          variant="default"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Já compraram"
          value={String(summary.buyers)}
          subtitle={
            summary.total > 0
              ? `${Math.round(
                  (summary.buyers / summary.total) * 100
                )}% da base`
              : "Nenhum ainda"
          }
          icon={UserRoundCheck}
          variant="accent"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Recorrentes"
          value={String(summary.recurring)}
          subtitle="2 ou mais compras"
          icon={ShoppingBag}
          variant="profit"
          size="compact"
          loading={loading}
        />

        <StatCard
          title="Total vendido"
          value={formatCurrency(summary.totalSold)}
          subtitle="Vendas vinculadas a clientes"
          icon={WalletCards}
          variant="profit"
          size="compact"
          loading={loading}
        />
      </div>

      <div className="mb-5">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome, WhatsApp ou observação..."
          leftIcon={<Search className="h-4 w-4" />}
          className="min-h-11"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton
              key={index}
              className="h-28 rounded-xl"
            />
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-surface">
          <EmptyState
            icon={Users}
            title={
              search
                ? "Nenhum cliente encontrado"
                : "Nenhum cliente cadastrado"
            }
            description={
              search
                ? "Tente outro nome ou número de WhatsApp."
                : "Cadastre seu primeiro cliente ou registre uma venda com cliente rápido."
            }
            actionLabel={
              search ? undefined : "Cadastrar cliente"
            }
            onAction={
              search ? undefined : openCreateCustomer
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCustomers.map((customer) => {
            const whatsappLink = buildWhatsappLink(
              customer.whatsapp
            );

            return (
              <div
                key={customer.id}
                className="rounded-xl border border-border/60 bg-surface p-4 shadow-card"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                      {getInitials(customer.name)}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text-primary">
                        {customer.name}
                      </p>

                      <p className="truncate text-sm text-text-secondary">
                        {customer.whatsapp ||
                          "WhatsApp não informado"}
                      </p>

                      {customer.notes && (
                        <p className="mt-1 line-clamp-1 text-xs text-text-secondary">
                          {customer.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 lg:min-w-[360px]">
                    <CustomerMetric
                      label="Compras"
                      value={String(customer.orders)}
                    />

                    <CustomerMetric
                      label="Total"
                      value={formatCurrency(
                        customer.totalPurchased
                      )}
                    />

                    <CustomerMetric
                      label="Última compra"
                      value={formatDate(
                        customer.lastPurchase
                      )}
                    />
                  </div>

                  <div className="flex gap-2 lg:justify-end">
                    {whatsappLink && (
                      <Button
                        asChild
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-10 flex-1 gap-1.5 lg:flex-none"
                      >
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

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-10 flex-1 gap-1.5 lg:flex-none"
                      onClick={() =>
                        openEditCustomer(customer)
                      }
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setFormOpen(open);

            if (!open) {
              setEditingCustomer(null);
              setForm(emptyForm);
            }
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer
                ? "Editar cliente"
                : "Novo cliente"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="Nome" required>
              <Input
                value={form.name}
                placeholder="Ex: Rodrigo Silva"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </FormField>

            <FormField
              label="WhatsApp"
              hint="Opcional"
            >
              <Input
                value={form.whatsapp}
                placeholder="(12) 99999-9999"
                inputMode="tel"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    whatsapp: event.target.value,
                  }))
                }
              />
            </FormField>

            <FormField
              label="Observações"
              hint="Opcional"
            >
              <Textarea
                rows={4}
                value={form.notes}
                placeholder="Preferências, endereço, informações úteis..."
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </Button>

            <Button
              type="button"
              loading={saving}
              onClick={saveCustomer}
            >
              {editingCustomer
                ? "Salvar alterações"
                : "Cadastrar cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-text-secondary">
        {label}
      </p>

      <p className="truncate text-sm font-semibold text-text-primary">
        {value}
      </p>
    </div>
  );
}