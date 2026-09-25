"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type SupportKind = "bug" | "suggestion" | "question" | "billing" | "other";
type SupportStatus = "open" | "in_progress" | "resolved" | "closed";

type SupportRequest = {
  id: string;
  kind: string;
  subject: string;
  message: string;
  status: string;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
};

const KIND_LABELS: Record<SupportKind, string> = {
  bug: "Bug",
  suggestion: "Sugestao",
  question: "Duvida",
  billing: "Pagamento",
  other: "Outro",
};

const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  resolved: "Resolvido",
  closed: "Fechado",
};

const STATUS_CLASSES: Record<SupportStatus, string> = {
  open: "bg-warning/10 text-warning",
  in_progress: "bg-accent/10 text-accent",
  resolved: "bg-profit/10 text-profit",
  closed: "bg-surface text-text-muted",
};

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

export default function SupportPage() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [kind, setKind] = useState<SupportKind>("question");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("list_my_support_requests");
      if (error) throw error;
      setRequests((data as SupportRequest[] | null) ?? []);
    } catch (error) {
      console.error("Erro ao carregar suporte:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao carregar suporte";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSubmit() {
    if (subject.trim().length < 3) {
      toast.error("Assunto muito curto");
      return;
    }
    if (message.trim().length < 10) {
      toast.error("Mensagem muito curta");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("submit_support_request", {
        p_kind: kind,
        p_subject: subject.trim(),
        p_message: message.trim(),
      });
      if (error) throw error;

      toast.success("Solicitacao enviada! Responderemos em breve.");
      setSubject("");
      setMessage("");
      setKind("question");
      await loadData();
    } catch (error) {
      console.error("Erro ao enviar:", error);
      const msg =
        error instanceof Error ? error.message : "Erro ao enviar solicitacao";
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
            <MessageSquare className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">
              Suporte e sugestoes
            </h1>
            <p className="text-sm text-text-secondary">
              Reporte problemas, envie sugestoes ou tire duvidas
            </p>
          </div>
        </div>
      </div>

      <section className="mb-8">
        <div className="rounded-xl border border-border/60 bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">
            Nova solicitacao
          </h2>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                Tipo
              </label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(KIND_LABELS) as SupportKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      kind === k
                        ? "bg-accent text-white"
                        : "border border-border/60 bg-background text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {KIND_LABELS[k]}
                  </button>
                ))}
              </div>
            </div>

            <Input
              placeholder="Assunto (ex: erro ao salvar meta)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={120}
            />

            <textarea
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="Descreva com detalhes o que aconteceu ou sua sugestao..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
            />

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                className="gap-2"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Enviar
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Minhas solicitacoes ({requests.length})
        </h2>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-surface p-12 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-text-muted" />
            <p className="mt-3 text-sm text-text-secondary">
              Voce ainda nao enviou nenhuma solicitacao.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const status = req.status as SupportStatus;
              return (
                <div
                  key={req.id}
                  className="rounded-xl border border-border/60 bg-surface p-4"
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="rounded-full bg-border/60 px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                          {KIND_LABELS[req.kind as SupportKind] ?? req.kind}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            STATUS_CLASSES[status] ?? "bg-surface text-text-muted"
                          )}
                        >
                          {STATUS_LABELS[status] ?? req.status}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-text-primary">
                        {req.subject}
                      </p>
                    </div>
                    <p className="flex items-center gap-1 text-xs text-text-muted">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(req.created_at)}
                    </p>
                  </div>

                  <p className="text-xs text-text-secondary whitespace-pre-wrap">
                    {req.message}
                  </p>

                  {req.admin_notes && (
                    <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3">
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        Resposta da equipe
                      </p>
                      <p className="text-xs text-text-secondary whitespace-pre-wrap">
                        {req.admin_notes}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
