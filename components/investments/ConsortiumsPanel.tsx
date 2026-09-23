"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, Landmark, Plus, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Database } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/shared/StatCard";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { FormField } from "@/components/shared/FormField";
import { PageIntro } from "@/components/shared/PageIntro";

type Consortium = Database["public"]["Tables"]["consortiums"]["Row"];
type ConsortiumPayment = Database["public"]["Tables"]["consortium_payments"]["Row"];

type ConsortiumWithPayment = Consortium & {
  currentPayment: ConsortiumPayment | null;
  paidTotal: number;
  paidCount: number;
};

export function ConsortiumsPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [consortiums, setConsortiums] = useState<ConsortiumWithPayment[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<ConsortiumPayment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentNotes, setPaymentNotes] = useState("");

  const [name, setName] = useState("");
  const [holderName, setHolderName] = useState("");
  const [administrator, setAdministrator] = useState("");
  const [creditAmount, setCreditAmount] = useState(0);
  const [totalInstallments, setTotalInstallments] = useState("");
  const [installmentAmount, setInstallmentAmount] = useState(0);
  const [currentInstallmentNumber, setCurrentInstallmentNumber] = useState("1");
  const [currentDueDate, setCurrentDueDate] = useState("");
  const [initialPaidAmount, setInitialPaidAmount] = useState(0);
  const [dueDay, setDueDay] = useState("");
  const [administrationFee, setAdministrationFee] = useState("");
  const [reserveFund, setReserveFund] = useState("");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setName("");
    setHolderName("");
    setAdministrator("");
    setCreditAmount(0);
    setTotalInstallments("");
    setInstallmentAmount(0);
    setCurrentInstallmentNumber("1");
    setCurrentDueDate("");
    setInitialPaidAmount(0);
    setDueDay("");
    setAdministrationFee("");
    setReserveFund("");
    setNotes("");
  };

  const handleCreateConsortium = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const installmentCount = Number.parseInt(totalInstallments, 10);
    const currentInstallment = Number.parseInt(currentInstallmentNumber, 10);
    const contractualDueDay = dueDay ? Number.parseInt(dueDay, 10) : null;

    if (!name.trim()) {
      toast.error("Informe o nome do consórcio.");
      return;
    }

    if (!holderName.trim()) {
      toast.error("Informe o titular.");
      return;
    }

    if (creditAmount <= 0) {
      toast.error("Informe o valor da carta.");
      return;
    }

    if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
      toast.error("Informe a quantidade de parcelas.");
      return;
    }

    if (installmentAmount <= 0) {
      toast.error("Informe o valor atual da parcela.");
      return;
    }

    if (
      !Number.isInteger(currentInstallment) ||
      currentInstallment <= 0 ||
      currentInstallment > installmentCount
    ) {
      toast.error("Informe uma parcela atual valida.");
      return;
    }

    if (!currentDueDate) {
      toast.error("Informe o vencimento da parcela atual.");
      return;
    }

    if (initialPaidAmount < 0) {
      toast.error("O capital ja pago nao pode ser negativo.");
      return;
    }

    if (
      contractualDueDay !== null &&
      (!Number.isInteger(contractualDueDay) ||
        contractualDueDay < 1 ||
        contractualDueDay > 31)
    ) {
      toast.error("O dia contratual deve estar entre 1 e 31.");
      return;
    }

    try {
      setCreating(true);

      const { error } = await supabase.rpc(
        "create_consortium_v2",
        {
          p_name: name.trim(),
          p_holder_name: holderName.trim(),
          p_credit_amount: creditAmount,
          p_total_installments: installmentCount,
          p_current_installment_amount: installmentAmount,
          p_current_installment_number: currentInstallment,
          p_current_due_date: currentDueDate,
          p_initial_paid_amount: initialPaidAmount,
          p_due_day: contractualDueDay,
          p_administrator: administrator.trim() || null,
          p_administration_fee_percent: administrationFee
            ? Number(administrationFee)
            : null,
          p_reserve_fund_percent: reserveFund
            ? Number(reserveFund)
            : null,
          p_notes: notes.trim() || null,
        }
      );

      if (error) throw error;

      toast.success("Consórcio cadastrado com sucesso.");
      setFormOpen(false);
      resetForm();
      await loadConsortiums();
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível cadastrar o consórcio.");
    } finally {
      setCreating(false);
    }
  };

  const handlePayInstallment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedPayment) {
      toast.error("Nenhuma parcela selecionada.");
      return;
    }

    if (paymentAmount <= 0) {
      toast.error("Informe o valor pago.");
      return;
    }

    if (paymentAmount > selectedPayment.amount) {
      toast.error("O valor pago nao pode ser maior que o valor da parcela.");
      return;
    }

    try {
      setPaying(true);

      const { error } = await supabase.rpc(
        "pay_consortium_payment",
        {
          p_payment_id: selectedPayment.id,
          p_paid_amount: paymentAmount,
          p_notes: paymentNotes.trim() || null,
        }
      );

      if (error) throw error;

      toast.success("Parcela do consórcio paga com sucesso.");
      setPaymentOpen(false);
      setSelectedPayment(null);
      setPaymentAmount(0);
      setPaymentNotes("");
      await loadConsortiums();
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel registrar o pagamento.");
    } finally {
      setPaying(false);
    }
  };

  const loadConsortiums = useCallback(async () => {
    try {
      setLoading(true);

      const { data: consortiumRows, error: consortiumError } = await supabase
        .from("consortiums")
        .select("*")
        .order("created_at", { ascending: false });

      if (consortiumError) throw consortiumError;

      const { data: paymentRows, error: paymentsError } = await supabase
        .from("consortium_payments")
        .select("*")
        .order("installment_number", { ascending: true });

      if (paymentsError) throw paymentsError;

      const payments = (paymentRows ?? []) as ConsortiumPayment[];

      const mapped = ((consortiumRows ?? []) as Consortium[]).map((consortium) => {
        const ownPayments = payments.filter(
          (payment) => payment.consortium_id === consortium.id
        );

        const paidPayments = ownPayments.filter(
          (payment) =>
            payment.status === "paid" ||
            payment.status === "paid_with_discount"
        );

        const currentPayment =
          ownPayments.find((payment) => payment.status === "pending") ?? null;

        return {
          ...consortium,
          currentPayment,
          paidTotal:
            consortium.initial_paid_amount +
            paidPayments.reduce(
              (sum, payment) =>
                sum + (payment.paid_amount ?? payment.amount),
              0
            ),
          paidCount:
            consortium.initial_paid_installments + paidPayments.length,
        };
      });

      setConsortiums(mapped);
    } catch (error) {
      console.error(error);
      toast.error("Nao foi possivel carregar os consórcios.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadConsortiums();
  }, [loadConsortiums]);

  const totalCredit = consortiums.reduce(
    (sum, consortium) => sum + consortium.credit_amount,
    0
  );

  const totalPaid = consortiums.reduce(
    (sum, consortium) => sum + consortium.paidTotal,
    0
  );

  const nextPayment = consortiums
    .map((consortium) => consortium.currentPayment)
    .filter((payment): payment is ConsortiumPayment => payment !== null)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;

  if (loading) {
    return (
      <div className="py-10 text-center text-sm text-text-secondary">
        Carregando consórcios...
      </div>
    );
  }

  return (
    <div>
      <PageIntro
        icon={Landmark}
        iconTone="accent"
        title="Consórcios"
        description="Acompanhe cartas, parcelas, progresso e próximos vencimentos."
        actions={
          <Button className="gap-2" type="button" onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo consórcio
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Valor das cartas"
          value={formatCurrency(totalCredit)}
          icon={WalletCards}
        />
        <StatCard
          title="Capital comprometido"
          value={formatCurrency(totalPaid)}
          icon={Landmark}
          subtitle="Valor efetivamente pago"
        />
        <StatCard
          title="Próxima parcela"
          value={nextPayment ? formatCurrency(nextPayment.amount) : "?"}
          icon={CalendarClock}
          subtitle={nextPayment ? formatDate(nextPayment.due_date) : "Sem vencimentos"}
        />
      </div>

      {consortiums.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhum consórcio cadastrado"
          description="Cadastre sua primeira carta para acompanhar pagamentos, progresso e vencimentos."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {consortiums.map((consortium) => {
            const progress = Math.min(
              100,
              (consortium.paidCount / consortium.total_installments) * 100
            );

            return (
              <Card key={consortium.id} className="border-border/70 bg-surface/90">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">{consortium.name}</CardTitle>
                      <div className="mt-1 space-y-0.5 text-xs text-text-secondary">
                        <p>{consortium.holder_name}</p>
                        {consortium.administrator ? (
                          <p>{consortium.administrator}</p>
                        ) : null}
                      </div>
                    </div>

                    <span className="text-sm font-semibold text-accent">
                      {formatCurrency(consortium.credit_amount)}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="text-text-secondary">Progresso</span>
                      <span>
                        {consortium.paidCount}/{consortium.total_installments}
                      </span>
                    </div>
                    <Progress value={progress} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-text-secondary">Total pago</p>
                      <p className="font-semibold">
                        {formatCurrency(consortium.paidTotal)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-text-secondary">Parcela atual</p>
                      <p className="font-semibold">
                        {consortium.currentPayment
                          ? formatCurrency(consortium.currentPayment.amount)
                          : "?"}
                      </p>
                    </div>
                  </div>

                  {consortium.currentPayment && (() => {
                    const currentPayment = consortium.currentPayment;

                    return (
                    <div className="flex items-center justify-between rounded-xl border border-border/70 px-3 py-3">
                      <div>
                        <p className="text-xs text-text-secondary">
                          Próximo vencimento
                        </p>
                        <p className="text-sm font-medium">
                          {formatDate(consortium.currentPayment.due_date)}
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedPayment(currentPayment);
                          setPaymentAmount(currentPayment.amount);
                          setPaymentNotes("");
                          setPaymentOpen(true);
                        }}
                      >
                        Pagar parcela
                      </Button>
                    </div>
                    );
                  })()}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={paymentOpen}
        onOpenChange={(open) => {
          setPaymentOpen(open);

          if (!open && !paying) {
            setSelectedPayment(null);
            setPaymentAmount(0);
            setPaymentNotes("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar parcela do consórcio</DialogTitle>
          </DialogHeader>

          <form onSubmit={handlePayInstallment} className="space-y-4">
            {selectedPayment && (
              <div className="rounded-xl border border-border/70 p-3 text-sm">
                <p className="text-text-secondary">Parcela</p>
                <p className="font-semibold">
                  {selectedPayment.installment_number}
                </p>

                <p className="mt-2 text-text-secondary">Vencimento</p>
                <p className="font-semibold">
                  {formatDate(selectedPayment.due_date)}
                </p>

                <p className="mt-2 text-text-secondary">Valor previsto</p>
                <p className="font-semibold">
                  {formatCurrency(selectedPayment.amount)}
                </p>
              </div>
            )}

            <FormField
              label="Valor pago"
              required
              hint="Se pagar menos que o valor previsto, a parcela sera registrada como paga com desconto."
            >
              <CurrencyInput
                value={paymentAmount}
                onChange={setPaymentAmount}
              />
            </FormField>

            <FormField label="Observacoes">
              <Textarea
                rows={3}
                value={paymentNotes}
                onChange={(event) => setPaymentNotes(event.target.value)}
                placeholder="Ex: desconto negociado, observacao do pagamento..."
              />
            </FormField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={paying}
                onClick={() => setPaymentOpen(false)}
              >
                Cancelar
              </Button>

              <Button type="submit" loading={paying}>
                Confirmar pagamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open && !creating) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo consórcio</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateConsortium} className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-surface/60 p-3 text-xs text-text-secondary">
              Consorcio novo: parcela 1 e capital ja pago 0. Se ele ja estiver em andamento, informe a parcela atual e quanto ja foi pago antes de cadastrar no GranaBase.
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Nome do consórcio" required>
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex: Carta Imóvel"
                />
              </FormField>

              <FormField label="Titular" required>
                <Input
                  value={holderName}
                  onChange={(event) => setHolderName(event.target.value)}
                  placeholder="Nome do titular"
                />
              </FormField>
            </div>

            <FormField label="Administradora">
              <Input
                value={administrator}
                onChange={(event) => setAdministrator(event.target.value)}
                placeholder="Ex: Porto Seguro, Rodobens..."
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Valor da carta" required>
                <CurrencyInput
                  value={creditAmount}
                  onChange={setCreditAmount}
                />
              </FormField>

              <FormField label="Valor atual da parcela" required>
                <CurrencyInput
                  value={installmentAmount}
                  onChange={setInstallmentAmount}
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Quantidade total de parcelas" required>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={totalInstallments}
                  onChange={(event) => setTotalInstallments(event.target.value)}
                  placeholder="Ex: 236"
                />
              </FormField>

              <FormField
                label="Parcela atual"
                required
                hint="Se o consorcio acabou de iniciar, use 1."
              >
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={currentInstallmentNumber}
                  onChange={(event) =>
                    setCurrentInstallmentNumber(event.target.value)
                  }
                  placeholder="Ex: 80"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                label="Vencimento da parcela atual"
                required
                hint="Informe o vencimento da parcela que esta em aberto agora."
              >
                <Input
                  type="date"
                  value={currentDueDate}
                  onChange={(event) => setCurrentDueDate(event.target.value)}
                />
              </FormField>

              <FormField
                label="Dia contratual do vencimento"
                hint="Opcional. Ex: 31. Util para contratos que vencem no fim do mes."
              >
                <Input
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  value={dueDay}
                  onChange={(event) => setDueDay(event.target.value)}
                  placeholder="Ex: 10"
                />
              </FormField>
            </div>

            <FormField
              label="Capital ja pago antes do GranaBase"
              hint="Use 0 em consorcio novo. Esse valor entra no progresso, mas nao cria gastos retroativos."
            >
              <CurrencyInput
                value={initialPaidAmount}
                onChange={setInitialPaidAmount}
              />
            </FormField>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Taxa de administração (%)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={administrationFee}
                  onChange={(event) => setAdministrationFee(event.target.value)}
                  placeholder="Ex: 18"
                />
              </FormField>

              <FormField label="Fundo de reserva (%)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={reserveFund}
                  onChange={(event) => setReserveFund(event.target.value)}
                  placeholder="Ex: 2"
                />
              </FormField>
            </div>

            <FormField label="Observações">
              <Textarea
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Informações opcionais..."
              />
            </FormField>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setFormOpen(false)}
              >
                Cancelar
              </Button>

              <Button type="submit" loading={creating}>
                Cadastrar consórcio
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
