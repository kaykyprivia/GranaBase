import { NextResponse } from "next/server";
import {
  FALLBACK_CDI_ANNUAL_PERCENT,
  FALLBACK_SELIC_ANNUAL_PERCENT,
  annualizeDailyRate,
  buildFallbackMarketOverview,
  type MarketOverview,
  type MarketQuote,
  type MarketRate,
} from "@/lib/market";

export const dynamic = "force-dynamic";

interface BcbSeriesPoint {
  data: string;
  valor: string;
}

interface BrapiPrimeRatePoint {
  date?: string;
  value?: string;
}

interface BrapiQuoteResult {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      next: { revalidate: 60 * 30 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchBcbDailyRate(code: number, fallbackAnnualPercent: number): Promise<MarketRate> {
  const data = await fetchJson<BcbSeriesPoint[]>(
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`
  );
  const latest = data?.[0];
  const dailyValue = latest ? Number(latest.valor.replace(",", ".")) : 0;
  const annualizedValue = annualizeDailyRate(dailyValue);

  if (!latest || annualizedValue <= 0) {
    return {
      value: fallbackAnnualPercent,
      annualizedValue: fallbackAnnualPercent,
      date: null,
      source: "fallback",
    };
  }

  return {
    value: dailyValue,
    annualizedValue,
    date: latest.data,
    source: "bcb",
  };
}

async function fetchBrapiSelic(): Promise<MarketRate | null> {
  const token = process.env.BRAPI_TOKEN ?? process.env.BRAPI_API_KEY;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const data = await fetchJson<{ "prime-rate"?: BrapiPrimeRatePoint[] }>(
    "https://brapi.dev/api/v2/prime-rate?country=brazil&historical=false",
    { headers }
  );
  const latest = data?.["prime-rate"]?.[0];
  const value = latest?.value ? Number(latest.value.replace(",", ".")) : 0;

  if (!latest || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return {
    value,
    annualizedValue: value,
    date: latest.date ?? null,
    source: "brapi",
  };
}

async function fetchBrapiIbovespa(): Promise<MarketQuote> {
  const token = process.env.BRAPI_TOKEN ?? process.env.BRAPI_API_KEY;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const data = await fetchJson<{ results?: BrapiQuoteResult[] }>(
    "https://brapi.dev/api/quote/%5EBVSP",
    { headers }
  );
  const quote = data?.results?.[0];

  if (!quote) {
    return buildFallbackMarketOverview().ibovespa;
  }

  return {
    symbol: quote.symbol ?? "^BVSP",
    name: quote.shortName ?? quote.longName ?? "Ibovespa",
    price: quote.regularMarketPrice ?? null,
    changePercent: quote.regularMarketChangePercent ?? null,
    source: "brapi",
  };
}

export async function GET() {
  const [cdi, brapiSelic, bcbSelic, ibovespa] = await Promise.all([
    fetchBcbDailyRate(12, FALLBACK_CDI_ANNUAL_PERCENT),
    fetchBrapiSelic(),
    fetchBcbDailyRate(11, FALLBACK_SELIC_ANNUAL_PERCENT),
    fetchBrapiIbovespa(),
  ]);

  const payload: MarketOverview = {
    cdi,
    selic: brapiSelic ?? bcbSelic,
    ibovespa,
    requestedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
