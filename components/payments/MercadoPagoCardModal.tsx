"use client";

import { useState } from "react";
import { initMercadoPago, CardPayment } from "@mercadopago/sdk-react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

let mpInitialized = false;

type PlanType = "monthly" | "semiannual" | "annual";

interface MercadoPagoCardModalProps {
  open: boolean;
  planType: PlanType;
  publicKey: string;
  onClose: () => void;
  onSuccess: (initPoint: string) => void;
}

const PLAN_LABELS: Record<PlanType, string> = {
  monthly: "Plano Mensal",
  semiannual: "Plano Semestral",
  annual: "Plano Anual",
};

export function MercadoPagoCardModal({
  open,
  planType,
  publicKey,
  onClose,
  onSuccess,
}: MercadoPagoCardModalProps) {
  const [processing, setProcessing] = useState(false);

  if (!mpInitialized && publicKey) {
    initMercadoPago(publicKey, { locale: "pt-BR" });
    mpInitialized = true;
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !processing) onClose();
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="border-b border-border/60 p-4">
          <h2 className="text-lg font-bold text-text-primary">
            Pagamento seguro
          </h2>
          <p className="text-xs text-text-secondary">
            {PLAN_LABELS[planType]} · Mercado Pago
          </p>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <CardPayment
            initialization={{ amount: 0 }}
            customization={{
              paymentMethods: {
                maxInstallments: 1,
              },
            }}
            onSubmit={async (formData) => {
              setProcessing(true);
              try {
                const res = await fetch("/api/mp/create-checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    planType,
                    cardTokenId: formData.token,
                  }),
                });

                const result = await res.json();

                if (!res.ok || !result.success) {
                  throw new Error(
                    result.error || "Erro ao processar pagamento"
                  );
                }

                toast.success("Assinatura criada! Redirecionando...");
                onSuccess(result.initPoint);
              } catch (err) {
                console.error("Erro no pagamento:", err);
                toast.error(
                  err instanceof Error ? err.message : "Erro no pagamento"
                );
                setProcessing(false);
                throw err;
              }
            }}
            onError={(error) => {
              console.error("CardPayment error:", error);
              toast.error("Erro no formulario de cartao");
            }}
          />
        </div>

        <div className="flex justify-end border-t border-border/60 p-4">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={processing}
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processando...
              </>
            ) : (
              "Cancelar"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
