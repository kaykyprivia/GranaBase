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
  ipca: MarketRate;
  dolar: MarketRate;
  euro: MarketRate;
  ibovespa: MarketQuote;
  requestedAt: string;
}

export const FALLBACK_CDI_ANNUAL_PERCENT = 14;
export const FALLBACK_SELIC_ANNUAL_PERCENT = 14.25;
export const FALLBACK_IPCA_ANNUAL_PERCENT = 5.06;
export const FALLBACK_DOLAR_BRL = 5.75;
export const FALLBACK_EURO_BRL = 6.25;

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

function countBusinessDaysBetween(start: Date, end: Date): number {
  if (end <= start) {
    return 0;
  }

  let count = 0;
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (cursor < endDay) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }

  return count;
}

/**
 * Valor atualizado de um ativo de renda fixa com liquidez diaria (ex: CDB 100% CDI),
 * compondo a taxa diaria pelos dias uteis corridos desde o aporte.
 */
export function calculateAccruedFixedIncomeValue(
  principal: number,
  annualRatePercent: number,
  investedAt: string,
  asOf: Date = new Date()
): number {
  const safePrincipal = Math.max(principal, 0);
  const startDate = new Date(`${investedAt}T00:00:00`);

  if (Number.isNaN(startDate.getTime())) {
    return roundMarketMoney(safePrincipal);
  }

  const annualRate = Math.max(annualRatePercent, 0) / 100;
  const dailyRate = Math.pow(1 + annualRate, 1 / 252) - 1;
  const businessDays = countBusinessDaysBetween(startDate, asOf);

  return roundMarketMoney(safePrincipal * Math.pow(1 + dailyRate, businessDays));
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
    ipca: {
      value: FALLBACK_IPCA_ANNUAL_PERCENT,
      annualizedValue: FALLBACK_IPCA_ANNUAL_PERCENT,
      date: null,
      source: "fallback",
    },
    dolar: {
      value: FALLBACK_DOLAR_BRL,
      annualizedValue: FALLBACK_DOLAR_BRL,
      date: null,
      source: "fallback",
    },
    euro: {
      value: FALLBACK_EURO_BRL,
      annualizedValue: FALLBACK_EURO_BRL,
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
