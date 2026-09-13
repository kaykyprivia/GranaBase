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

import { Customer360Dialog } from "@/components/business/customers/Customer360Dialog";
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
  Database,
} from "@/types/database";

type WorkspaceRpcResult = {
  workspace_id: string;
};

type CustomerMetrics = {
  orders: number;
  totalPurchased: number;
  lastPurchase: string | null;
};

type CustomerRow = BusinessCustomer & CustomerMetrics;

type CustomersPageRpcResult = {
  rows: CustomerRow[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: {
    total: number;
    buyers: number;
    recurring: number;
    total_sold: number;
  };
};

type CustomersPageArgs =
  Database["public"]["Functions"]["get_business_customers_page"]["Args"];

const CUSTOMER_PAGE_SIZE = 25;

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
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total_count: 0,
    page: 1,
    page_size: CUSTOMER_PAGE_SIZE,
    total_pages: 0,
  });
  const [summary, setSummary] = useState({
    total: 0,
    buyers: 0,
    recurring: 0,
    total_sold: 0,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] =
    useState<BusinessCustomer | null>(null);
  const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);

  const [form, setForm] = useState<CustomerForm>(emptyForm);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

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

      const workspace =
        coerceData<WorkspaceRpcResult>(workspaceRes.data);

      setWorkspaceId(workspace.workspace_id);

      const args = {
        p_workspace_id: workspace.workspace_id,
        p_page: page,
        p_page_size: CUSTOMER_PAGE_SIZE,
        p_search: debouncedSearch || null,
      } satisfies CustomersPageArgs;

      const customersRes = await supabase.rpc(
        "get_business_customers_page",
        coerceMutation(args)
      );

      if (customersRes.error) {
        throw customersRes.error;
      }

      const result =
        coerceData<CustomersPageRpcResult>(
          customersRes.data
        );

      setPagination({
        total_count: Number(result.total_count ?? 0),
        page: Number(result.page ?? 1),
        page_size: Number(
          result.page_size ?? CUSTOMER_PAGE_SIZE
        ),
        total_pages: Number(result.total_pages ?? 0),
      });

      setSummary({
        total: Number(result.summary?.total ?? 0),
        buyers: Number(result.summary?.buyers ?? 0),
        recurring: Number(
          result.summary?.recurring ?? 0
        ),
        total_sold: Number(
          result.summary?.total_sold ?? 0
        ),
      });

      if (
        result.total_pages > 0 &&
        page > result.total_pages
      ) {
        setPage(result.total_pages);
        return;
      }

      if (
        result.total_pages === 0 &&
        page !== 1
      ) {
        setPage(1);
        return;
      }

      setCustomers(
        (result.rows ?? []).map((row) => {
          const raw = row as CustomerRow & {
            total_purchased?: number;
            last_purchase?: string | null;
          };

          return {
            ...row,
            totalPurchased: Number(
              raw.total_purchased ??
                row.totalPurchased ??
                0
            ),
            lastPurchase:
              raw.last_purchase ??
              row.lastPurchase ??
              null,
          };
        })
      );
    } catch (error) {
      console.error(
        "Erro ao carregar clientes",
        error
      );
      toast.error(
        "Não foi possível carregar os clientes agora."
      );
    } finally {
      setLoading(false);
    }
  }, [
    debouncedSearch,
    page,
    router,
    supabase,
  ]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);



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
          value={formatCurrency(summary.total_sold)}
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
      ) : customers.length === 0 ? (
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
          {customers.map((customer) => {
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
                      onClick={() => setDetailsCustomerId(customer.id)}
                    >
                      Ver detalhes
                    </Button>

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


      {pagination.total_pages > 1 && (
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
              pagination.page *
                pagination.page_size,
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
              disabled={
                page >= pagination.total_pages
              }
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
      <Customer360Dialog
        open={detailsCustomerId !== null}
        customerId={detailsCustomerId}
        workspaceId={workspaceId}
        onOpenChange={(open) => {
          if (!open) {
            setDetailsCustomerId(null);
          }
        }}
      />

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
