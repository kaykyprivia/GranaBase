"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Gift,
  Share2,
  Sparkles,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";

type ReferralStats = {
  total_signups: number;
  total_bonus_grants: number;
  last_signup_at: string | null;
};

type Referral = {
  referral_id: string;
  referred_user_id: string;
  referred_display_name: string;
  referral_code: string;
  attributed_at: string;
  has_active_subscription: boolean;
  active_plan_type: string | null;
  converted_at: string | null;
  commission_earned: number;
};

type Commission = {
  commission_id: string;
  referred_user_id: string;
  plan_type: string;
  referrer_plan_at_event: string;
  commission_rate: number;
  base_amount: number;
  commission_amount: number;
  status: string;
  available_at: string | null;
  paid_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  available: "Disponível",
  paid: "Pago",
  cancelled: "Cancelado",
};

const PLAN_LABELS: Record<string, string> = {
  monthly: "Mensal",
  semiannual: "Semestral",
  annual: "Anual",
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function ReferralsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [codeRes, statsRes, refRes, comRes] = await Promise.all([
        supabase.rpc("get_or_create_my_referral_code"),
        supabase.rpc("get_my_referral_stats"),
        supabase.rpc("list_my_referrals"),
        supabase.rpc("list_my_referral_commissions"),
      ]);

      const codeData = codeRes.data as unknown as string | null;
      if (!codeRes.error && codeData) {
        setReferralCode(String(codeData));
      }

      const statsData = statsRes.data as unknown as ReferralStats[] | null;
      if (!statsRes.error && statsData && statsData.length > 0) {
        setStats(statsData[0]);
      }

      const refData = refRes.data as unknown as Referral[] | null;
      if (!refRes.error && refData) {
        setReferrals(refData);
      }

      const comData = comRes.data as unknown as Commission[] | null;
      if (!comRes.error && comData) {
        setCommissions(comData);
      }
    } catch (error) {
      console.error("Erro ao carregar referrals:", error);
      toast.error("Erro ao carregar dados de indicação");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";
  const referralLink = referralCode
    ? `${baseUrl}/register?ref=${referralCode}`
    : "";


  async function handleCopyLink() {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("Erro ao copiar link");
    }
  }

  async function handleShareWhatsApp() {
    if (!referralLink) return;
    const text = encodeURIComponent(
      `Conheça o GranaBase! Controle suas finanças pessoais e do seu negócio. Use meu código ${referralCode}: ${referralLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  const totalEarned = commissions
    .filter((c) => c.status !== "cancelled")
    .reduce((sum, c) => sum + Number(c.commission_amount), 0);

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <Gift className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Indique e Ganhe
            </h1>
            <p className="text-sm text-text-secondary">
              Ganhe comissões indicando o GranaBase
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Card principal: código + link */}
          <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-accent/5 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Convide seus amigos
              </h2>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-text-secondary">
                  Compartilhe seu link e ganhe comissao quando seu amigo assinar
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="min-h-10"
                >
                  <Share2 className="h-4 w-4" />
                  Compartilhar link
                </Button>
              </div>
            </div>

            {/* Link de indicação */}
            <div className="mt-5 rounded-lg border border-border/60 bg-background/40 p-3">
              <p className="mb-1.5 text-xs font-medium text-text-secondary">
                Seu link de indicação
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-text-primary">
                  {referralLink || "—"}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyLink}
                  className="shrink-0"
                >
                  {copiedLink ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="Total de indicados"
              value={stats?.total_signups ?? 0}
            />
            <StatCard
              icon={<Trophy className="h-5 w-5" />}
              label="Bônus recebidos"
              value={stats?.total_bonus_grants ?? 0}
            />
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Total ganho"
              value={formatCurrency(totalEarned)}
              valueIsCurrency
            />
          </div>

          {/* Como funciona */}
          <div className="rounded-xl border border-border/60 bg-surface p-5">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Como funciona
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <StepCard
                number={1}
                title="Compartilhe"
                description="Envie seu código ou link para amigos"
              />
              <StepCard
                number={2}
                title="Eles assinam"
                description="Seu amigo assina qualquer plano pago"
              />
              <StepCard
                number={3}
                title="Você ganha"
                description="Recebe comissão + dias grátis"
              />
            </div>
          </div>

          {/* Lista de indicados */}
          <div className="rounded-xl border border-border/60 bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-text-secondary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Seus indicados ({referrals.length})
              </h3>
            </div>

            {referrals.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-text-muted" />
                <p className="mt-2 text-sm text-text-secondary">
                  Você ainda não indicou ninguém.
                </p>
                <p className="text-xs text-text-muted">
                  Compartilhe seu código para começar!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {referrals.map((ref) => (
                  <div
                    key={ref.referral_id}
                    className="rounded-lg border border-border/40 bg-background/30 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div
                          className={
                            ref.has_active_subscription
                              ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10"
                              : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10"
                          }
                        >
                          <UserPlus
                            className={
                              ref.has_active_subscription
                                ? "h-4 w-4 text-success"
                                : "h-4 w-4 text-accent"
                            }
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text-primary">
                            {ref.referred_display_name}
                          </p>
                          <p className="text-xs text-text-secondary">
                            Indicado em {formatDate(ref.attributed_at)}
                          </p>
                          {ref.has_active_subscription && ref.active_plan_type && (
                            <p className="mt-1 text-xs font-medium text-success">
                              ✓ Assinou {PLAN_LABELS[ref.active_plan_type] ?? ref.active_plan_type}
                              {ref.converted_at && ` · ${formatDate(ref.converted_at)}`}
                            </p>
                          )}
                          {!ref.has_active_subscription && (
                            <p className="mt-1 text-xs text-text-muted">
                              Aguardando assinatura
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        {ref.has_active_subscription ? (
                          <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                            Convertido
                          </span>
                        ) : (
                          <span className="rounded-full bg-border/40 px-2 py-0.5 text-xs text-text-secondary">
                            Pendente
                          </span>
                        )}
                        {ref.commission_earned > 0 && (
                          <span className="text-xs font-semibold text-accent">
                            +{formatCurrency(Number(ref.commission_earned))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Histórico de comissões */}
          <div className="rounded-xl border border-border/60 bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-text-secondary" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
                Histórico de comissões
              </h3>
            </div>

            {commissions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-background/30 p-8 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-text-muted" />
                <p className="mt-2 text-sm text-text-secondary">
                  Nenhuma comissão ainda.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {commissions.map((commission) => (
                  <div
                    key={commission.commission_id}
                    className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {PLAN_LABELS[commission.plan_type] ?? commission.plan_type}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {formatDate(commission.created_at)} · {commission.commission_rate}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-text-primary">
                        {formatCurrency(Number(commission.commission_amount))}
                      </p>
                      <p
                        className={cn(
                          "text-xs",
                          commission.status === "paid"
                            ? "text-success"
                            : commission.status === "available"
                            ? "text-accent"
                            : commission.status === "pending"
                            ? "text-warning"
                            : "text-text-secondary"
                        )}
                      >
                        {STATUS_LABELS[commission.status] ?? commission.status}
                      </p>
                    </div>
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

function StatCard({
  icon,
  label,
  value,
  valueIsCurrency,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  valueIsCurrency?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-text-secondary">
        {icon}
        <p className="text-xs uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-2xl font-bold text-text-primary">
        {valueIsCurrency ? value : value}
      </p>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 p-4">
      <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
        {number}
      </div>
      <p className="font-semibold text-text-primary">{title}</p>
      <p className="mt-1 text-xs text-text-secondary">{description}</p>
    </div>
  );
}
