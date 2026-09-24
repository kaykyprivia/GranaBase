"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

type AuditEntry = {
  id: string;
  admin_user_id: string;
  admin_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const ACTION_LABELS: Record<string, string> = {
  withdrawal_status_updated: "Saque atualizado",
  bonus_days_granted: "Bonus concedido",
  bonus_grant_revoked: "Bonus revogado",
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

export default function AdminAuditPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [offset, setOffset] = useState(0);

  const loadData = useCallback(async (nextOffset: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_list_audit_log", {
        p_limit: PAGE_SIZE,
        p_offset: nextOffset,
      });

      if (error) throw error;

      const list = data as AuditEntry[] | null;
      setEntries(list ?? []);
      setOffset(nextOffset);
    } catch (error) {
      console.error("Erro ao carregar auditoria:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao carregar auditoria";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData(0);
  }, [loadData]);

  const hasPrev = offset > 0;
  const hasNext = entries.length === PAGE_SIZE;
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Admin: Auditoria
            </h1>
            <p className="text-sm text-text-secondary">
              Registro de acoes administrativas realizadas por super admins
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-surface p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-text-muted" />
          <p className="mt-3 text-sm text-text-secondary">
            Nenhuma acao administrativa registrada ainda.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-xl border border-border/60 bg-surface p-4"
            >
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {entry.admin_email ?? entry.admin_user_id}
                  </p>
                </div>
                <p className="text-xs text-text-muted">
                  {formatDateTime(entry.created_at)}
                </p>
              </div>

              {entry.target_type && (
                <p className="text-xs text-text-secondary">
                  Alvo: {entry.target_type}
                  {entry.target_id ? ` (${entry.target_id.slice(0, 8)}...)` : ""}
                </p>
              )}

              {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                <pre className="mt-2 overflow-x-auto rounded-lg border border-border/40 bg-background/40 p-2 text-[11px] text-text-secondary">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() => void loadData(Math.max(0, offset - PAGE_SIZE))}
            >
              Anterior
            </Button>
            <span className="text-xs text-text-muted">Pagina {pageNumber}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => void loadData(offset + PAGE_SIZE)}
            >
              Proxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
