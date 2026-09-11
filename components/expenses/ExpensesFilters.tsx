"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  MonthFilter,
  type MonthOption,
} from "@/components/shared/MonthFilter";

import { SearchFilterBar } from "@/components/shared/SearchFilterBar";

const SOURCE_OPTIONS = [
  { value: "all", label: "Todos os tipos" },
  { value: "manual", label: "Gastos avulsos" },
  { value: "bill", label: "Contas fixas" },
  { value: "installment", label: "Parcelamentos" },
  { value: "consortium", label: "Consórcios" },
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
  return (
    <SearchFilterBar
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Buscar despesa..."
      activeFilterCount={activeFilterCount}
      onClearFilters={onClearFilters}
    >
      <MonthFilter
        months={monthOptions}
        value={monthFilter}
        onChange={setMonthFilter}
        currentMonth={currentMonth}
        className="w-full"
      />

      <Select
        value={statusFilter}
        onValueChange={setStatusFilter}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Status" />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="all">
            Todos os status
          </SelectItem>
          <SelectItem value="paid">
            Pagos
          </SelectItem>
          <SelectItem value="pending">
            Pendentes
          </SelectItem>
          <SelectItem value="overdue">
            Atrasados
          </SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={categoryFilter}
        onValueChange={setCategoryFilter}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>

        <SelectContent
          pinnedTop={
            <SelectItem value="all">
              Todas as categorias
            </SelectItem>
          }
        >
          {filterCategories.map((category) => (
            <SelectItem
              key={category}
              value={category}
            >
              {category}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={paymentMethodFilter}
        onValueChange={setPaymentMethodFilter}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Forma de pagamento" />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value="all">
            Todas as formas
          </SelectItem>

          {filterPaymentMethods.map((method) => (
            <SelectItem
              key={method}
              value={method}
            >
              {method}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={sourceFilter}
        onValueChange={setSourceFilter}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Tipo" />
        </SelectTrigger>

        <SelectContent>
          {SOURCE_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filterDueDays.length > 0 && (
        <Select
          value={dueDayFilter}
          onValueChange={setDueDayFilter}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Vencimento do cartão" />
          </SelectTrigger>

          <SelectContent>
            <SelectItem value="all">
              Todos os vencimentos
            </SelectItem>

            {filterDueDays.map((day) => (
              <SelectItem
                key={day}
                value={String(day)}
              >
                Vence dia {day}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SearchFilterBar>
  );
}