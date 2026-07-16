"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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

const WINDOW_SIZE = 5;
const ROW_HEIGHT = 36;

function MonthRow({ label, selected, tag, onClick }: { label: string; selected: boolean; tag?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ scrollSnapAlign: "start", height: ROW_HEIGHT }}
      className={cn(
        "flex w-full shrink-0 items-center gap-2 rounded-md px-2 text-sm transition-colors duration-150",
        "hover:bg-border/60",
        selected ? "text-accent" : "text-text-primary"
      )}
    >
      <Check className={cn("h-3.5 w-3.5 shrink-0", !selected && "opacity-0")} />
      <span className="flex-1 truncate text-left">{label}</span>
      {tag && (
        <span className="rounded-full bg-border/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
          {tag}
        </span>
      )}
    </button>
  );
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
  const [open, setOpen] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const updateEdges = () => {
    const el = listRef.current;
    if (!el) return;
    setAtTop(el.scrollTop <= 2);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const anchorValue = value !== "all" ? value : currentMonth;
    const idx = months.findIndex((m) => m.value === anchorValue);
    const target = idx === -1 ? 0 : idx - Math.floor(WINDOW_SIZE / 2);
    el.scrollTop = Math.max(0, target) * ROW_HEIGHT;
    updateEdges();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollByRows = (rows: number) => {
    listRef.current?.scrollBy({ top: rows * ROW_HEIGHT, behavior: "smooth" });
  };

  const selected = months.find((m) => m.value === value);
  const label = value === "all" ? allLabel : selected?.label ?? placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary",
            "focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent",
            "transition-all duration-200",
            className
          )}
        >
          <span className="line-clamp-1">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-56 p-1">
        <MonthRow
          label={allLabel}
          selected={value === "all"}
          onClick={() => {
            onChange("all");
            setOpen(false);
          }}
        />

        <div className="my-1 h-px bg-border" />

        <button
          type="button"
          aria-label="Meses anteriores"
          disabled={atTop}
          onClick={() => scrollByRows(-1)}
          className="flex w-full items-center justify-center rounded-md py-1 text-text-secondary transition-colors duration-150 hover:bg-border/60 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </button>

        <div
          ref={listRef}
          onScroll={updateEdges}
          className="flex flex-col touch-pan-y overflow-y-auto"
          style={{ maxHeight: ROW_HEIGHT * WINDOW_SIZE, scrollSnapType: "y mandatory" }}
        >
          {months.map((m) => (
            <MonthRow
              key={m.value}
              label={m.label}
              selected={value === m.value}
              tag={m.value === currentMonth ? "Atual" : undefined}
              onClick={() => {
                onChange(m.value);
                setOpen(false);
              }}
            />
          ))}
        </div>

        <button
          type="button"
          aria-label="Próximos meses"
          disabled={atBottom}
          onClick={() => scrollByRows(1)}
          className="flex w-full items-center justify-center rounded-md py-1 text-text-secondary transition-colors duration-150 hover:bg-border/60 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </PopoverContent>
    </Popover>
  );
}
