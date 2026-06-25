import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface HistoricalPoint {
  date: string;
  price: number;
}

interface YahooChartResult {
  timestamp?: number[] | null;
  indicators?: {
    quote?: Array<{ close?: Array<number | null> | null }> | null;
  } | null;
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
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const LONG_RANGES = new Set(["1y", "2y", "5y", "max"]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const range = searchParams.get("range") ?? "1y";

  if (!ticker) {
    return NextResponse.json({ points: [] });
  }

  const interval = LONG_RANGES.has(range) ? "1mo" : "1d";

  const data = await fetchJson<YahooChartResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA?range=${range}&interval=${interval}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );

  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp;
  const closes = result?.indicators?.quote?.[0]?.close;

  if (!timestamps || !closes) {
    return NextResponse.json({ points: [] });
  }

  const points: HistoricalPoint[] = [];

  for (let i = 0; i < timestamps.length; i += 1) {
    const close = closes[i];
    const timestamp = timestamps[i];
    if (close == null || timestamp == null) continue;

    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    points.push({ date, price: close });
  }

  return NextResponse.json({ points });
}
