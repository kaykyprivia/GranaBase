"use client";

import { useEffect, useMemo, useState } from "react";
import { ReceiptText } from "lucide-react";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { calculatePurchasePaymentSummary } from "@/lib/business-purchases";
import { formatCurrency, toLocalDateString } from "@/lib/utils";
import type { PurchaseDetail } from "@/components/business/purchases/types";
import type { BusinessPurchasePaymentStatus } from "@/types/database";

type PaymentMethod = "PIX" | "Dinheiro" | "Cartao" | "Transferencia" | "Outro";

type RecordPurchasePaymentDialogProps = {
  open: boolean;
  purchase: PurchaseDetail | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { amount: number; method: PaymentMethod; paidAt: string; notes?: string; status: BusinessPurchasePaymentStatus }) => Promise<void>;
};

const paymentMethods: PaymentMethod[] = ["PIX", "Dinheiro", "Cartao", "Transferencia", "Outro"];

export function RecordPurchasePaymentDialog({ open, purchase, loading, onOpenChange, onConfirm }: RecordPurchasePaymentDialogProps) {
  const [amount, setAmount] = useState(0);
  const [status, setStatus] = useState<BusinessPurchasePaymentStatus>("PAID");
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [paidAt, setPaidAt] = useState(toLocalDateString());
  const [notes, setNotes] = useState("");
  const total = useMemo(() => purchase?.total_cost ?? 0, [purchase]);
  const payment = useMemo(
    () => calculatePurchasePaymentSummary({ totalAmount: total, payments: purchase?.payments ?? [] }),
    [purchase?.payments, total]
  );
  const maxAmount = status === "PAID" ? payment.remainingAmount : payment.refundableAmount;
  const error = amount <= 0
    ? "Informe um valor maior que zero."
    : amount > maxAmount
      ? status === "PAID"
        ? "Pagamento acima do saldo restante."
        : "Estorno acima do valor disponível."
      : null;

  useEffect(() => {
    if (open && purchase) {
      const nextPayment = calculatePurchasePaymentSummary({
        totalAmount: purchase.total_cost,
        payments: purchase.payments,
      });
      const nextStatus: BusinessPurchasePaymentStatus = purchase.status !== "CANCELLED" && nextPayment.remainingAmount > 0 ? "PAID" : "REFUNDED";
      setStatus(nextStatus);
      setAmount(nextStatus === "PAID" ? nextPayment.remainingAmount : nextPayment.refundableAmount);
      setMethod("PIX");
      setPaidAt(toLocalDateString());
      setNotes("");
    }
  }, [open, purchase]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-profit/20 p-2 text-profit">
              <ReceiptText className="h-5 w-5" />
            </div>
            <DialogTitle>{status === "PAID" ? "Registrar pagamento" : "Registrar estorno"}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Movimentação</Label>
            <Select
              value={status}
              onValueChange={(value) => {
                const nextStatus = value as BusinessPurchasePaymentStatus;
                setStatus(nextStatus);
                setAmount(nextStatus === "PAID" ? payment.remainingAmount : payment.refundableAmount);
              }}
            >
              <SelectTrigger aria-label="Tipo de movimentação">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PAID" disabled={purchase?.status === "CANCELLED" || payment.remainingAmount <= 0}>Pagamento</SelectItem>
                <SelectItem value="REFUNDED" disabled={payment.refundableAmount <= 0}>Estorno</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
            <Mini label="Total" value={formatCurrency(payment.totalAmount)} />
            <Mini label="Pago" value={formatCurrency(payment.netPaidAmount)} />
            <Mini label="Restante" value={formatCurrency(payment.remainingAmount)} strong />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchase-payment-amount">Valor</Label>
            <CurrencyInput id="purchase-payment-amount" value={amount} onChange={setAmount} error={error ?? undefined} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                <SelectTrigger aria-label="Forma de pagamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purchase-payment-date">Data</Label>
              <Input id="purchase-payment-date" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="purchase-payment-notes">Observação</Label>
            <Textarea id="purchase-payment-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={loading}
            disabled={Boolean(error) || maxAmount <= 0}
            onClick={() => onConfirm({ amount, method, paidAt, notes, status })}
          >
            {status === "PAID" ? "Registrar pagamento" : "Registrar estorno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Mini({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={strong ? "truncate font-semibold tabular-nums text-text-primary" : "truncate tabular-nums text-text-secondary"}>{value}</p>
    </div>
  );
}
