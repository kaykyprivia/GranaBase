"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
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
import { FormField } from "@/components/shared/FormField";

interface PeriodFilterOption<T extends string> {
  value: T;
  label: string;
}

interface PeriodFilterButtonProps<T extends string> {
  value: T;
  options: ReadonlyArray<PeriodFilterOption<T>>;
  defaultValue: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}

export function PeriodFilterButton<T extends string>({
  value,
  options,
  defaultValue,
  onChange,
  disabled = false,
}: PeriodFilterButtonProps<T>) {
  const [open, setOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState(value);
  const hasActiveFilter = value !== defaultValue;

  useEffect(() => {
    if (open) setPendingValue(value);
  }, [open, value]);

  return (
    <>
      <div className="relative">
        <Button
          type="button"
          variant="outline"
          className="min-h-10 gap-2"
          disabled={disabled}
          aria-label="Filtrar por período"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filtro
        </Button>

        {hasActiveFilter && (
          <Badge className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none">
            1
          </Badge>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filtro</DialogTitle>
          </DialogHeader>

          <FormField label="Período">
            <Select
              value={pendingValue}
              onValueChange={(nextValue) => setPendingValue(nextValue as T)}
            >
              <SelectTrigger className="w-full" aria-label="Período">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onChange(defaultValue);
                setOpen(false);
              }}
            >
              Limpar filtros
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
