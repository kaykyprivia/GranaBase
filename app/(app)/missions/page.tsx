"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  CheckCircle2,
  Clock,
  Flame,
  Gift,
  Loader2,
  Lock,
  Share2,
  Sparkles,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { AccessSummaryCard } from "@/components/access/AccessSummaryCard";

type Mission = {
  mission_key: string;
  title: string;
  description: string;
  reward_days: number;
  frequency: string;
  status: string;
  progress: number;
  target: number;
  completed_at: string | null;
  rewarded_at: string | null;
  can_claim: boolean;
  extra: Record<string, unknown>;
};

const MISSION_ICONS: Record<string, typeof Flame> = {
  streak_7: Flame,
  streak_30: Trophy,
  share_weekly: Share2,
};

const MISSION_COLORS: Record<string, { bg: string; icon: string }> = {
  streak_7: { bg: "bg-orange-500/10", icon: "text-orange-500" },
  streak_30: { bg: "bg-yellow-500/10", icon: "text-yellow-500" },
  share_weekly: { bg: "bg-sky-500/10", icon: "text-sky-500" },
};

export default function MissionsPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);

  const loadMissions = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_missions");
      if (error) throw error;
      setMissions((data as Mission[] | null) ?? []);
    } catch (error) {
      console.error("Erro ao carregar missoes:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao carregar missoes";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  async function handleShare() {
    // Compartilhar: usa Web Share API com fallback pra clipboard
    const baseUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://granabase.vercel.app";

    // Busca codigo de referral do user
    let referralCode: string | null = null;
    try {
      const { data } = await supabase.rpc("get_or_create_my_referral_code");
      referralCode = (data as string) ?? null;
    } catch (err) {
      console.warn("Nao conseguiu pegar referral code:", err);
    }

    const shareUrl = referralCode
      ? `${baseUrl}/register?ref=${referralCode}`
      : `${baseUrl}/register`;

    const shareText = `Estou usando o GranaBase para organizar minhas financas. Da uma olhada: ${shareUrl}`;

    // ?? IMPORTANTE: so chama claimReward se o share realmente aconteceu
    let shareCompleted = false;

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "GranaBase",
          text: "Controle financeiro para renda variavel",
          url: shareUrl,
        });
        // Chegou aqui = share completou
        shareCompleted = true;
      } else {
        // Fallback: copiar link
        await navigator.clipboard.writeText(shareText);
        toast.success("Link copiado! Cole onde quiser compartilhar.");
        shareCompleted = true;
      }
    } catch (err) {
      // User cancelou o share nativo ? nao concede recompensa
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      // Outro erro: tenta fallback com clipboard
      console.warn("Erro no compartilhamento:", err);
      try {
        await navigator.clipboard.writeText(shareText);
        toast.success("Link copiado!");
        shareCompleted = true;
      } catch {
        toast.error("Nao foi possivel compartilhar");
        return;
      }
    }

    // So resgata a recompensa se o share realmente aconteceu
    if (shareCompleted) {
      await claimReward("share_weekly", { silent: true });
    }
  }

  async function claimReward(
    missionKey: string,
    opts: { silent?: boolean } = {}
  ) {
    setClaiming(missionKey);
    try {
      const { data, error } = await supabase.rpc("claim_mission_reward", {
        p_mission_key: missionKey,
      });
      if (error) throw error;

      const result = (data as { success: boolean; reward_days: number; message: string }[] | null)?.[0];

      if (result?.success) {
        toast.success(result.message || `Voce ganhou +${result.reward_days} dias!`);
      } else if (!opts.silent) {
        toast.error(result?.message || "Nao foi possivel resgatar");
      }

      await loadMissions();
    } catch (error) {
      console.error("Erro ao resgatar:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao resgatar recompensa";
      toast.error(msg);
    } finally {
      setClaiming(null);
    }
  }

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
            <Award className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
              Tarefas
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Complete tarefas e ganhe dias gratis de acesso ao GranaBase.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-52 rounded-xl" />
        </div>
      ) : missions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-surface p-12 text-center">
          <Award className="mx-auto h-10 w-10 text-text-muted" />
          <p className="mt-3 text-sm text-text-secondary">
            Nenhuma tarefa disponivel no momento.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {missions.map((mission) => (
            <MissionCard
              key={mission.mission_key + (mission.extra?.period_key ?? "")}
              mission={mission}
              claiming={claiming === mission.mission_key}
              onClaim={() => void claimReward(mission.mission_key)}
              onShare={() => void handleShare()}
            />
          ))}
        </div>
      )}

      {/* Resumo de acesso */}
      <AccessSummaryCard variant="full" className="mt-8" />

      {/* Rodape explicativo */}
      <div className="mt-8 rounded-xl border border-border/60 bg-surface p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <div className="text-xs text-text-secondary">
            <p className="font-medium text-text-primary">
              Como funcionam as recompensas?
            </p>
            <p className="mt-1">
              Ao completar uma tarefa, voce ganha dias gratuitos de acesso ao
              GranaBase Pessoal e Negocio. Os dias sao somados automaticamente
              ao seu tempo atual.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MissionCard({
  mission,
  claiming,
  onClaim,
  onShare,
}: {
  mission: Mission;
  claiming: boolean;
  onClaim: () => void;
  onShare: () => void;
}) {
  const Icon = MISSION_ICONS[mission.mission_key] ?? Sparkles;
  const colors = MISSION_COLORS[mission.mission_key] ?? {
    bg: "bg-accent/10",
    icon: "text-accent",
  };

  const isRewarded = mission.status === "rewarded";
  const isBlocked = mission.status === "blocked";
  const isShare = mission.mission_key === "share_weekly";
  const progressPct = Math.min(
    100,
    Math.round((mission.progress / mission.target) * 100)
  );

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border bg-surface p-5",
        isRewarded
          ? "border-profit/40"
          : isBlocked
          ? "border-warning/30"
          : "border-border/60"
      )}
    >
      {/* Topo: icone + badge */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full",
            colors.bg
          )}
        >
          <Icon className={cn("h-5 w-5", colors.icon)} />
        </div>

        {isRewarded ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-profit/30 bg-profit/10 px-2.5 py-0.5 text-xs font-medium text-profit">
            <CheckCircle2 className="h-3 w-3" />
            Concluida
          </span>
        ) : isBlocked ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
            <Lock className="h-3 w-3" />
            Bloqueada
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
            <Gift className="h-3 w-3" />
            +{mission.reward_days}d
          </span>
        )}
      </div>

      {/* Titulo + descricao */}
      <h2 className="text-base font-bold text-text-primary">
        {mission.title}
      </h2>
      <p className="mt-1 flex-1 text-xs text-text-secondary leading-relaxed">
        {mission.description}
      </p>

      {/* Progresso (so pra streak) */}
      {!isShare && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-text-muted">
            <span>Progresso</span>
            <span className="tabular-nums">
              {mission.progress} / {mission.target}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isRewarded ? "bg-profit" : "bg-accent"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Bloqueio explicativo */}
      {isBlocked && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-2.5">
          <p className="text-[11px] text-text-secondary">
            Voce precisa de acesso ativo para resgatar. Assine um plano ou
            ganhe dias em outra tarefa.
          </p>
        </div>
      )}

      {/* Frequencia (share) */}
      {isShare && (
        <p className="mt-3 text-[11px] text-text-muted">
          Renova toda segunda-feira
        </p>
      )}

      {/* Botao */}
      <div className="mt-4">
        {isRewarded ? (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled
          >
            <CheckCircle2 className="h-4 w-4" />
            {isShare ? "Aguarde a proxima segunda" : "Concluida"}
          </Button>
        ) : isBlocked ? (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled
          >
            <Lock className="h-4 w-4" />
            Bloqueada
          </Button>
        ) : isShare ? (
          <Button
            type="button"
            className="w-full gap-2"
            disabled={claiming}
            onClick={onShare}
          >
            {claiming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            Compartilhar
          </Button>
        ) : mission.progress >= mission.target ? (
          <Button
            type="button"
            className="w-full gap-2"
            disabled={claiming}
            onClick={onClaim}
          >
            {claiming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Resgatar +{mission.reward_days} dias
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled
          >
            <Clock className="h-4 w-4" />
            Em andamento
          </Button>
        )}
      </div>
    </div>
  );
}
