export interface FixedIncomeReturn {
  principal: number;
  annualRatePercent: number;
  daily: number;
  monthly: number;
  annual: number;
}

export interface MarketRate {
  value: number;
  annualizedValue: number;
  date: string | null;
  source: "brapi" | "bcb" | "fallback";
}

export interface MarketQuote {
  symbol: string;
  name: string;
  price: number | null;
  changePercent: number | null;
  source: "brapi" | "fallback";
}

export interface MarketOverview {
  cdi: MarketRate;
  selic: MarketRate;
  ibovespa: MarketQuote;
  requestedAt: string;
}

export const FALLBACK_CDI_ANNUAL_PERCENT = 14;
export const FALLBACK_SELIC_ANNUAL_PERCENT = 14.25;

export function roundMarketMoney(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

export function annualizeDailyRate(dailyRatePercent: number, businessDays = 252) {
  if (!Number.isFinite(dailyRatePercent) || dailyRatePercent <= 0) {
    return 0;
  }

  return (Math.pow(1 + dailyRatePercent / 100, businessDays) - 1) * 100;
}

export function calculateCdb100CdiReturn(
  principal: number,
  annualRatePercent: number
): FixedIncomeReturn {
  const safePrincipal = Math.max(principal, 0);
  const annualRate = Math.max(annualRatePercent, 0) / 100;
  const dailyRate = Math.pow(1 + annualRate, 1 / 252) - 1;
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;

  return {
    principal: roundMarketMoney(safePrincipal),
    annualRatePercent: roundMarketMoney(annualRatePercent),
    daily: roundMarketMoney(safePrincipal * dailyRate),
    monthly: roundMarketMoney(safePrincipal * monthlyRate),
    annual: roundMarketMoney(safePrincipal * annualRate),
  };
}

export function calculateTesouroSelicReturn(
  principal: number,
  annualRatePercent: number
) {
  return calculateCdb100CdiReturn(principal, annualRatePercent);
}

export function buildFallbackMarketOverview(): MarketOverview {
  return {
    cdi: {
      value: FALLBACK_CDI_ANNUAL_PERCENT,
      annualizedValue: FALLBACK_CDI_ANNUAL_PERCENT,
      date: null,
      source: "fallback",
    },
    selic: {
      value: FALLBACK_SELIC_ANNUAL_PERCENT,
      annualizedValue: FALLBACK_SELIC_ANNUAL_PERCENT,
      date: null,
      source: "fallback",
    },
    ibovespa: {
      symbol: "^BVSP",
      name: "Ibovespa",
      price: null,
      changePercent: null,
      source: "fallback",
    },
    requestedAt: new Date().toISOString(),
  };
}
