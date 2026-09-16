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
import { calculatePaymentSummary, calculateSaleFinancials } from "@/lib/business-sales";
import { formatCurrency, toLocalDateString } from "@/lib/utils";
import type { SaleRow } from "@/components/business/sales/types";

type PaymentMethod = "PIX" | "Dinheiro" | "Cartao" | "Transferencia" | "Outro";

type RecordPaymentDialogProps = {
  open: boolean;
  sale: SaleRow | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: { amount: number; method: PaymentMethod; paidAt: string; notes?: string }) => Promise<void>;
};

const paymentMethods: PaymentMethod[] = ["PIX", "Dinheiro", "Cartao", "Transferencia", "Outro"];

export function RecordPaymentDialog({ open, sale, loading, onOpenChange, onConfirm }: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [paidAt, setPaidAt] = useState(toLocalDateString());
  const [notes, setNotes] = useState("");
  const total = useMemo(() => {
    if (!sale) return 0;

    return calculateSaleFinancials({
      items: sale.items,
      returns: sale.returns,
      returnItems: sale.returnItems,
      deliveryFee: sale.delivery_fee,
      deliveryCost: sale.delivery_cost,
    }).netRevenue;
  }, [sale]);
  const payment = useMemo(
    () => calculatePaymentSummary({ totalAmount: total, payments: sale?.payments ?? [] }),
    [sale?.payments, total]
  );
  const error = amount <= 0
    ? "Informe um valor maior que zero."
    : amount > payment.remainingAmount
      ? "Pagamento acima do saldo restante."
      : null;

  useEffect(() => {
    if (open && sale) {
      const nextPayment = calculatePaymentSummary({
        totalAmount: calculateSaleFinancials({
          items: sale.items,
          returns: sale.returns,
          returnItems: sale.returnItems,
          deliveryFee: sale.delivery_fee,
          deliveryCost: sale.delivery_cost,
        }).netRevenue,
        payments: sale.payments,
      });
      setAmount(nextPayment.remainingAmount);
      setMethod("PIX");
      setPaidAt(toLocalDateString());
      setNotes("");
    }
  }, [open, sale]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-profit/20 p-2 text-profit">
              <ReceiptText className="h-5 w-5" />
            </div>
            <DialogTitle>Registrar pagamento</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/60 bg-background/35 p-3 text-sm">
            <Mini label="Total" value={formatCurrency(payment.totalAmount)} />
            <Mini label="Pago" value={formatCurrency(payment.netPaidAmount)} />
            <Mini label="Restante" value={formatCurrency(payment.remainingAmount)} strong />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sale-payment-amount">Valor</Label>
            <CurrencyInput id="sale-payment-amount" value={amount} onChange={setAmount} error={error ?? undefined} />
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
              <Label htmlFor="sale-payment-date">Data</Label>
              <Input id="sale-payment-date" type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sale-payment-notes">Observação</Label>
            <Textarea id="sale-payment-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            loading={loading}
            disabled={Boolean(error) || payment.remainingAmount <= 0}
            onClick={() => onConfirm({ amount, method, paidAt, notes })}
          >
            Registrar
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
