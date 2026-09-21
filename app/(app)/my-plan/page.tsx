"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Crown,
  Gift,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";

type Subscription = {
  subscription_id: string;
  plan: string;
  access_level: string;
  status: string;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  provider: string;
  days_remaining: number | null;
};

type Payment = {
  payment_id: string;
  plan_type: string;
  amount: number;
  status: string;
  mp_preapproval_id: string | null;
  mp_payment_id: string | null;
  environment: string;
  created_at: string;
  updated_at: string;
};

type CommissionSummary = {
  pending_total: number;
  available_total: number;
  paid_total: number;
  cancelled_total: number;
  can_withdraw: boolean;
  minimum_withdrawal: number;
};

const PLAN_LABELS: Record<string, string> = {
  monthly: "Mensal",
  semiannual: "Semestral",
  annual: "Anual",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo",
  past_due: "Pagamento pendente",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando",
  approved: "Aprovado",
  authorized: "Autorizado",
  in_process: "Processando",
  rejected: "Rejeitado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  charged_back: "Estornado",
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function MyPlanPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [commissions, setCommissions] = useState<CommissionSummary | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subRes, payRes, comRes] = await Promise.all([
        supabase.rpc("get_my_subscription"),
        supabase.rpc("list_my_subscription_payments"),
        supabase.rpc("get_my_commission_summary"),
      ]);

      const subData = subRes.data as unknown as Subscription[] | null;
      if (!subRes.error && subData && subData.length > 0) {
        setSubscription(subData[0]);
      }

      const payData = payRes.data as unknown as Payment[] | null;
      if (!payRes.error && payData) {
        setPayments(payData);
      }

      const comData = comRes.data as unknown as CommissionSummary[] | null;
      if (!comRes.error && comData && comData.length > 0) {
        setCommissions(comData[0]);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar seu plano");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isFree = !subscription;
  const planLabel = subscription
    ? PLAN_LABELS[subscription.plan] ?? subscription.plan
    : "Free";
  const statusLabel = subscription
    ? STATUS_LABELS[subscription.status] ?? subscription.status
    : "Gratuito";
  const isActive = subscription?.status === "active";

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
          Meu Plano
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Gerencie sua assinatura e acompanhe seus beneficios.
        </p>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* 1. Header com status */}
          <div
            className={cn(
              "rounded-xl border p-6",
              isFree
                ? "border-border/60 bg-surface"
                : isActive
                ? "border-accent/40 bg-gradient-to-br from-accent/10 to-accent/5"
                : "border-warning/30 bg-warning/5"
            )}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    "flex h-14 w-14 shrink-0 items-center justify-center rounded-full",
                    isFree ? "bg-border/40" : "bg-accent/20"
                  )}
                >
                  {isFree ? (
                    <Gift className="h-7 w-7 text-text-secondary" />
                  ) : (
                    <Crown className="h-7 w-7 text-accent" />
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-text-primary">
                      {isFree ? "Plano Free" : `Plano ${planLabel}`}
                    </h2>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        isActive
                          ? "bg-success/10 text-success"
                          : isFree
                          ? "bg-border/40 text-text-secondary"
                          : "bg-warning/10 text-warning"
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  {!isFree && subscription && (
                    <div className="mt-2 space-y-1 text-sm text-text-secondary">
                      <p className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Renova em <strong className="text-text-primary">{formatDate(subscription.current_period_end)}</strong>
                      </p>
                      {subscription.days_remaining !== null && (
                        <p className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {subscription.days_remaining} dias restantes
                        </p>
                      )}
                    </div>
                  )}

                  {isFree && (
                    <p className="mt-2 text-sm text-text-secondary">
                      Aproveite seus 7 dias gratis no Personal e Negocio.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                {isFree ? (
                  <Button
                    type="button"
                    onClick={() => router.push("/plans")}
                    className="min-h-10"
                  >
                    <Sparkles className="h-4 w-4" />
                    Assinar agora
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.push("/plans")}
                      className="min-h-10"
                    >
                      <TrendingUp className="h-4 w-4" />
                      Trocar plano
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-10 text-expense hover:text-expense"
                      disabled
                    >
                      Cancelar assinatura
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 2. Beneficios ativos */}
          <div className="rounded-xl border border-border/60 bg-surface p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Beneficios ativos
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <BenefitCard
                icon={<Wallet className="h-4 w-4" />}
                title="Personal"
                active={isActive || isFree}
              />
              <BenefitCard
                icon={<Crown className="h-4 w-4" />}
                title="Negocio"
                active={isActive || isFree}
              />
              <BenefitCard
                icon={<TrendingUp className="h-4 w-4" />}
                title={
                  subscription
                    ? `Comissao ${subscription.plan === "annual" ? "35%" : subscription.plan === "semiannual" ? "25%" : "15%"}`
                    : "Comissao 5%"
                }
                active={true}
              />
              <BenefitCard
                icon={<Sparkles className="h-4 w-4" />}
                title={isFree ? "Suporte padrao" : "Suporte prioritario"}
                active={true}
              />
            </div>
          </div>

          {/* 3. Indicacoes */}
          {commissions && (
            <div className="rounded-xl border border-border/60 bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-text-secondary">
                    Indique e Ganhe
                  </h3>
                  <p className="text-2xl font-bold text-text-primary">
                    {formatCurrency(
                      commissions.pending_total +
                        commissions.available_total +
                        commissions.paid_total
                    )}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Total acumulado em comissoes
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => router.push("/referrals")}
                  className="min-h-10"
                >
                  Ver detalhes
                </Button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-background/40 p-3">
                  <p className="text-xs text-text-muted">Pendente</p>
                  <p className="mt-1 font-semibold text-text-primary">
                    {formatCurrency(commissions.pending_total)}
                  </p>
                </div>
                <div className="rounded-lg bg-background/40 p-3">
                  <p className="text-xs text-text-muted">Disponivel</p>
                  <p className="mt-1 font-semibold text-success">
                    {formatCurrency(commissions.available_total)}
                  </p>
                </div>
                <div className="rounded-lg bg-background/40 p-3">
                  <p className="text-xs text-text-muted">Ja pago</p>
                  <p className="mt-1 font-semibold text-text-primary">
                    {formatCurrency(commissions.paid_total)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 4. Historico de pagamentos */}
          <div className="rounded-xl border border-border/60 bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <Receipt className="h-4 w-4 text-text-secondary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Historico de pagamentos
              </h3>
            </div>

            {payments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-text-muted" />
                <p className="mt-2 text-sm text-text-secondary">
                  Nenhum pagamento registrado ainda.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {payments.map((payment) => (
                  <div
                    key={payment.payment_id}
                    className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10">
                        <CheckCircle2 className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {PLAN_LABELS[payment.plan_type] ?? payment.plan_type}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {formatDate(payment.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text-primary">
                        {formatCurrency(payment.amount)}
                      </p>
                      <p
                        className={cn(
                          "text-xs",
                          payment.status === "approved" || payment.status === "authorized"
                            ? "text-success"
                            : payment.status === "pending"
                            ? "text-warning"
                            : "text-text-secondary"
                        )}
                      >
                        {PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Acoes */}
          <div className="rounded-xl border border-border/60 bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <Settings className="h-4 w-4 text-text-secondary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Gerenciar
              </h3>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 justify-start"
                onClick={() => router.push("/plans")}
              >
                <TrendingUp className="h-4 w-4" />
                {isFree ? "Escolher um plano" : "Trocar de plano"}
              </Button>

              <Button
                type="button"
                variant="outline"
                className="min-h-11 justify-start"
                onClick={() => router.push("/referrals")}
              >
                <Gift className="h-4 w-4" />
                Indique e Ganhe
              </Button>

              <Button
                type="button"
                variant="outline"
                className="min-h-11 justify-start"
                disabled
              >
                <Receipt className="h-4 w-4" />
                Baixar recibos (em breve)
              </Button>

              <Button
                type="button"
                variant="outline"
                className="min-h-11 justify-start text-expense hover:text-expense"
                disabled={isFree}
              >
                Cancelar assinatura (em breve)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BenefitCard({
  icon,
  title,
  active,
}: {
  icon: React.ReactNode;
  title: string;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border p-3",
        active
          ? "border-success/30 bg-success/5"
          : "border-border/40 bg-background/30 opacity-50"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          active ? "bg-success/10 text-success" : "bg-border/40 text-text-muted"
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-text-primary">
          {title}
        </p>
        <p
          className={cn(
            "text-xs",
            active ? "text-success" : "text-text-muted"
          )}
        >
          {active ? "Ativo" : "Inativo"}
        </p>
      </div>
    </div>
  );
}
