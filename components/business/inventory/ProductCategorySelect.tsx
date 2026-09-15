"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductCategoryOption } from "@/lib/business-inventory";

const NO_CATEGORY_VALUE = "__none__";
const NEW_CATEGORY_VALUE = "__new__";

type ProductCategorySelectProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  categories: ProductCategoryOption[];
  categoryId?: string | null;
  newCategoryName?: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: { categoryId: string | null; newCategoryName?: string }) => void;
};

export function ProductCategorySelect({
  id,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  categories,
  categoryId,
  newCategoryName,
  disabled,
  error,
  onChange,
}: ProductCategorySelectProps) {
  const creating = newCategoryName !== undefined;
  const value = creating ? NEW_CATEGORY_VALUE : categoryId ?? NO_CATEGORY_VALUE;

  return (
    <div className="space-y-2">
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(nextValue) => {
          if (nextValue === NO_CATEGORY_VALUE) {
            onChange({ categoryId: null });
            return;
          }

          if (nextValue === NEW_CATEGORY_VALUE) {
            onChange({ categoryId: null, newCategoryName: "" });
            return;
          }

          onChange({ categoryId: nextValue });
        }}
      >
        <SelectTrigger
          id={id}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          error={error}
          className="min-h-11"
        >
          <SelectValue placeholder="Sem categoria" />
        </SelectTrigger>

        <SelectContent>
          <SelectItem value={NO_CATEGORY_VALUE}>Sem categoria</SelectItem>

          {categories.length > 0 && <SelectSeparator />}

          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}

          <SelectSeparator />
          <SelectItem value={NEW_CATEGORY_VALUE}>Nova categoria</SelectItem>
        </SelectContent>
      </Select>

      {creating && (
        <Input
          value={newCategoryName}
          disabled={disabled}
          error={error}
          placeholder="Ex: Eletronicos"
          className="min-h-11"
          onChange={(event) =>
            onChange({
              categoryId: null,
              newCategoryName: event.target.value,
            })
          }
        />
      )}
    </div>
  );
}
