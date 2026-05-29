"use client";

import { X, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import { FILTER_COLORS } from "@/lib/filter-engine";
import type { UserFilter } from "@/lib/filter-engine";

interface FilterChipProps {
  filter: UserFilter;
  isActive?: boolean;
  onToggle?: () => void;
  onRemove?: () => void;
  onPin?: () => void;
  compact?: boolean;
}

export function FilterChip({
  filter,
  isActive,
  onToggle,
  onRemove,
  onPin,
  compact,
}: FilterChipProps) {
  const colorConfig = FILTER_COLORS.find((c) => c.key === filter.color) ?? FILTER_COLORS[0];

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 pl-2.5 rounded-full border text-xs font-semibold transition-all duration-150 select-none",
        isActive
          ? cn(colorConfig.bg, colorConfig.text, colorConfig.border, "shadow-sm")
          : "bg-border/25 text-text-secondary border-border/40 hover:border-border/70",
        compact ? "pr-1.5 py-1" : "pr-2 py-1.5"
      )}
    >
      {/* Icon */}
      <span className="text-sm leading-none">{filter.icon}</span>

      {/* Name — clickable to toggle */}
      <button
        onClick={onToggle}
        className="flex-1 text-left leading-none"
      >
        {filter.name}
      </button>

      {/* Pin (only when not compact) */}
      {!compact && onPin && (
        <button
          onClick={onPin}
          className={cn(
            "rounded-full p-0.5 transition-colors",
            filter.isPinned ? colorConfig.text : "text-text-muted hover:text-text-secondary"
          )}
          aria-label={filter.isPinned ? "Desafixar" : "Fixar"}
        >
          <Pin className="h-3 w-3" />
        </button>
      )}

      {/* Remove */}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded-full p-0.5 text-text-muted hover:text-text-primary transition-colors"
          aria-label="Remover funil"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Quick filter pill (no edit/remove, just toggle) ───────────────────────────

interface QuickFilterProps {
  label: string;
  icon?: string;
  isActive: boolean;
  color?: string;
  onClick: () => void;
}

export function QuickFilter({ label, icon, isActive, color = "accent", onClick }: QuickFilterProps) {
  const colorConfig = FILTER_COLORS.find((c) => c.key === color) ?? FILTER_COLORS[0];
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all duration-150",
        isActive
          ? cn(colorConfig.bg, colorConfig.text, colorConfig.border)
          : "bg-border/20 text-text-secondary border-border/30 hover:border-border/60"
      )}
    >
      {icon && <span className="text-sm leading-none">{icon}</span>}
      {label}
    </button>
  );
}
