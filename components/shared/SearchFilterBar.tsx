"use client";

import {
  useState,
  type ReactNode,
} from "react";

import {
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Input } from "@/components/ui/input";

interface SearchFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  children: ReactNode;
}

export function SearchFilterBar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar...",
  activeFilterCount = 0,
  onClearFilters,
  children,
}: SearchFilterBarProps) {
  const [filtersOpen, setFiltersOpen] =
    useState(false);

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <Input
          value={search}
          onChange={(event) =>
            onSearchChange(event.target.value)
          }
          placeholder={searchPlaceholder}
          leftIcon={
            <Search className="h-4 w-4" />
          }
          className="min-w-0 flex-1"
        />

        <div className="relative shrink-0">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() =>
              setFiltersOpen(true)
            }
            aria-label="Abrir filtro"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filtro</span>
          </Button>

          {activeFilterCount > 0 && (
            <Badge
              className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {activeFilterCount}
            </Badge>
          )}
        </div>
      </div>

      <Dialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Filtro</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {children}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {onClearFilters && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onClearFilters();
                  setFiltersOpen(false);
                }}
              >
                Limpar filtros
              </Button>
            )}

            <Button
              type="button"
              onClick={() =>
                setFiltersOpen(false)
              }
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
