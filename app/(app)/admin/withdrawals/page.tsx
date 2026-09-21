"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  HandCoins,
  Loader2,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";

type AdminWithdrawal = {
  request_id: string;
  user_id: string;
  user_email: string;
  amount: number;
  pix_key: string;
  pix_key_type: string;
  status: string;
  requested_at: string;
  processing_started_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  admin_notes: string | null;
  payment_reference: string | null;
};

const TABS = [
  { key: "pending", label: "Pendentes" },
  { key: "processing", label: "Em processamento" },
  { key: "paid", label: "Pagos" },
  { key: "cancelled", label: "Cancelados" },
  { key: "", label: "Todos" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  processing: "Em processamento",
  paid: "Pago",
  cancelled: "Cancelado",
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminWithdrawalsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("pending");
  const [requests, setRequests] = useState<AdminWithdrawal[]>([]);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [refById, setRefById] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc(
        "admin_list_withdrawal_requests" as never,
        { p_status: activeTab || null } as never
      );

      if (error) throw error;

      const list = data as unknown as AdminWithdrawal[] | null;
      setRequests(list ?? []);
    } catch (error) {
      console.error("Erro ao carregar saques:", error);
      toast.error("Erro ao carregar saques");
    } finally {
      setLoading(false);
    }
  }, [supabase, activeTab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleUpdateStatus(
    requestId: string,
    newStatus: "processing" | "paid" | "cancelled"
  ) {
    setActionId(requestId);
    try {
      const notes = notesById[requestId] ?? null;
      const reference = refById[requestId] ?? null;

      const { error } = await supabase.rpc(
        "admin_update_withdrawal_status" as never,
        {
          p_request_id: requestId,
          p_new_status: newStatus,
          p_admin_notes: notes,
          p_payment_reference: reference,
        } as never
      );

      if (error) throw error;

      const labels: Record<string, string> = {
        processing: "marcado como em processamento",
        paid: "marcado como pago",
        cancelled: "cancelado",
      };

      toast.success(`Saque ${labels[newStatus]}`);
      await loadData();
    } catch (error) {
      console.error("Erro ao atualizar:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao atualizar saque";
      toast.error(msg);
    } finally {
      setActionId(null);
    }
  }

  async function handleCopyAll(key: string, amount: number, email: string) {
    try {
      const text =
        "Chave Pix: " + key + "\n" +
        "Valor: " + formatCurrency(amount) + "\n" +
        "Email: " + email;
      await navigator.clipboard.writeText(text);
      toast.success("Dados copiados");
    } catch {
      toast.error("Erro ao copiar");
    }
  }

  async function handleCopy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Chave Pix copiada");
    } catch {
      toast.error("Erro ao copiar");
    }
  }


  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Admin: Saques
            </h1>
            <p className="text-sm text-text-secondary">
              Gerencie as solicitacoes de saque dos usuarios
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-center gap-2 text-warning">
            <Clock className="h-4 w-4" />
            <p className="text-xs font-medium uppercase tracking-wider">Pendentes</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {requests.filter((r) => r.status === "pending").length}
          </p>
          <p className="text-xs text-text-secondary">
            {formatCurrency(
              requests
                .filter((r) => r.status === "pending")
                .reduce((sum, r) => sum + r.amount, 0)
            )}
          </p>
        </div>

        <div className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center gap-2 text-accent">
            <PlayCircle className="h-4 w-4" />
            <p className="text-xs font-medium uppercase tracking-wider">Processando</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {requests.filter((r) => r.status === "processing").length}
          </p>
          <p className="text-xs text-text-secondary">
            {formatCurrency(
              requests
                .filter((r) => r.status === "processing")
                .reduce((sum, r) => sum + r.amount, 0)
            )}
          </p>
        </div>

        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <div className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-xs font-medium uppercase tracking-wider">Pagos</p>
          </div>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            {requests.filter((r) => r.status === "paid").length}
          </p>
          <p className="text-xs text-text-secondary">
            {formatCurrency(
              requests
                .filter((r) => r.status === "paid")
                .reduce((sum, r) => sum + r.amount, 0)
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-accent text-white"
                : "border border-border/60 bg-surface text-text-secondary hover:text-text-primary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-surface p-12 text-center">
          <HandCoins className="mx-auto h-10 w-10 text-text-muted" />
          <p className="mt-3 text-sm text-text-secondary">
            Nenhuma solicitacao {activeTab ? `(${activeTab})` : ""} encontrada.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div
              key={req.request_id}
              className="rounded-xl border border-border/60 bg-surface p-4"
            >
              {/* Header do card */}
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      req.status === "paid"
                        ? "bg-success/10"
                        : req.status === "cancelled"
                        ? "bg-expense/10"
                        : "bg-warning/10"
                    )}
                  >
                    {req.status === "paid" ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : req.status === "cancelled" ? (
                      <AlertCircle className="h-5 w-5 text-expense" />
                    ) : (
                      <Clock className="h-5 w-5 text-warning" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-text-primary">
                      {formatCurrency(req.amount)}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {req.user_email}
                    </p>
                    <p className="text-xs text-text-muted">
                      Solicitado em {formatDate(req.requested_at)}
                    </p>
                  </div>
                </div>

                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium",
                    req.status === "paid"
                      ? "bg-success/10 text-success"
                      : req.status === "cancelled"
                      ? "bg-expense/10 text-expense"
                      : "bg-warning/10 text-warning"
                  )}
                >
                  {STATUS_LABELS[req.status] ?? req.status}
                </span>
              </div>

              {/* Chave Pix */}
              <div className="mb-3 rounded-lg border border-border/40 bg-background/40 p-3">
                <p className="mb-1 text-xs font-medium text-text-secondary">
                  Chave Pix ({req.pix_key_type.toUpperCase()})
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate font-mono text-sm text-text-primary">
                    {req.pix_key}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCopy(req.pix_key)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleCopyAll(req.pix_key, req.amount, req.user_email)
                    }
                  >
                    Copiar tudo
                  </Button>
                </div>
              </div>

              {/* Info extra */}
              {(req.payment_reference || req.admin_notes) && (
                <div className="mb-3 space-y-1 text-xs text-text-secondary">
                  {req.payment_reference && (
                    <p>Referencia: {req.payment_reference}</p>
                  )}
                  {req.admin_notes && <p>Notas: {req.admin_notes}</p>}
                </div>
              )}

              {/* Acoes */}
              {(req.status === "pending" || req.status === "processing") && (
                <div className="space-y-3 border-t border-border/40 pt-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Notas (opcional)"
                      value={notesById[req.request_id] ?? ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [req.request_id]: e.target.value,
                        }))
                      }
                    />
                    <Input
                      placeholder="ID/referencia do Pix (opcional)"
                      value={refById[req.request_id] ?? ""}
                      onChange={(e) =>
                        setRefById((prev) => ({
                          ...prev,
                          [req.request_id]: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {req.status === "pending" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={actionId === req.request_id}
                        onClick={() =>
                          handleUpdateStatus(req.request_id, "processing")
                        }
                      >
                        {actionId === req.request_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PlayCircle className="h-4 w-4" />
                        )}
                        Iniciar processamento
                      </Button>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      disabled={actionId === req.request_id}
                      onClick={() => handleUpdateStatus(req.request_id, "paid")}
                    >
                      {actionId === req.request_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Marcar como pago
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-expense hover:text-expense"
                      disabled={actionId === req.request_id}
                      onClick={() =>
                        handleUpdateStatus(req.request_id, "cancelled")
                      }
                    >
                      <Ban className="h-4 w-4" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Datas */}
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted">
                {req.processing_started_at && (
                  <span>Processando desde: {formatDate(req.processing_started_at)}</span>
                )}
                {req.paid_at && <span>Pago em: {formatDate(req.paid_at)}</span>}
                {req.cancelled_at && (
                  <span>Cancelado em: {formatDate(req.cancelled_at)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
