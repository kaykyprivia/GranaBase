"use client";

import { Search, X, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterChip } from "@/components/filters/FilterChip";
import type { UseFiltersReturn } from "@/hooks/useFilters";

interface SmartSearchBarProps {
  filtersHook: UseFiltersReturn;
  placeholder?: string;
  onOpenBuilder?: () => void;
  className?: string;
}

export function SmartSearchBar({
  filtersHook,
  placeholder = "Buscar… ex: água, delivery, Netflix",
  onOpenBuilder,
  className,
}: SmartSearchBarProps) {
  const { searchQuery, setSearchQuery, activeFilter, toggleFilter, isFiltering } = filtersHook;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "w-full pl-9 pr-10 py-2.5 rounded-xl border bg-surface text-sm text-text-primary",
            "placeholder:text-text-muted transition-all duration-150",
            "focus:outline-none focus:ring-1 focus:ring-accent/50",
            isFiltering ? "border-accent/40 bg-accent/5" : "border-border/50"
          )}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="p-1 rounded-full text-text-muted hover:text-text-primary transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpenBuilder && (
            <button
              onClick={onOpenBuilder}
              className={cn(
                "p-1 rounded-full transition-colors",
                filtersHook.filters.length > 0
                  ? "text-accent hover:text-accent/80"
                  : "text-text-muted hover:text-text-primary"
              )}
              aria-label="Gerenciar funis"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Active saved filter chips */}
      {filtersHook.filters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {filtersHook.filters.slice(0, 6).map((filter) => (
            <FilterChip
              key={filter.id}
              filter={filter}
              isActive={filter.id === filtersHook.activeId}
              onToggle={() => toggleFilter(filter.id)}
              compact
            />
          ))}
          {filtersHook.filters.length > 6 && (
            <button
              onClick={onOpenBuilder}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              +{filtersHook.filters.length - 6} funis
            </button>
          )}
        </div>
      )}

      {/* Active filter indicator */}
      {isFiltering && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-accent font-medium">
            {activeFilter
              ? `Funil ativo: ${activeFilter.name}`
              : searchQuery.trim()
              ? `Buscando: "${searchQuery}"`
              : "Filtrando"}
          </span>
          <button
            onClick={filtersHook.clearActive}
            className="text-text-muted hover:text-text-primary transition-colors flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Limpar
          </button>
        </div>
      )}
    </div>
  );
}
