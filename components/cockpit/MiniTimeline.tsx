"use client";

import Link from "next/link";
import { ChevronRight, FileText, CreditCard } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import type { ProjectionDay } from "@/lib/projection-engine";

interface MiniTimelineProps {
  days: ProjectionDay[];
  loading?: boolean;
}

const riskStyles = {
  safe:     { card: "timeline-day-safe",     text: "text-profit"  },
  warning:  { card: "timeline-day-warning",  text: "text-warning" },
  critical: { card: "timeline-day-critical", text: "text-expense" },
} as const;

function EventIcon({ type }: { type: "bill" | "installment" | "income" }) {
  if (type === "bill") return <FileText className="h-3 w-3 shrink-0" />;
  return <CreditCard className="h-3 w-3 shrink-0" />;
}

export function MiniTimeline({ days, loading }: MiniTimelineProps) {
  if (loading) {
    return (
      <div className="cockpit-card p-5 space-y-3">
        <div className="h-4 w-40 bg-border/40 rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-border/20 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  // Show today + next 14 days that have events OR today
  const activeDays = days
    .slice(0, 14)
    .filter((d) => d.events.length > 0 || d.isToday)
    .slice(0, 5); // cap at 5 for the mini view

  return (
    <div className="cockpit-card p-5 animate-fade-up delay-150">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Próximos Eventos
          </p>
          <p className="text-sm font-semibold text-text-primary mt-0.5">
            Timeline Financeira
          </p>
        </div>
        {/* Link wrapping an anchor — no button inside anchor */}
        <Link
          href="/timeline"
          className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors font-medium"
        >
          Ver tudo
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="space-y-2">
        {activeDays.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-2xl mb-1">🎉</p>
            <p className="text-sm font-medium text-profit">Sem obrigações nos próximos 14 dias</p>
          </div>
        ) : (
          activeDays.map((day) => {
            const styles = riskStyles[day.risk];
            return (
              <div
                key={day.date}
                className={cn(
                  "rounded-xl p-3 transition-all duration-200",
                  styles.card,
                  day.isToday && "ring-1 ring-accent/40"
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-text-primary">
                      {day.dateLabel}
                    </span>
                    {day.isToday && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded-full font-semibold">
                        Hoje
                      </span>
                    )}
                  </div>
                  <span className={cn("text-xs font-semibold tabular-nums", styles.text)}>
                    {formatCurrency(day.balance)}
                  </span>
                </div>

                {day.events.length > 0 ? (
                  <div className="space-y-1">
                    {day.events.slice(0, 2).map((evt) => (
                      <div key={evt.id} className="flex items-center gap-1.5 text-text-secondary">
                        <EventIcon type={evt.type} />
                        <span className="text-xs flex-1 truncate">{evt.title}</span>
                        <span className="text-xs text-expense font-medium tabular-nums shrink-0">
                          -{formatCurrency(evt.amount)}
                        </span>
                      </div>
                    ))}
                    {day.events.length > 2 && (
                      <p className="text-[10px] text-text-muted pl-4">
                        +{day.events.length - 2} eventos
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">Sem obrigações hoje</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
