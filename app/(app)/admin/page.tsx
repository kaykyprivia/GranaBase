"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Crown,
  Gift,
  HandCoins,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/utils";

type DashboardStats = {
  total_users: number;
  total_super_admins: number;
  total_influencers: number;
  total_active_subscriptions: number;
  subscriptions_monthly: number;
  subscriptions_semiannual: number;
  subscriptions_annual: number;
  total_free_personal_active: number;
  total_free_business_active: number;
  total_commissions_pending: number;
  total_commissions_available: number;
  total_commissions_paid: number;
  total_referrals: number;
};

export default function AdminDashboardPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_get_dashboard_stats");
      if (error) throw error;

      const list = data as DashboardStats[] | null;
      setStats(list?.[0] ?? null);
    } catch (error) {
      console.error("Erro ao carregar dashboard:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao carregar dashboard";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Admin: Dashboard
            </h1>
            <p className="text-sm text-text-secondary">
              Visao geral de usuarios, assinaturas e comissoes
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !stats ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-surface p-12 text-center">
          <p className="text-sm text-text-secondary">
            Sem estatisticas disponiveis.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Usuarios
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                icon={<Users className="h-4 w-4" />}
                tone="accent"
                label="Total de usuarios"
                value={stats.total_users}
              />
              <StatCard
                icon={<ShieldCheck className="h-4 w-4" />}
                tone="accent"
                label="Super admins"
                value={stats.total_super_admins}
              />
              <StatCard
                icon={<Gift className="h-4 w-4" />}
                tone="accent"
                label="Influencers ativos"
                value={stats.total_influencers}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Assinaturas pagas
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Crown className="h-4 w-4" />}
                tone="success"
                label="Ativas (total)"
                value={stats.total_active_subscriptions}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                tone="success"
                label="Mensal"
                value={stats.subscriptions_monthly}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                tone="success"
                label="Semestral"
                value={stats.subscriptions_semiannual}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                tone="success"
                label="Anual"
                value={stats.subscriptions_annual}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Free ativo
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                icon={<Users className="h-4 w-4" />}
                tone="warning"
                label="Free Personal"
                value={stats.total_free_personal_active}
              />
              <StatCard
                icon={<Users className="h-4 w-4" />}
                tone="warning"
                label="Free Business"
                value={stats.total_free_business_active}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Comissoes
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                icon={<HandCoins className="h-4 w-4" />}
                tone="warning"
                label="Pendentes"
                value={formatCurrency(stats.total_commissions_pending)}
              />
              <StatCard
                icon={<HandCoins className="h-4 w-4" />}
                tone="accent"
                label="Disponiveis"
                value={formatCurrency(stats.total_commissions_available)}
              />
              <StatCard
                icon={<HandCoins className="h-4 w-4" />}
                tone="success"
                label="Pagas"
                value={formatCurrency(stats.total_commissions_paid)}
              />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
              Indicacoes
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                icon={<Gift className="h-4 w-4" />}
                tone="accent"
                label="Total de indicacoes"
                value={stats.total_referrals}
              />
            </div>
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
    success: "border-success/30 bg-success/5 text-success",
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
