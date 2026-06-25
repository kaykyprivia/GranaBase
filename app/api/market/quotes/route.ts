import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface AssetQuote {
  price: number | null;
  changePercent: number | null;
  name: string | null;
}

interface YahooChartResult {
  meta?: {
    regularMarketPrice?: number;
    chartPreviousClose?: number;
    longName?: string;
    shortName?: string;
  };
}

interface YahooChartResponse {
  chart?: {
    result?: YahooChartResult[] | null;
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      next: { revalidate: 60 * 15 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchQuote(ticker: string): Promise<AssetQuote | null> {
  const data = await fetchJson<YahooChartResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA?range=5d&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );

  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || meta.regularMarketPrice == null) {
    return null;
  }

  const price = meta.regularMarketPrice;
  const previousClose = meta.chartPreviousClose;
  const changePercent =
    previousClose != null && previousClose !== 0
      ? ((price - previousClose) / previousClose) * 100
      : null;

  return {
    price,
    changePercent,
    name: meta.longName ?? meta.shortName ?? null,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get("tickers") ?? "";
  const tickers = tickersParam
    .split(",")
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean);

  const result: Record<string, AssetQuote> = {};

  if (tickers.length === 0) {
    return NextResponse.json(result);
  }

  const quotes = await Promise.all(
    tickers.map(async (ticker) => ({ ticker, quote: await fetchQuote(ticker) }))
  );

  for (const { ticker, quote } of quotes) {
    if (quote) {
      result[ticker] = quote;
    }
  }

  return NextResponse.json(result);
}
