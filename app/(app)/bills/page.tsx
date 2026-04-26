"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Plus, Check, Pencil, Trash2, AlertCircle, RefreshCw, Calendar } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceMutation } from "@/lib/supabase/casts";
import { cn, formatCurrency, formatDate, getDaysUntilDue, isOverdue } from "@/lib/utils";
import { billSchema, type BillFormData } from "@/lib/validations";
import type { Bill } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCard } from "@/components/shared/StatCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { FormField } from "@/components/shared/FormField";

const BILL_CATEGORIES = ["Aluguel", "Energia", "Água", "Internet", "Telefone", "Cartão", "Empréstimo", "Seguro", "Mensalidade", "Outro"];
type StatusFilter = "all" | "pending" | "overdue" | "paid";

function getEffectiveStatus(bill: Bill): Bill["status"] {
  if (bill.status === "pending" && isOverdue(bill.due_date)) return "overdue";
  return bill.status;
}

const EMPTY_FORM: BillFormData = { name: "", amount: 0, due_date: "", category: "", is_recurring: false, notes: "" };

export default function BillsPage() {
  const supabase = createClient();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [form, setForm] = useState<BillFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof BillFormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    const { data, error } = await supabase.from("bills").select("*").eq("user_id", user.id).order("due_date");
    if (error) { toast.error("Erro ao carregar contas"); return; }
    setBills(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchBills(); }, [fetchBills]);

  const openCreate = () => { setEditingBill(null); setForm(EMPTY_FORM); setFormErrors({}); setModalOpen(true); };
  const openEdit = (bill: Bill) => {
    setEditingBill(bill);
    setForm({ name: bill.name, amount: bill.amount, due_date: bill.due_date, category: bill.category, is_recurring: bill.is_recurring, notes: bill.notes ?? "" });
    setFormErrors({});
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    const result = billSchema.safeParse(form);
    if (!result.success) {
      const errs: Partial<Record<keyof BillFormData, string>> = {};
      result.error.errors.forEach(err => { errs[err.path[0] as keyof BillFormData] = err.message; });
      setFormErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const payload = { name: result.data.name, amount: result.data.amount, due_date: result.data.due_date, category: result.data.category, is_recurring: result.data.is_recurring, notes: result.data.notes || null };
      if (editingBill) {
        const { error } = await supabase.from("bills").update(coerceMutation(payload)).eq("id", editingBill.id);
        if (error) throw error;
        toast.success("Conta atualizada");
      } else {
        const { error } = await supabase.from("bills").insert(coerceMutation({ ...payload, user_id: userId, status: "pending" as const }));
        if (error) throw error;
        toast.success("Conta criada");
      }
      setModalOpen(false);
      await fetchBills();
    } catch { toast.error("Erro ao salvar conta"); }
    finally { setSaving(false); }
  };

  const handleMarkPaid = async (id: string) => {
    setMarkingPaidId(id);
    try {
      const { error } = await supabase.from("bills").update(coerceMutation({ status: "paid" as const, paid_at: new Date().toISOString() })).eq("id", id);
      if (error) throw error;
      toast.success("Conta marcada como paga!");
      await fetchBills();
    } catch { toast.error("Erro ao marcar conta"); }
    finally { setMarkingPaidId(null); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("bills").delete().eq("id", deleteId);
      if (error) throw error;
      toast.success("Conta excluída");
      setBills(prev => prev.filter(b => b.id !== deleteId));
    } catch { toast.error("Erro ao excluir"); }
    finally { setDeleting(false); setDeleteId(null); }
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const pendingTotal = bills.filter(b => getEffectiveStatus(b) === "pending").reduce((s, b) => s + b.amount, 0);
  const overdueTotal = bills.filter(b => getEffectiveStatus(b) === "overdue").reduce((s, b) => s + b.amount, 0);
  const paidThisMonth = bills.filter(b => {
    if (b.status !== "paid") return false;
    const d = new Date(b.due_date + "T00:00:00");
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  }).reduce((s, b) => s + b.amount, 0);
  const uniqueCategories = [...new Set(bills.map(b => b.category))].sort();
  const filtered = bills.filter(b => {
    const effective = getEffectiveStatus(b);
    return (statusFilter === "all" || effective === statusFilter) && (categoryFilter === "all" || b.category === categoryFilter);
  });

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-warning/20">
            <FileText className="h-5 w-5 text-warning" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Contas</h1>
            <p className="text-sm text-text-secondary">Gerencie suas contas a pagar</p>
          </div>
        </div>
        <Button onClick={openCreate} size="sm" variant="warning" className="gap-1.5 shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nova Conta</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard title="Pendentes" value={formatCurrency(pendingTotal)} icon={FileText} variant="warning" loading={loading} />
        <StatCard title="Atrasadas" value={formatCurrency(overdueTotal)} icon={AlertCircle} variant="expense" loading={loading} />
        <StatCard title="Pagas este mês" value={formatCurrency(paidThisMonth)} icon={Check} variant="profit" loading={loading} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <Tabs value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="pending">Pendentes</TabsTrigger>
            <TabsTrigger value="overdue">Atrasadas</TabsTrigger>
            <TabsTrigger value="paid">Pagas</TabsTrigger>
          </TabsList>
        </Tabs>
        {uniqueCategories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {uniqueCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="Nenhuma conta encontrada"
          description={statusFilter !== "all" ? "Tente outro filtro." : "Adicione sua primeira conta."}
          actionLabel={statusFilter === "all" ? "+ Nova Conta" : undefined}
          onAction={statusFilter === "all" ? openCreate : undefined}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(bill => {
            const effective = getEffectiveStatus(bill);
            const daysUntil = getDaysUntilDue(bill.due_date);
            return (
              <Card key={bill.id} className={cn("transition-all duration-200 hover:border-accent/40", effective === "overdue" && "border-expense/30")}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="font-semibold text-text-primary">{bill.name}</span>
                        <Badge variant="secondary" className="text-xs">{bill.category}</Badge>
                        {bill.is_recurring && (
                          <span title="Recorrente">
                            <RefreshCw className="h-3.5 w-3.5 text-accent" />
                          </span>
                        )}
                      </div>
                      <p className="text-xl font-bold text-text-primary mb-2">{formatCurrency(bill.amount)}</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5 text-text-secondary text-sm">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>{formatDate(bill.due_date)}</span>
                        </div>
                        <Badge variant={effective}>{effective === "pending" ? "Pendente" : effective === "overdue" ? "Atrasada" : "Paga"}</Badge>
                      </div>
                      {effective === "overdue" && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="h-3.5 w-3.5 text-expense" />
                          <span className="text-xs text-expense font-medium">{Math.abs(daysUntil)} {Math.abs(daysUntil) === 1 ? "dia" : "dias"} de atraso</span>
                        </div>
                      )}
                      {effective === "pending" && daysUntil <= 3 && daysUntil >= 0 && (
                        <p className="text-xs text-warning mt-1">
                          {daysUntil === 0 ? "Vence hoje!" : `Vence em ${daysUntil} ${daysUntil === 1 ? "dia" : "dias"}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(effective === "pending" || effective === "overdue") && (
                        <Button variant="ghost" size="icon-sm" onClick={() => handleMarkPaid(bill.id)}
                          disabled={markingPaidId === bill.id}
                          className="text-profit hover:bg-profit/10 hover:text-profit" title="Marcar como paga">
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-sm" onClick={() => openEdit(bill)}
                        className="text-text-secondary hover:text-text-primary">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setDeleteId(bill.id)}
                        className="text-text-secondary hover:text-expense hover:bg-expense/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={open => !open && setModalOpen(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingBill ? "Editar Conta" : "Nova Conta"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <FormField label="Nome da conta" error={formErrors.name} required>
              <Input placeholder="Ex: Aluguel de agosto" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} error={formErrors.name} />
            </FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Valor" error={formErrors.amount} required>
                <CurrencyInput value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} error={formErrors.amount} />
              </FormField>
              <FormField label="Vencimento" error={formErrors.due_date} required>
                <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} error={formErrors.due_date} />
              </FormField>
            </div>
            <FormField label="Categoria" error={formErrors.category} required>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger error={formErrors.category}><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{BILL_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setForm(f => ({ ...f, is_recurring: !f.is_recurring }))}
                className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-all shrink-0",
                  form.is_recurring ? "bg-accent border-accent" : "border-border")}>
                {form.is_recurring && <Check className="h-3 w-3 text-background" />}
              </div>
              <span className="text-sm font-medium text-text-primary">Conta recorrente mensal</span>
            </label>
            <FormField label="Observações">
              <Textarea placeholder="Notas opcionais..." value={form.notes ?? ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </FormField>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
              <Button type="submit" loading={saving}>{editingBill ? "Salvar" : "Criar conta"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}
        title="Excluir conta" description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir" onConfirm={handleDelete} loading={deleting} />
    </div>
  );
}
