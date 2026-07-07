import { describe, expect, it } from "vitest";
import { calcularPrecificacao } from "@/modules/spreadsheets/pricing/calculations";
import { detectarFornecedorCaro, evaluateProductHealth } from "@/modules/spreadsheets/pricing/alerts";

function buildResult(overrides: Partial<Parameters<typeof calcularPrecificacao>[0]> = {}) {
  return calcularPrecificacao({
    fichaTecnica: [
      { precoCompra: 48, quantidadeCompra: 1, pesoBruto: null, pesoLiquido: null, quantidadeUsada: 1 },
    ],
    rendimentoPorcoes: 4,
    despesasVariaveisPct: 10,
    despesasFixasPct: 5,
    impostosPct: 0,
    margemDesejadaPct: 25,
    ...overrides,
  });
}

describe("evaluateProductHealth", () => {
  it("warns when the practiced price is below cost (prejuizo)", () => {
    const result = buildResult();
    const alerts = evaluateProductHealth(result, 5);
    expect(alerts.some((a) => a.tipo === "prejuizo" && a.severidade === "critico")).toBe(true);
  });

  it("warns when net margin is below the configured threshold", () => {
    const result = buildResult({ margemDesejadaPct: 2 });
    const alerts = evaluateProductHealth(result, null, {
      margemLiquidaMinimaPct: 15,
      fornecedorCaroLimiarPct: 20,
    });
    expect(alerts.some((a) => a.tipo === "margem_baixa")).toBe(true);
  });

  it("flags impossible pricing when percentages sum to 100% or more", () => {
    const result = buildResult({ despesasVariaveisPct: 60, despesasFixasPct: 30, margemDesejadaPct: 20 });
    const alerts = evaluateProductHealth(result, null);
    expect(alerts).toEqual([
      expect.objectContaining({ tipo: "precificacao_impossivel", severidade: "critico" }),
    ]);
  });

  it("returns no alerts for a healthy product with no practiced price yet", () => {
    const result = buildResult();
    const alerts = evaluateProductHealth(result, null);
    expect(alerts).toEqual([]);
  });
});

describe("detectarFornecedorCaro", () => {
  it("flags a supplier priced well above similar ingredients", () => {
    const alert = detectarFornecedorCaro({ nome: "Leite em pó", custoUnitario: 30 }, [20, 21, 19]);
    expect(alert).not.toBeNull();
    expect(alert?.tipo).toBe("fornecedor_caro");
  });

  it("returns null when price is within the threshold", () => {
    const alert = detectarFornecedorCaro({ nome: "Leite em pó", custoUnitario: 21 }, [20, 21, 19]);
    expect(alert).toBeNull();
  });

  it("returns null when there is nothing to compare against", () => {
    const alert = detectarFornecedorCaro({ nome: "Leite em pó", custoUnitario: 21 }, []);
    expect(alert).toBeNull();
  });
});
