/**
 * Pure pricing calculations — no React, no Supabase, no side effects.
 * Mirrors the discipline of lib/market.ts in the main app (which this
 * module does not import from, staying fully independent).
 */

export interface InsumoNaFichaTecnica {
  precoCompra: number;
  quantidadeCompra: number;
  pesoBruto: number | null;
  pesoLiquido: number | null;
  quantidadeUsada: number;
}

export interface PricingInput {
  fichaTecnica: InsumoNaFichaTecnica[];
  rendimentoPorcoes: number;
  despesasVariaveisPct: number;
  despesasFixasPct: number;
  impostosPct: number;
  margemDesejadaPct: number;
  precoPraticado?: number | null;
}

export interface PricingResult {
  custoTotal: number;
  custoPorPorcao: number;
  markupDivisor: number | null;
  precoMinimo: number | null;
  precoSugerido: number | null;
  precoPremium: number | null;
  margemContribuicaoPct: number | null;
  margemLiquidaPct: number | null;
}

/** Fator de Correção: relação entre peso bruto (comprado) e peso líquido (aproveitável). */
export function calcularFatorCorrecao(pesoBruto: number | null, pesoLiquido: number | null): number {
  if (!pesoBruto || !pesoLiquido || pesoBruto <= 0 || pesoLiquido <= 0) return 1;
  return pesoBruto / pesoLiquido;
}

export function calcularCustoUnitario(precoCompra: number, quantidadeCompra: number): number {
  if (quantidadeCompra <= 0) return 0;
  return precoCompra / quantidadeCompra;
}

export function calcularCustoInsumoNaReceita(insumo: InsumoNaFichaTecnica): number {
  const custoUnitario = calcularCustoUnitario(insumo.precoCompra, insumo.quantidadeCompra);
  const fatorCorrecao = calcularFatorCorrecao(insumo.pesoBruto, insumo.pesoLiquido);
  return insumo.quantidadeUsada * custoUnitario * fatorCorrecao;
}

export function calcularCustoTotalFichaTecnica(fichaTecnica: InsumoNaFichaTecnica[]): number {
  return fichaTecnica.reduce((total, insumo) => total + calcularCustoInsumoNaReceita(insumo), 0);
}

export function calcularCustoPorPorcao(custoTotal: number, rendimentoPorcoes: number): number {
  if (rendimentoPorcoes <= 0) return custoTotal;
  return custoTotal / rendimentoPorcoes;
}

/**
 * Markup divisor: Preço = Custo / (1 - soma das % sobre o preço de venda).
 * Retorna null quando a soma de percentuais é >= 100% (matematicamente
 * impossível precificar — não há preço que cubra tudo isso).
 */
export function calcularMarkupDivisor(percentuaisSobreVenda: number): number | null {
  const divisor = 1 - percentuaisSobreVenda / 100;
  return divisor > 0 ? divisor : null;
}

export function calcularPrecoPorMarkup(custo: number, markupDivisor: number | null): number | null {
  if (markupDivisor === null) return null;
  return custo / markupDivisor;
}

export function calcularMargemContribuicaoPct(
  precoVenda: number,
  custoPorPorcao: number,
  despesasVariaveisPct: number,
  impostosPct: number
): number | null {
  if (precoVenda <= 0) return null;
  const despesasVariaveisValor = precoVenda * (despesasVariaveisPct / 100);
  const impostosValor = precoVenda * (impostosPct / 100);
  const margemContribuicaoValor = precoVenda - custoPorPorcao - despesasVariaveisValor - impostosValor;
  return (margemContribuicaoValor / precoVenda) * 100;
}

export function calcularMargemLiquidaPct(
  precoVenda: number,
  custoPorPorcao: number,
  despesasVariaveisPct: number,
  despesasFixasPct: number,
  impostosPct: number
): number | null {
  if (precoVenda <= 0) return null;
  const custosPctValor = precoVenda * ((despesasVariaveisPct + despesasFixasPct + impostosPct) / 100);
  const lucroValor = precoVenda - custoPorPorcao - custosPctValor;
  return (lucroValor / precoVenda) * 100;
}

/** Pontos percentuais de margem adicionados acima da margem desejada para o "preço premium". */
export const MARGEM_PREMIUM_ADICIONAL_PP = 15;

export function calcularPrecificacao(input: PricingInput): PricingResult {
  const custoTotal = calcularCustoTotalFichaTecnica(input.fichaTecnica);
  const custoPorPorcao = calcularCustoPorPorcao(custoTotal, input.rendimentoPorcoes);

  const percentuaisBase = input.despesasVariaveisPct + input.despesasFixasPct + input.impostosPct;

  const markupMinimo = calcularMarkupDivisor(percentuaisBase);
  const markupSugerido = calcularMarkupDivisor(percentuaisBase + input.margemDesejadaPct);
  const markupPremium = calcularMarkupDivisor(
    percentuaisBase + input.margemDesejadaPct + MARGEM_PREMIUM_ADICIONAL_PP
  );

  const precoMinimo = calcularPrecoPorMarkup(custoPorPorcao, markupMinimo);
  const precoSugerido = calcularPrecoPorMarkup(custoPorPorcao, markupSugerido);
  const precoPremium = calcularPrecoPorMarkup(custoPorPorcao, markupPremium);

  const precoParaMargens = input.precoPraticado ?? precoSugerido ?? 0;

  return {
    custoTotal,
    custoPorPorcao,
    markupDivisor: markupSugerido,
    precoMinimo,
    precoSugerido,
    precoPremium,
    margemContribuicaoPct: calcularMargemContribuicaoPct(
      precoParaMargens,
      custoPorPorcao,
      input.despesasVariaveisPct,
      input.impostosPct
    ),
    margemLiquidaPct: calcularMargemLiquidaPct(
      precoParaMargens,
      custoPorPorcao,
      input.despesasVariaveisPct,
      input.despesasFixasPct,
      input.impostosPct
    ),
  };
}
