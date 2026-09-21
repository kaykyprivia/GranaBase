"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  HandCoins,
  Sparkles,
  TrendingUp,
  Loader2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";

type WithdrawalSummary = {
  available_total: number;
  reserved_total: number;
  paid_total: number;
  can_withdraw: boolean;
  minimum_withdrawal: number;
  has_pending_request: boolean;
};

type WithdrawalRequest = {
  request_id: string;
  amount: number;
  pix_key: string;
  pix_key_type: string;
  status: string;
  requested_at: string;
  processing_started_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  admin_notes: string | null;
  payment_reference: string | null;
};

const PIX_TYPES: { value: string; label: string }[] = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatoria" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando analise",
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

export default function WithdrawalsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<WithdrawalSummary | null>(null);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [pixKey, setPixKey] = useState("");
  const [pixType, setPixType] = useState("cpf");
  const [showForm, setShowForm] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, reqRes] = await Promise.all([
        supabase.rpc("get_my_withdrawal_summary"),
        supabase.rpc("list_my_withdrawal_requests"),
      ]);

      const sumData = sumRes.data as unknown as WithdrawalSummary[] | null;
      if (!sumRes.error && sumData && sumData.length > 0) {
        setSummary(sumData[0]);
      }

      const reqData = reqRes.data as unknown as WithdrawalRequest[] | null;
      if (!reqRes.error && reqData) {
        setRequests(reqData);
      }
    } catch (error) {
      console.error("Erro ao carregar saques:", error);
      toast.error("Erro ao carregar dados de saque");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleRequestWithdrawal() {
    if (!pixKey.trim()) {
      toast.error("Informe sua chave Pix");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc(
        "create_my_withdrawal_request" as never,
        {
          p_pix_key: pixKey.trim(),
          p_pix_key_type: pixType,
        } as never
      );

      if (error) throw error;

      toast.success("Solicitacao de saque enviada!");
      setPixKey("");
      setShowForm(false);
      await loadData();
    } catch (error) {
      console.error("Erro ao solicitar saque:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao solicitar saque";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyPix(key: string) {
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
            <HandCoins className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Saques</h1>
            <p className="text-sm text-text-secondary">
              Solicite o saque das suas comissoes via Pix
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Card principal */}
          <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-accent/5 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Saldo disponivel para saque
              </h2>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-4xl font-bold text-accent">
                  {formatCurrency(summary?.available_total ?? 0)}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  Minimo para saque: {formatCurrency(summary?.minimum_withdrawal ?? 20)}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                {summary?.has_pending_request ? (
                  <div className="flex items-center gap-2 rounded-full border border-warning/40 bg-warning/10 px-3 py-1">
                    <Clock className="h-3 w-3 text-warning" />
                    <p className="text-xs font-semibold text-warning">
                      Saque em andamento
                    </p>
                  </div>
                ) : summary?.can_withdraw ? (
                  <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1">
                    <Sparkles className="h-3 w-3 text-success" />
                    <p className="text-xs font-semibold text-success">
                      Voce ja pode sacar!
                    </p>
                  </div>
                ) : null}

                <Button
                  type="button"
                  onClick={() => setShowForm(!showForm)}
                  disabled={
                    summary?.has_pending_request ||
                    !summary?.can_withdraw
                  }
                  title={
                    summary?.has_pending_request
                      ? "Voce ja tem um saque em andamento"
                      : !summary?.can_withdraw
                      ? "Faltam " + formatCurrency(Math.max(0, (summary?.minimum_withdrawal ?? 20) - (summary?.available_total ?? 0))) + " para liberar"
                      : "Solicitar saque"
                  }
                  className="min-h-10"
                >
                  <HandCoins className="h-4 w-4" />
                  {showForm
                    ? "Cancelar"
                    : summary?.has_pending_request
                    ? "Saque em andamento"
                    : "Solicitar saque"}
                </Button>

                {!summary?.can_withdraw && !summary?.has_pending_request && (
                  <p className="max-w-[200px] text-right text-[11px] text-text-muted">
                    Faltam {formatCurrency(Math.max(0, (summary?.minimum_withdrawal ?? 20) - (summary?.available_total ?? 0)))} para liberar
                  </p>
                )}
              </div>
            </div>

            {/* Progresso ate o minimo */}
            {!summary?.has_pending_request && !summary?.can_withdraw && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-text-secondary">
                    <TrendingUp className="h-3 w-3" />
                    Progresso para saque
                  </span>
                  <span className="font-semibold text-text-primary">
                    {formatCurrency(summary?.available_total ?? 0)} /{" "}
                    {formatCurrency(summary?.minimum_withdrawal ?? 20)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-background/60">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent/60 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        ((summary?.available_total ?? 0) /
                          (summary?.minimum_withdrawal ?? 20)) *
                          100
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-text-muted">
                  Faltam{" "}
                  <strong className="text-accent">
                    {formatCurrency(
                      Math.max(
                        0,
                        (summary?.minimum_withdrawal ?? 20) -
                          (summary?.available_total ?? 0)
                      )
                    )}
                  </strong>{" "}
                  para voce poder sacar
                </p>
              </div>
            )}

            {/* Mini stats */}
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-background/40 p-3">
                <p className="text-xs text-text-muted">Reservado</p>
                <p className="mt-1 font-semibold text-text-primary">
                  {formatCurrency(summary?.reserved_total ?? 0)}
                </p>
              </div>
              <div className="rounded-lg bg-background/40 p-3">
                <p className="text-xs text-text-muted">Ja pago</p>
                <p className="mt-1 font-semibold text-success">
                  {formatCurrency(summary?.paid_total ?? 0)}
                </p>
              </div>
              <div className="rounded-lg bg-background/40 p-3">
                <p className="text-xs text-text-muted">Total solicitado</p>
                <p className="mt-1 font-semibold text-text-primary">
                  {formatCurrency(
                    (summary?.available_total ?? 0) +
                      (summary?.reserved_total ?? 0) +
                      (summary?.paid_total ?? 0)
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Form de solicitacao */}
          {showForm && summary?.can_withdraw && (
            <div className="rounded-xl border border-border/60 bg-surface p-5">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Dados para o Pix
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Tipo de chave</Label>
                  <Select value={pixType} onValueChange={setPixType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIX_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Chave Pix</Label>
                  <Input
                    type="text"
                    placeholder="Ex: 000.000.000-00"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <p className="text-xs text-warning">
                  ⚠️ Confira os dados antes de enviar. A chave Pix nao pode ser
                  alterada apos a solicitacao.
                </p>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleRequestWithdrawal}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <HandCoins className="h-4 w-4" />
                      Solicitar {formatCurrency(summary.available_total)}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Como funciona */}
          <div className="rounded-xl border border-border/60 bg-surface p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Como funciona
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border/40 bg-background/30 p-4">
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                  1
                </div>
                <p className="font-semibold text-text-primary">Acumule R$ 20</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Ganhe comissoes indicando o GranaBase
                </p>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/30 p-4">
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                  2
                </div>
                <p className="font-semibold text-text-primary">Solicite saque</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Informe sua chave Pix e envie
                </p>
              </div>
              <div className="rounded-lg border border-border/40 bg-background/30 p-4">
                <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
                  3
                </div>
                <p className="font-semibold text-text-primary">Receba em ate 7 dias</p>
                <p className="mt-1 text-xs text-text-secondary">
                  Pagamento via Pix direto na sua conta
                </p>
              </div>
            </div>
          </div>

          {/* Historico */}
          <div className="rounded-xl border border-border/60 bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <Banknote className="h-4 w-4 text-text-secondary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Historico de solicitacoes
              </h3>
            </div>

            {requests.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-text-muted" />
                <p className="mt-2 text-sm text-text-secondary">
                  Nenhuma solicitacao ainda.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {requests.map((req) => (
                  <div
                    key={req.request_id}
                    className="rounded-lg border border-border/40 bg-background/30 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                            req.status === "paid"
                              ? "bg-success/10"
                              : req.status === "cancelled"
                              ? "bg-expense/10"
                              : "bg-warning/10"
                          )}
                        >
                          {req.status === "paid" ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : req.status === "cancelled" ? (
                            <AlertCircle className="h-4 w-4 text-expense" />
                          ) : (
                            <Clock className="h-4 w-4 text-warning" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary">
                            {formatCurrency(req.amount)}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {formatDate(req.requested_at)}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs",
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

                    <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                      <span className="font-mono">{req.pix_key}</span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => handleCopyPix(req.pix_key)}
                        aria-label="Copiar chave Pix"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>

                    {req.payment_reference && (
                      <p className="mt-2 text-xs text-text-muted">
                        Referencia: {req.payment_reference}
                      </p>
                    )}

                    {req.cancelled_reason && (
                      <p className="mt-2 text-xs text-expense">
                        Motivo: {req.cancelled_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
