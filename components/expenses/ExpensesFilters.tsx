"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MonthFilter, type MonthOption } from "@/components/shared/MonthFilter";
import { cn } from "@/lib/utils";

const SOURCE_OPTIONS = [
  { value: "all", label: "Todos os tipos" },
  { value: "manual", label: "Gastos avulsos" },
  { value: "bill", label: "Contas fixas" },
  { value: "installment", label: "Parcelamentos" },
];

export interface ExpensesFiltersProps {
  monthFilter: string;
  setMonthFilter: (value: string) => void;
  monthOptions: MonthOption[];
  currentMonth: string;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  filterCategories: string[];
  paymentMethodFilter: string;
  setPaymentMethodFilter: (value: string) => void;
  filterPaymentMethods: string[];
  sourceFilter: string;
  setSourceFilter: (value: string) => void;
  dueDayFilter: string;
  setDueDayFilter: (value: string) => void;
  filterDueDays: number[];
  search: string;
  setSearch: (value: string) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
}

export function ExpensesFilters({
  monthFilter,
  setMonthFilter,
  monthOptions,
  currentMonth,
  statusFilter,
  setStatusFilter,
  categoryFilter,
  setCategoryFilter,
  filterCategories,
  paymentMethodFilter,
  setPaymentMethodFilter,
  filterPaymentMethods,
  sourceFilter,
  setSourceFilter,
  dueDayFilter,
  setDueDayFilter,
  filterDueDays,
  search,
  setSearch,
  activeFilterCount,
  onClearFilters,
}: ExpensesFiltersProps) {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const selects = (
    <>
      <MonthFilter
        months={monthOptions}
        value={monthFilter}
        onChange={setMonthFilter}
        currentMonth={currentMonth}
        className="sm:w-56"
      />
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="paid">Pagos</SelectItem>
          <SelectItem value="pending">Pendentes</SelectItem>
          <SelectItem value="overdue">Atrasados</SelectItem>
        </SelectContent>
      </Select>
      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
        <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Categoria" /></SelectTrigger>
        <SelectContent pinnedTop={<SelectItem value="all">Todas as categorias</SelectItem>}>
          {filterCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={paymentMethodFilter} onValueChange={setPaymentMethodFilter}>
        <SelectTrigger className="w-full sm:w-52"><SelectValue placeholder="Forma de pagamento" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as formas</SelectItem>
          {filterPaymentMethods.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={sourceFilter} onValueChange={setSourceFilter}>
        <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          {SOURCE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {filterDueDays.length > 0 && (
        <Select value={dueDayFilter} onValueChange={setDueDayFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Vencimento do cartão" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os vencimentos</SelectItem>
            {filterDueDays.map(day => (
              <SelectItem key={day} value={String(day)}>Vence dia {day}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-3 mb-5">
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="expense" className="font-normal">
            {activeFilterCount} filtro{activeFilterCount > 1 ? "s" : ""} ativo{activeFilterCount > 1 ? "s" : ""}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClearFilters} className="h-6 px-2 text-xs">
            <X className="h-3 w-3" />
            Limpar
          </Button>
        </div>
      )}

      {/* Desktop layout */}
      <div className="hidden sm:flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          {selects}
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />} className="flex-1" />
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex sm:hidden items-center gap-2">
        <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />} className="flex-1" />
        <div className="relative">
          <Button variant="outline" onClick={() => setMobileFiltersOpen(true)} aria-label="Filtros">
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filtros</span>
          </Button>
          {activeFilterCount > 0 && (
            <Badge
              variant="expense"
              className="absolute -right-1.5 -top-1.5 h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {activeFilterCount}
            </Badge>
          )}
        </div>
      </div>

      <Dialog open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <DialogContent className={cn("sm:hidden")}>
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {selects}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                onClearFilters();
                setMobileFiltersOpen(false);
              }}
            >
              Limpar filtros
            </Button>
            <Button onClick={() => setMobileFiltersOpen(false)}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
