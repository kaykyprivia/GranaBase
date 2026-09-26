"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type WebhookEvent = {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  action: string | null;
  resource_id: string | null;
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  environment: string;
  created_at: string;
};

type WebhookStats = {
  total: number;
  processed: number;
  failed: number;
  pending: number;
  last_24h: number;
  last_7d: number;
};

const PAGE_SIZE = 100;

function formatDateTime(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminWebhooksPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [stats, setStats] = useState<WebhookStats | null>(null);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const [offset, setOffset] = useState(0);

  const loadData = useCallback(
    async (nextOffset: number, failed: boolean) => {
      setLoading(true);
      try {
        const [listRes, statsRes] = await Promise.all([
          supabase.rpc("admin_list_webhook_events", {
            p_limit: PAGE_SIZE,
            p_offset: nextOffset,
            p_only_failed: failed,
          }),
          supabase.rpc("admin_get_webhook_stats"),
        ]);

        if (listRes.error) throw listRes.error;
        if (statsRes.error) throw statsRes.error;

        setEvents((listRes.data as WebhookEvent[] | null) ?? []);
        const st = (statsRes.data as WebhookStats[] | null) ?? [];
        setStats(st[0] ?? null);
        setOffset(nextOffset);
      } catch (error) {
        console.error("Erro ao carregar webhooks:", error);
        const msg =
          error instanceof Error ? error.message : "Erro ao carregar webhooks";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    void loadData(0, onlyFailed);
  }, [loadData, onlyFailed]);

  const hasPrev = offset > 0;
  const hasNext = events.length === PAGE_SIZE;
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <Webhook className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Admin: Webhooks
            </h1>
            <p className="text-sm text-text-secondary">
              Eventos recebidos do Mercado Pago e status de processamento
            </p>
          </div>
        </div>
      </div>

      {stats && (
        <section className="mb-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              icon={<Webhook className="h-4 w-4" />}
              tone="accent"
              label="Total de eventos"
              value={stats.total}
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
              label="Processados"
              value={stats.processed}
            />
            <StatCard
              icon={<AlertTriangle className="h-4 w-4" />}
              tone="warning"
              label="Com erro"
              value={stats.failed}
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              tone="warning"
              label="Pendentes"
              value={stats.pending}
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              tone="accent"
              label="Ultimas 24h"
              value={stats.last_24h}
            />
            <StatCard
              icon={<Clock className="h-4 w-4" />}
              tone="accent"
              label="Ultimos 7 dias"
              value={stats.last_7d}
            />
          </div>
        </section>
      )}

      <div className="mb-4 flex gap-2">
        <Button
          type="button"
          variant={onlyFailed ? "outline" : "default"}
          size="sm"
          onClick={() => setOnlyFailed(false)}
        >
          Todos
        </Button>
        <Button
          type="button"
          variant={onlyFailed ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyFailed(true)}
        >
          Somente com erro
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-surface p-12 text-center">
          <Webhook className="mx-auto h-10 w-10 text-text-muted" />
          <p className="mt-3 text-sm text-text-secondary">
            Nenhum evento {onlyFailed ? "com erro " : ""}encontrado.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => {
            const failed = ev.error_message !== null;
            const pending = !ev.processed && !failed;

            return (
              <div
                key={ev.id}
                className={cn(
                  "rounded-xl border bg-surface p-4",
                  failed
                    ? "border-expense/30"
                    : pending
                    ? "border-warning/30"
                    : "border-border/60"
                )}
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-border/60 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                        {ev.event_type}
                      </span>
                      {ev.action && (
                        <span className="text-[10px] text-text-muted">
                          {ev.action}
                        </span>
                      )}
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                        {ev.environment}
                      </span>
                      {failed ? (
                        <span className="rounded-full bg-expense/10 px-2 py-0.5 text-[10px] font-medium text-expense">
                          Erro
                        </span>
                      ) : pending ? (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                          Pendente
                        </span>
                      ) : (
                        <span className="rounded-full bg-profit/10 px-2 py-0.5 text-[10px] font-medium text-profit">
                          Processado
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-text-primary">
                      {ev.event_id}
                    </p>
                    {ev.resource_id && (
                      <p className="mt-0.5 font-mono text-[10px] text-text-muted">
                        resource: {ev.resource_id}
                      </p>
                    )}
                  </div>
                  <p className="flex items-center gap-1 text-xs text-text-muted">
                    <Clock className="h-3 w-3" />
                    {formatDateTime(ev.created_at)}
                  </p>
                </div>

                {ev.error_message && (
                  <div className="mt-2 rounded-lg border border-expense/30 bg-expense/5 p-3">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-expense">
                      Erro
                    </p>
                    <p className="font-mono text-[11px] text-text-secondary whitespace-pre-wrap">
                      {ev.error_message}
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasPrev || loading}
              onClick={() => void loadData(Math.max(0, offset - PAGE_SIZE), onlyFailed)}
            >
              Anterior
            </Button>
            <span className="text-xs text-text-muted">Pagina {pageNumber}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasNext || loading}
              onClick={() => void loadData(offset + PAGE_SIZE, onlyFailed)}
            >
              Proxima
            </Button>
          </div>
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
  value: number;
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
