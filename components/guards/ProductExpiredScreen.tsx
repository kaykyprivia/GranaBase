"use client";

import Link from "next/link";
import { Lock, Sparkles, ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProductExpiredScreenProps {
  productLabel: string;
  endsAt?: string | null;
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
}: ProductExpiredScreenProps) {
  const hasExpired = Boolean(endsAt);

  return (
    <div className="page-container animate-fade-in">
      <div className="mx-auto max-w-lg py-12 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
          <Lock className="h-7 w-7 text-warning" />
        </div>

        <h1 className="text-2xl font-bold text-text-primary">
          {hasExpired
            ? `Seu periodo de ${productLabel} encerrou`
            : `Ative o ${productLabel} para comecar`}
        </h1>

        <p className="mt-3 text-sm text-text-secondary">
          {hasExpired
            ? `O periodo gratuito terminou em ${formatDate(endsAt)}. Seus dados foram preservados — assine ou ative novamente para continuar.`
            : `Voce ainda nao ativou o ${productLabel}. Ative 7 dias gratis para testar todos os recursos, ou assine um plano pago.`}
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
              Ver planos pagos
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
