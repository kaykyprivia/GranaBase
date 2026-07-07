import { describe, expect, it } from "vitest";
import {
  calcularCustoInsumoNaReceita,
  calcularCustoPorPorcao,
  calcularCustoTotalFichaTecnica,
  calcularCustoUnitario,
  calcularFatorCorrecao,
  calcularMargemContribuicaoPct,
  calcularMargemLiquidaPct,
  calcularMarkupDivisor,
  calcularPrecificacao,
  calcularPrecoPorMarkup,
} from "@/modules/spreadsheets/pricing/calculations";

describe("calcularFatorCorrecao", () => {
  it("calculates yield loss factor from raw vs usable weight (frango com osso example)", () => {
    // 1kg raw chicken yields 620g usable after trimming bone/skin
    expect(calcularFatorCorrecao(1000, 620)).toBeCloseTo(1.6129, 3);
  });

  it("defaults to 1 (no correction) when weights are missing", () => {
    expect(calcularFatorCorrecao(null, null)).toBe(1);
    expect(calcularFatorCorrecao(1000, null)).toBe(1);
  });
});

describe("calcularCustoUnitario", () => {
  it("divides purchase price by purchase quantity", () => {
    expect(calcularCustoUnitario(14, 1)).toBe(14);
    expect(calcularCustoUnitario(28, 2)).toBe(14);
  });

  it("returns 0 for invalid quantity instead of throwing", () => {
    expect(calcularCustoUnitario(14, 0)).toBe(0);
  });
});

describe("calcularCustoInsumoNaReceita", () => {
  it("applies the correction factor to the raw ingredient cost", () => {
    // R$14/kg chicken, recipe needs 100g of prepared (usable) meat,
    // FC = 1000/620 = 1.6129 -> real cost should be higher than naive 100g * 14/1000
    const custo = calcularCustoInsumoNaReceita({
      precoCompra: 14,
      quantidadeCompra: 1,
      pesoBruto: 1000,
      pesoLiquido: 620,
      quantidadeUsada: 0.1,
    });
    expect(custo).toBeCloseTo(2.258, 2);
  });
});

describe("calcularCustoTotalFichaTecnica / calcularCustoPorPorcao", () => {
  it("sums ingredient costs and divides by yield", () => {
    const fichaTecnica = [
      { precoCompra: 48, quantidadeCompra: 1, pesoBruto: null, pesoLiquido: null, quantidadeUsada: 1 },
    ];
    const total = calcularCustoTotalFichaTecnica(fichaTecnica);
    expect(total).toBe(48);
    expect(calcularCustoPorPorcao(total, 4)).toBe(12);
  });
});

describe("calcularMarkupDivisor / calcularPrecoPorMarkup", () => {
  it("matches the worked example: custo 25, despesas 15%, margem 25% -> preco 41.67", () => {
    const divisor = calcularMarkupDivisor(15 + 25);
    expect(divisor).toBeCloseTo(0.6, 5);
    expect(calcularPrecoPorMarkup(25, divisor)).toBeCloseTo(41.67, 2);
  });

  it("returns null when percentages sum to 100% or more (impossible to price)", () => {
    expect(calcularMarkupDivisor(100)).toBeNull();
    expect(calcularMarkupDivisor(130)).toBeNull();
    expect(calcularPrecoPorMarkup(25, null)).toBeNull();
  });
});

describe("calcularMargemContribuicaoPct / calcularMargemLiquidaPct", () => {
  it("contribution margin excludes fixed costs, net margin includes them", () => {
    const precoVenda = 41.67;
    const custoPorPorcao = 25;
    const contribuicao = calcularMargemContribuicaoPct(precoVenda, custoPorPorcao, 10, 0);
    const liquida = calcularMargemLiquidaPct(precoVenda, custoPorPorcao, 10, 5, 0);
    expect(contribuicao).toBeGreaterThan(liquida!);
  });

  it("returns null for zero/negative sale price", () => {
    expect(calcularMargemContribuicaoPct(0, 10, 10, 0)).toBeNull();
    expect(calcularMargemLiquidaPct(-5, 10, 10, 5, 0)).toBeNull();
  });
});

describe("calcularPrecificacao (composed)", () => {
  it("produces a full pricing breakdown with premium price above suggested price", () => {
    const result = calcularPrecificacao({
      fichaTecnica: [
        { precoCompra: 48, quantidadeCompra: 1, pesoBruto: null, pesoLiquido: null, quantidadeUsada: 1 },
      ],
      rendimentoPorcoes: 4,
      despesasVariaveisPct: 10,
      despesasFixasPct: 5,
      impostosPct: 0,
      margemDesejadaPct: 25,
    });

    expect(result.custoPorPorcao).toBe(12);
    expect(result.precoSugerido).toBeCloseTo(20, 1);
    expect(result.precoMinimo).toBeLessThan(result.precoSugerido!);
    expect(result.precoPremium).toBeGreaterThan(result.precoSugerido!);
  });

  it("returns null prices when configured percentages make pricing impossible", () => {
    const result = calcularPrecificacao({
      fichaTecnica: [],
      rendimentoPorcoes: 1,
      despesasVariaveisPct: 50,
      despesasFixasPct: 30,
      impostosPct: 25,
      margemDesejadaPct: 10,
    });

    expect(result.precoSugerido).toBeNull();
  });
});
