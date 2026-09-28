"use client";

import Link from "next/link";
import { Lock, Sparkles, ArrowRight, Play, Gift, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProductExpiredScreenProps {
  productLabel: string;
  endsAt?: string | null;
  daysRemaining?: number | null;
  hasFreeActivated?: boolean;
  canActivateFree?: boolean;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function ProductExpiredScreen({
  productLabel,
  endsAt,
  daysRemaining: _daysRemaining,
  hasFreeActivated = false,
  canActivateFree = false,
}: ProductExpiredScreenProps) {
  // Estado 1: Nunca ativou — mostra "Comece agora" + botão "Ativar 7 dias grátis"
  const neverActivated = !hasFreeActivated && canActivateFree;

  // Estado 2: Já ativou e expirou — mostra CTAs de pagamento + indicação

  return (
    <div className="page-container animate-fade-in">
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
          <Lock className="h-7 w-7 text-warning" />
        </div>

        {neverActivated ? (
          <>
            <h1 className="text-2xl font-bold text-text-primary">
              Ative o {productLabel} para comecar
            </h1>
            <p className="mt-3 text-sm text-text-secondary">
              Voce ainda nao ativou o {productLabel}. Ative 7 dias gratis para
              testar todos os recursos, ou assine um plano pago.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link href="/onboarding">
                <Button type="button" className="w-full gap-2 sm:w-auto">
                  <Play className="h-4 w-4" />
                  Ativar 7 dias gratis
                </Button>
              </Link>
              <Link href="/plans">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 sm:w-auto"
                >
                  <Sparkles className="h-4 w-4" />
                  Ver planos
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-text-primary">
              Seu periodo de {productLabel} encerrou
            </h1>
            <p className="mt-3 text-sm text-text-secondary">
              {endsAt
                ? `O periodo gratuito terminou em ${formatDate(endsAt)}.`
                : "O periodo gratuito terminou."}{" "}
              Seus dados foram preservados. Escolha como continuar:
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {/* Card 1 — Assinar */}
              <Link href="/plans" className="group">
                <div className="h-full rounded-xl border border-accent/30 bg-accent/5 p-5 text-left transition-all hover:border-accent/60 hover:bg-accent/10">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/20">
                    <Sparkles className="h-5 w-5 text-accent" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary">
                    Assinar um plano
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Acesso total a Personal + Negocio. Cancele quando quiser.
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-accent">
                    Ver planos
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </div>
              </Link>

              {/* Card 2 — Indique e Ganhe */}
              <Link href="/referrals" className="group">
                <div className="h-full rounded-xl border border-profit/30 bg-profit/5 p-5 text-left transition-all hover:border-profit/60 hover:bg-profit/10">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-profit/20">
                    <Gift className="h-5 w-5 text-profit" />
                  </div>
                  <p className="text-sm font-semibold text-text-primary">
                    Indique e ganhe dias
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    Convide amigos e ganhe dias gratis + comissao por indicacao.
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-profit">
                    Comecar agora
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </div>
              </Link>
            </div>

            {/* Rodapé explicativo */}
            <div className="mt-8 rounded-xl border border-border/60 bg-surface p-4">
              <div className="flex items-start gap-3 text-left">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                <p className="text-xs text-text-secondary">
                  Seus dados continuam salvos. Ao assinar ou ganhar dias, voce
                  volta a ter acesso imediato a tudo que ja cadastrou.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
