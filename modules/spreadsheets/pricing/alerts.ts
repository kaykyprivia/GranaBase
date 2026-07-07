import type { PricingResult } from "./calculations";

export type AlertType = "prejuizo" | "margem_baixa" | "precificacao_impossivel" | "fornecedor_caro";
export type AlertSeverity = "aviso" | "critico";

export interface Alert {
  tipo: AlertType;
  severidade: AlertSeverity;
  mensagem: string;
}

export interface AlertThresholds {
  margemLiquidaMinimaPct: number;
  fornecedorCaroLimiarPct: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  margemLiquidaMinimaPct: 15,
  fornecedorCaroLimiarPct: 20,
};

/**
 * Avalia a saude de um produto a partir do resultado ja calculado — pura
 * matematica sobre numeros prontos, sem conhecer UI. "Sempre explicar o
 * motivo" do aviso, nunca so um sinal vermelho sem contexto.
 */
export function evaluateProductHealth(
  result: PricingResult,
  precoPraticado: number | null,
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): Alert[] {
  const alerts: Alert[] = [];

  if (result.precoSugerido === null) {
    alerts.push({
      tipo: "precificacao_impossivel",
      severidade: "critico",
      mensagem:
        "A soma de despesas, impostos e margem desejada é maior ou igual a 100% do preço de venda — não existe preço que cubra isso. Reduza algum desses percentuais.",
    });
    return alerts;
  }

  if (precoPraticado !== null && precoPraticado < result.custoPorPorcao) {
    alerts.push({
      tipo: "prejuizo",
      severidade: "critico",
      mensagem: `O preço praticado (${formatBRL(precoPraticado)}) é menor que o custo por porção (${formatBRL(result.custoPorPorcao)}) — este produto está dando prejuízo a cada venda.`,
    });
  }

  if (result.margemLiquidaPct !== null && result.margemLiquidaPct < thresholds.margemLiquidaMinimaPct) {
    alerts.push({
      tipo: "margem_baixa",
      severidade: result.margemLiquidaPct < 0 ? "critico" : "aviso",
      mensagem: `Margem líquida de ${result.margemLiquidaPct.toFixed(1)}% está abaixo do mínimo recomendado (${thresholds.margemLiquidaMinimaPct}%).`,
    });
  }

  return alerts;
}

export interface InsumoCusto {
  nome: string;
  custoUnitario: number;
}

/** Compara o custo unitário de um insumo com a média de insumos parecidos. */
export function detectarFornecedorCaro(
  insumo: InsumoCusto,
  custosUnitariosSimilares: number[],
  thresholds: AlertThresholds = DEFAULT_ALERT_THRESHOLDS
): Alert | null {
  if (custosUnitariosSimilares.length === 0) return null;

  const media =
    custosUnitariosSimilares.reduce((soma, valor) => soma + valor, 0) / custosUnitariosSimilares.length;
  if (media <= 0) return null;

  const diferencaPct = ((insumo.custoUnitario - media) / media) * 100;
  if (diferencaPct <= thresholds.fornecedorCaroLimiarPct) return null;

  return {
    tipo: "fornecedor_caro",
    severidade: "aviso",
    mensagem: `${insumo.nome} está ${diferencaPct.toFixed(0)}% acima do custo médio de insumos parecidos (${formatBRL(media)}).`,
  };
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}
