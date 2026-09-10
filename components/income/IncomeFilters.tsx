"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { MonthFilter, type MonthOption } from "@/components/shared/MonthFilter";

interface IncomeFiltersProps {
  monthFilter: string;
  setMonthFilter: (value: string) => void;
  monthOptions: MonthOption[];
  currentMonth: string;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  categories: readonly string[];
  search: string;
  setSearch: (value: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export function IncomeFilters({
  monthFilter,
  setMonthFilter,
  monthOptions,
  currentMonth,
  categoryFilter,
  setCategoryFilter,
  categories,
  search,
  setSearch,
  activeFilterCount,
  onClearFilters,
}: IncomeFiltersProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="mb-5 flex flex-col gap-3">
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge className="font-normal">
            {activeFilterCount} filtro{activeFilterCount > 1 ? "s" : ""} ativo{activeFilterCount > 1 ? "s" : ""}
          </Badge>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-6 px-2 text-xs"
          >
            <X className="h-3 w-3" />
            Limpar
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
          className="flex-1"
        />

        <div className="relative">
          <Button
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filtros</span>
          </Button>

          {activeFilterCount > 0 && (
            <Badge
              className="absolute -right-1.5 -top-1.5 h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {activeFilterCount}
            </Badge>
          )}
        </div>
      </div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <MonthFilter
              months={monthOptions}
              value={monthFilter}
              onChange={setMonthFilter}
              currentMonth={currentMonth}
            />

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                onClearFilters();
                setFiltersOpen(false);
              }}
            >
              Limpar filtros
            </Button>

            <Button onClick={() => setFiltersOpen(false)}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
