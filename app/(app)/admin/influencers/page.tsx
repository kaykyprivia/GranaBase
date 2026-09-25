"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Gift, Loader2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

type Influencer = {
  user_id: string;
  is_active: boolean;
  custom_commission_rate: number;
  notes: string | null;
  created_at: string;
  total_referrals: number;
  total_commission_generated: number;
};

type ReferralOverview = {
  total_referrals: number;
  total_referrers: number;
  total_converted: number;
  total_commission_generated: number;
  total_commission_paid: number;
  total_commission_pending: number;
  total_commission_cancelled: number;
};

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminInfluencersPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [overview, setOverview] = useState<ReferralOverview | null>(null);
  const [newUserId, setNewUserId] = useState("");
  const [newRate, setNewRate] = useState("50");
  const [newNotes, setNewNotes] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, overviewRes] = await Promise.all([
        supabase.rpc("admin_list_influencers"),
        supabase.rpc("admin_get_referral_overview"),
      ]);

      if (listRes.error) throw listRes.error;
      if (overviewRes.error) throw overviewRes.error;

      setInfluencers((listRes.data as Influencer[] | null) ?? []);
      const ov = (overviewRes.data as ReferralOverview[] | null) ?? [];
      setOverview(ov[0] ?? null);
    } catch (error) {
      console.error("Erro ao carregar influencers:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao carregar influencers";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handlePromote() {
    const trimmedId = newUserId.trim();
    if (!trimmedId) {
      toast.error("Informe o UUID do usuario");
      return;
    }

    const rate = Number(newRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      toast.error("Taxa deve estar entre 0 e 100");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("set_user_as_influencer", {
        p_user_id: trimmedId,
        p_custom_rate: rate,
        p_notes: newNotes.trim() || null,
      });

      if (error) throw error;

      toast.success("Usuario promovido a influencer");
      setNewUserId("");
      setNewRate("50");
      setNewNotes("");
      await loadData();
    } catch (error) {
      console.error("Erro ao promover:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao promover usuario";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <Crown className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Admin: Parceiros
            </h1>
            <p className="text-sm text-text-secondary">
              Gerencie influencers, comissoes customizadas e visao geral do
              sistema de indicacoes
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-6">
          {overview && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Visao geral do sistema de indicacoes
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={<Gift className="h-4 w-4" />}
                  tone="accent"
                  label="Total de indicacoes"
                  value={overview.total_referrals}
                />
                <StatCard
                  icon={<Users className="h-4 w-4" />}
                  tone="accent"
                  label="Indicadores unicos"
                  value={overview.total_referrers}
                />
                <StatCard
                  icon={<Gift className="h-4 w-4" />}
                  tone="success"
                  label="Convertidas"
                  value={overview.total_converted}
                />
                <StatCard
                  icon={<Crown className="h-4 w-4" />}
                  tone="accent"
                  label="Comissao total"
                  value={formatCurrency(overview.total_commission_generated)}
                />
                <StatCard
                  icon={<Crown className="h-4 w-4" />}
                  tone="warning"
                  label="Comissao pendente"
                  value={formatCurrency(overview.total_commission_pending)}
                />
                <StatCard
                  icon={<Crown className="h-4 w-4" />}
                  tone="success"
                  label="Comissao paga"
                  value={formatCurrency(overview.total_commission_paid)}
                />
                <StatCard
                  icon={<Crown className="h-4 w-4" />}
                  tone="warning"
                  label="Comissao cancelada"
                  value={formatCurrency(overview.total_commission_cancelled)}
                />
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Promover usuario a influencer
            </h2>
            <div className="rounded-xl border border-border/60 bg-surface p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  placeholder="UUID do usuario"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="Taxa custom (%)"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value)}
                />
                <Input
                  placeholder="Notas (opcional)"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                />
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handlePromote()}
                  className="gap-2"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Promover
                </Button>
              </div>
              <p className="mt-2 text-xs text-text-muted">
                O UUID pode ser encontrado em Admin: Usuarios.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Influencers ativos ({influencers.length})
            </h2>
            {influencers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 bg-surface p-12 text-center">
                <Crown className="mx-auto h-10 w-10 text-text-muted" />
                <p className="mt-3 text-sm text-text-secondary">
                  Nenhum influencer cadastrado ainda.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {influencers.map((inf) => (
                  <div
                    key={inf.user_id}
                    className="rounded-xl border border-border/60 bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-text-primary">
                          {inf.user_id}
                        </p>
                        <p className="text-xs text-text-muted">
                          Desde {formatDate(inf.created_at)}
                        </p>
                        {inf.notes && (
                          <p className="mt-1 text-xs text-text-secondary">
                            {inf.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-text-muted">Taxa</p>
                          <p className="text-sm font-bold text-accent">
                            {inf.custom_commission_rate}%
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-text-muted">Indicacoes</p>
                          <p className="text-sm font-bold text-text-primary">
                            {inf.total_referrals}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-text-muted">Comissao</p>
                          <p className="text-sm font-bold text-success">
                            {formatCurrency(inf.total_commission_generated)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: "accent" | "success" | "warning";
  label: string;
  value: number | string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    accent: "border-accent/30 bg-accent/5 text-accent",
    success: "border-profit/30 bg-profit/5 text-profit",
    warning: "border-warning/30 bg-warning/5 text-warning",
  };

  return (
    <div className={`rounded-xl border p-4 ${toneClasses[tone]}`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-xs font-medium uppercase tracking-wider">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold text-text-primary">{value}</p>
    </div>
  );
}
