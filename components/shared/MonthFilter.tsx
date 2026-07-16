"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface MonthOption {
  value: string;
  label: string;
}

export interface MonthFilterProps {
  /** Months in ascending chronological order (oldest first), excluding the "all" option. */
  months: MonthOption[];
  value: string;
  onChange: (value: string) => void;
  currentMonth?: string;
  allLabel?: string;
  placeholder?: string;
  className?: string;
}

export function MonthFilter({
  months,
  value,
  onChange,
  currentMonth,
  allLabel = "Todos os meses",
  placeholder = "Mês",
  className,
}: MonthFilterProps) {
  const selected = months.find((m) => m.value === value);
  const label = value === "all" ? allLabel : selected?.label ?? placeholder;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder}>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent pinnedTop={<SelectItem value="all">{allLabel}</SelectItem>}>
        {months.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            <span className="flex items-center gap-2">
              {m.label}
              {m.value === currentMonth && (
                <>
                  {" "}
                  <span className="rounded-full bg-border/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                    Atual
                  </span>
                </>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
