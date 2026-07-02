"use client";

import { useRef, useState } from "react";
import { Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { coerceData, coerceMutation } from "@/lib/supabase/casts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { detectStatementFormat, parseCsv, parseOfx, type ParsedTransaction } from "@/lib/statementParser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";

interface ImportStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "expense" | "income";
  userId: string;
  onImported: () => void;
}

interface PreviewItem {
  id: string;
  transaction: ParsedTransaction;
  selected: boolean;
  possibleDuplicate: boolean;
}

interface ExistingEntryKey {
  date: string;
  amount: number;
}

export function ImportStatementDialog({ open, onOpenChange, kind, userId, onImported }: ImportStatementDialogProps) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [importing, setImporting] = useState(false);

  const dateField = kind === "expense" ? "spent_at" : "received_at";
  const tableName = kind === "expense" ? "expense_entries" : "income_entries";

  const resetState = () => {
    setItems([]);
    setFileName(null);
    setLoadingFile(false);
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) resetState();
    onOpenChange(nextOpen);
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoadingFile(true);
    setItems([]);
    setFileName(file.name);

    try {
      const text = await file.text();

      if (!text || text.trim() === "") {
        toast.error("O arquivo está vazio.");
        setLoadingFile(false);
        return;
      }

      const format = detectStatementFormat(file.name, text);
      let transactions: ParsedTransaction[] = [];

      if (format === "ofx") {
        transactions = parseOfx(text);
      } else if (format === "csv") {
        transactions = parseCsv(text);
      } else {
        toast.error("Não foi possível identificar o formato do arquivo (use .ofx, .qfx ou .csv).");
        setLoadingFile(false);
        return;
      }

      if (transactions.length === 0) {
        toast.error("Nenhuma transação reconhecida nesse arquivo. Verifique o formato e as colunas.");
        setLoadingFile(false);
        return;
      }

      let existingKeys: ExistingEntryKey[] = [];
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select(dateField === "spent_at" ? "spent_at, amount" : "received_at, amount")
          .eq("user_id", userId);
        if (!error) {
          const rows = coerceData<Array<Record<string, unknown>>>(data ?? []);
          existingKeys = rows.map((row) => ({
            date: String(row[dateField] ?? "").slice(0, 10),
            amount: Math.round(Number(row.amount ?? 0) * 100) / 100,
          }));
        }
      } catch {
        existingKeys = [];
      }

      const preview: PreviewItem[] = transactions.map((transaction, index) => {
        const roundedAmount = Math.round(transaction.amount * 100) / 100;
        const possibleDuplicate = existingKeys.some(
          (existing) => existing.date === transaction.date && existing.amount === roundedAmount
        );
        return {
          id: `${index}-${transaction.date}-${transaction.amount}`,
          transaction,
          selected: true,
          possibleDuplicate,
        };
      });

      setItems(preview);
    } catch {
      toast.error("Erro ao ler o arquivo. Verifique se ele não está corrompido.");
    } finally {
      setLoadingFile(false);
    }
  };

  const toggleItem = (id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item)));
  };

  const selectedItems = items.filter((item) => item.selected);
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.transaction.amount, 0);

  const handleImport = async () => {
    if (selectedItems.length === 0) return;
    setImporting(true);

    try {
      const rows = selectedItems.map((item) =>
        kind === "expense"
          ? {
              user_id: userId,
              description: item.transaction.description,
              amount: item.transaction.amount,
              category: "Outro",
              spent_at: item.transaction.date,
              payment_method: "Outro",
              notes: null,
            }
          : {
              user_id: userId,
              description: item.transaction.description,
              amount: item.transaction.amount,
              category: "Outro",
              received_at: item.transaction.date,
              payment_method: "Outro",
              notes: null,
            }
      );

      const { error } = await supabase.from(tableName).insert(coerceMutation(rows));
      if (error) throw error;

      toast.success(`${rows.length} transaç${rows.length === 1 ? "ão" : "ões"} importada${rows.length === 1 ? "" : "s"}`);
      onImported();
      handleClose(false);
    } catch {
      toast.error("Erro ao importar transações. Tente novamente.");
    } finally {
      setImporting(false);
    }
  };

  const accentClass = kind === "expense" ? "text-expense" : "text-profit";
  const accentButtonVariant = kind === "expense" ? "destructive" : "profit";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar extrato {kind === "expense" ? "(Gastos)" : "(Entradas)"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-text-secondary transition-colors hover:border-border/80 hover:bg-border/30">
            <Upload className="h-4 w-4" />
            <span>{fileName ?? "Selecione um arquivo .ofx, .qfx ou .csv"}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ofx,.qfx,.csv"
              className="hidden"
              onChange={handleFileSelected}
            />
          </label>

          {loadingFile && <p className="text-center text-sm text-text-secondary">Lendo arquivo...</p>}

          {!loadingFile && items.length > 0 && (
            <>
              <div className="flex items-center justify-between rounded-lg bg-surface/60 px-3 py-2 text-sm">
                <span className="text-text-secondary">
                  {selectedItems.length} transaç{selectedItems.length === 1 ? "ão" : "ões"} selecionada{selectedItems.length === 1 ? "" : "s"}
                </span>
                <span className={`font-semibold tabular-nums ${accentClass}`}>{formatCurrency(selectedTotal)}</span>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-xl border border-border/50">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 border-b border-border/20 px-3 py-2.5 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleItem(item.id)}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="break-words text-sm font-medium text-text-primary">{item.transaction.description}</p>
                        {item.possibleDuplicate && (
                          <Badge variant="warning" className="gap-1 text-[10px]">
                            <AlertTriangle className="h-3 w-3" />
                            possível duplicata
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-text-secondary">{formatDate(item.transaction.date)}</p>
                    </div>
                    <p className={`shrink-0 text-sm font-semibold tabular-nums ${accentClass}`}>
                      {formatCurrency(item.transaction.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}

          {!loadingFile && fileName && items.length === 0 && (
            <EmptyState
              icon={Upload}
              title="Nenhuma transação encontrada"
              description="Não conseguimos reconhecer transações nesse arquivo."
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant={accentButtonVariant}
            loading={importing}
            disabled={selectedItems.length === 0}
            onClick={handleImport}
          >
            Importar selecionadas
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
