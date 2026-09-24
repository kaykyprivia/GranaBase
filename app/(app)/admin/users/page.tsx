"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

type AdminUser = {
  user_id: string;
  email: string;
  created_at: string;
  roles: string[];
  has_active_subscription: boolean;
  active_subscription_plan: string | null;
};

const PLAN_LABELS: Record<string, string> = {
  monthly: "Mensal",
  semiannual: "Semestral",
  annual: "Anual",
};

const PAGE_SIZE = 50;

function formatDate(date: string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminUsersPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [offset, setOffset] = useState(0);

  const loadData = useCallback(async (nextOffset: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_list_users", {
        p_limit: PAGE_SIZE,
        p_offset: nextOffset,
      });

      if (error) throw error;

      const list = data as AdminUser[] | null;
      setUsers(list ?? []);
      setOffset(nextOffset);
    } catch (error) {
      console.error("Erro ao carregar usuarios:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao carregar usuarios";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData(0);
  }, [loadData]);

  const hasPrev = offset > 0;
  const hasNext = users.length === PAGE_SIZE;
  const pageNumber = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
            <Users className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Admin: Usuarios
            </h1>
            <p className="text-sm text-text-secondary">
              Lista de usuarios cadastrados, roles e assinatura ativa
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-surface p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-text-muted" />
          <p className="mt-3 text-sm text-text-secondary">
            Nenhum usuario encontrado.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.user_id}
              className="rounded-xl border border-border/60 bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {user.email}
                  </p>
                  <p className="text-xs text-text-muted">
                    Cadastrado em {formatDate(user.created_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {user.roles.includes("SUPER_ADMIN") && (
                    <Badge variant="warning" className="gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Super Admin
                    </Badge>
                  )}
                  {user.roles.includes("INFLUENCER") && (
                    <Badge variant="secondary" className="gap-1">
                      <Crown className="h-3 w-3" />
                      Influencer
                    </Badge>
                  )}
                  {user.has_active_subscription ? (
                    <Badge variant="profit">
                      {PLAN_LABELS[user.active_subscription_plan ?? ""] ??
                        user.active_subscription_plan ??
                        "Assinante"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Free</Badge>
                  )}
                </div>
              </div>
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
