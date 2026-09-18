"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";

interface CashFlowPdfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStartDate: string;
  defaultEndDate: string;
  onDownload: (range: { startDate: string; endDate: string }) => Promise<void>;
}

export function CashFlowPdfDialog({
  open,
  onOpenChange,
  defaultStartDate,
  defaultEndDate,
  onDownload,
}: CashFlowPdfDialogProps) {
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStartDate(defaultStartDate);
    setEndDate(defaultEndDate);
    setError("");
  }, [defaultEndDate, defaultStartDate, open]);

  const handleDownload = async () => {
    if (!startDate || !endDate) {
      setError("Informe as datas inicial e final.");
      return;
    }

    if (endDate < startDate) {
      setError("A data final deve ser igual ou posterior à data inicial.");
      return;
    }

    setError("");
    setDownloading(true);

    try {
      await onDownload({ startDate, endDate });
      onOpenChange(false);
    } catch {
      // The page reports the export error with its own context.
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !downloading && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extrato do fluxo de caixa</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Data inicial" required>
            <Input
              type="date"
              value={startDate}
              max={endDate || undefined}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FormField>

          <FormField label="Data final" required>
            <Input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </FormField>
        </div>

        {error && (
          <p className="rounded-lg border border-expense/30 bg-expense/10 px-3 py-2 text-xs text-expense">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={downloading}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="button" loading={downloading} onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Baixar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
