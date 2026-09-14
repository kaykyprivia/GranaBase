import { describe, expect, it } from "vitest";

import {
  filterBusinessExpenses,
  getBusinessExpenseDateRange,
  summarizeBusinessExpenses,
  validateBusinessExpenseDraft,
} from "./business-expenses";

import type { BusinessExpense } from "@/types/database";

function makeExpense(
  overrides: Partial<BusinessExpense> = {}
): BusinessExpense {
  return {
    id: "expense-1",
    user_id: "user-1",
    workspace_id: "workspace-1",
    description: "Despesa",
    category: "outras",
    amount: 100,
    spent_at: "2026-09-10",
    notes: null,
    created_at: "2026-09-10T12:00:00.000Z",
    updated_at: "2026-09-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("business expenses", () => {
  const today = new Date(2026, 8, 11, 12, 0, 0);

  it("calcula o intervalo do mes atual", () => {
    expect(
      getBusinessExpenseDateRange("month", today)
    ).toEqual({
      start: "2026-09-01",
      end: "2026-09-11",
    });
  });

  it("filtra despesas pelo periodo", () => {
    const expenses = [
      makeExpense({
        id: "1",
        spent_at: "2026-09-05",
      }),
      makeExpense({
        id: "2",
        spent_at: "2026-08-30",
      }),
    ];

    const result = filterBusinessExpenses(expenses, {
      search: "",
      category: "all",
      period: "month",
      today,
    });

    expect(result.map((expense) => expense.id)).toEqual([
      "1",
    ]);
  });

  it("filtra por categoria", () => {
    const expenses = [
      makeExpense({
        id: "1",
        category: "gasolina",
      }),
      makeExpense({
        id: "2",
        category: "taxas",
      }),
    ];

    const result = filterBusinessExpenses(expenses, {
      search: "",
      category: "taxas",
      period: "all",
      today,
    });

    expect(result.map((expense) => expense.id)).toEqual([
      "2",
    ]);
  });

  it("busca por descricao e observacao", () => {
    const expenses = [
      makeExpense({
        id: "1",
        description: "Combustível da moto",
      }),
      makeExpense({
        id: "2",
        description: "Material",
        notes: "Caixas para envio",
      }),
    ];

    expect(
      filterBusinessExpenses(expenses, {
        search: "moto",
        category: "all",
        period: "all",
        today,
      }).map((expense) => expense.id)
    ).toEqual(["1"]);

    expect(
      filterBusinessExpenses(expenses, {
        search: "caixas",
        category: "all",
        period: "all",
        today,
      }).map((expense) => expense.id)
    ).toEqual(["2"]);
  });

  it("resume total, media e maior categoria", () => {
    const summary = summarizeBusinessExpenses([
      makeExpense({
        id: "1",
        category: "gasolina",
        amount: 100,
      }),
      makeExpense({
        id: "2",
        category: "gasolina",
        amount: 50,
      }),
      makeExpense({
        id: "3",
        category: "taxas",
        amount: 30,
      }),
    ]);

    expect(summary.count).toBe(3);
    expect(summary.total).toBe(180);
    expect(summary.average).toBe(60);
    expect(summary.topCategory).toBe("gasolina");
    expect(summary.topCategoryAmount).toBe(150);
  });

  it("valida descricao, valor e data obrigatorios", () => {
    const errors = validateBusinessExpenseDraft({
      description: "   ",
      category: "outras",
      amount: 0,
      spentAt: "",
      notes: "",
    });

    expect(errors.description).toBeTruthy();
    expect(errors.amount).toBeTruthy();
    expect(errors.spentAt).toBeTruthy();
  });
  it("rejeita data futura", () => {
    const errors = validateBusinessExpenseDraft(
      {
        description: "Gasolina",
        category: "gasolina",
        amount: 50,
        spentAt: "2026-09-12",
        notes: "",
      },
      today
    );

    expect(errors.spentAt).toBeTruthy();
  });

  it("rejeita descricao acima de 200 caracteres", () => {
    const errors = validateBusinessExpenseDraft(
      {
        description: "a".repeat(201),
        category: "outras",
        amount: 50,
        spentAt: "2026-09-11",
        notes: "",
      },
      today
    );

    expect(errors.description).toBeTruthy();
  });

  it("rejeita observacoes acima de 2000 caracteres", () => {
    const errors = validateBusinessExpenseDraft(
      {
        description: "Despesa válida",
        category: "outras",
        amount: 50,
        spentAt: "2026-09-11",
        notes: "a".repeat(2001),
      },
      today
    );

    expect(errors.notes).toBeTruthy();
  });
});
