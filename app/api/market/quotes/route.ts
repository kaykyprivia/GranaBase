import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface BrapiQuoteResult {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
}

export interface AssetQuote {
  price: number | null;
  changePercent: number | null;
  name: string | null;
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

  const token = process.env.BRAPI_TOKEN ?? process.env.BRAPI_API_KEY;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const data = await fetchJson<{ results?: BrapiQuoteResult[] }>(
    `https://brapi.dev/api/quote/${tickers.join(",")}`,
    { headers }
  );

  if (!data?.results) {
    return NextResponse.json(result);
  }

  for (const quote of data.results) {
    if (!quote.symbol) continue;
    result[quote.symbol.toUpperCase()] = {
      price: quote.regularMarketPrice ?? null,
      changePercent: quote.regularMarketChangePercent ?? null,
      name: quote.shortName ?? quote.longName ?? null,
    };
  }

  return NextResponse.json(result);
}
