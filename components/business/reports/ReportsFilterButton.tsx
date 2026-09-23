"use client";

import { useEffect, useState } from "react";
import { Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/FormField";

export type ReportsFilters = {
  period: string;
  customStart: string;
  customEnd: string;
  salesChannel: string;
  paymentStatus: string;
};

interface ReportsFilterButtonProps {
  value: ReportsFilters;
  onChange: (value: ReportsFilters) => void;
  periodOptions: ReadonlyArray<{ value: string; label: string }>;
  channelOptions: ReadonlyArray<{ value: string; label: string }>;
  paymentStatusOptions: ReadonlyArray<{ value: string; label: string }>;
  defaultValue: ReportsFilters;
  disabled?: boolean;
}

export function ReportsFilterButton({
  value,
  onChange,
  periodOptions,
  channelOptions,
  paymentStatusOptions,
  defaultValue,
  disabled = false,
}: ReportsFilterButtonProps) {
  const [open, setOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<ReportsFilters>(value);

  useEffect(() => {
    if (open) setPendingValue(value);
  }, [open, value]);

  // Conta quantos filtros estao fora do padrao
  const activeCount = [
    value.period !== defaultValue.period,
    value.salesChannel !== defaultValue.salesChannel,
    value.paymentStatus !== defaultValue.paymentStatus,
    value.period === "custom" &&
      (value.customStart !== defaultValue.customStart ||
        value.customEnd !== defaultValue.customEnd),
  ].filter(Boolean).length;

  return (
    <>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="min-h-10 gap-2"
          disabled={disabled}
          aria-label="Filtrar relatorios"
          onClick={() => setOpen(true)}
        >
          <Filter className="h-4 w-4" />
          Filtro
        </Button>

        {activeCount > 0 && (
          <Badge className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none">
            {activeCount}
          </Badge>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <FormField label="Periodo">
              <Select
                value={pendingValue.period}
                onValueChange={(next) =>
                  setPendingValue({ ...pendingValue, period: next })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {pendingValue.period === "custom" && (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Data inicial" required>
                  <Input
                    type="date"
                    value={pendingValue.customStart}
                    onChange={(e) =>
                      setPendingValue({
                        ...pendingValue,
                        customStart: e.target.value,
                      })
                    }
                  />
                </FormField>
                <FormField label="Data final" required>
                  <Input
                    type="date"
                    value={pendingValue.customEnd}
                    onChange={(e) =>
                      setPendingValue({
                        ...pendingValue,
                        customEnd: e.target.value,
                      })
                    }
                  />
                </FormField>
              </div>
            )}

            <FormField label="Canal de venda">
              <Select
                value={pendingValue.salesChannel}
                onValueChange={(next) =>
                  setPendingValue({ ...pendingValue, salesChannel: next })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {channelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Status de pagamento">
              <Select
                value={pendingValue.paymentStatus}
                onValueChange={(next) =>
                  setPendingValue({ ...pendingValue, paymentStatus: next })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {paymentStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingValue(defaultValue);
              }}
            >
              Limpar
            </Button>
            <Button
              type="button"
              onClick={() => {
                onChange(pendingValue);
                setOpen(false);
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
