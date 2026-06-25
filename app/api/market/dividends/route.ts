import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface DividendEvent {
  date: string;
  amountPerShare: number;
}

interface YahooDividendEntry {
  amount?: number;
  date?: number;
}

interface YahooChartResult {
  events?: {
    dividends?: Record<string, YahooDividendEntry> | null;
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
      next: { revalidate: 60 * 60 * 6 },
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
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  const range = searchParams.get("range") ?? "5y";

  if (!ticker) {
    return NextResponse.json({ dividends: [] });
  }

  const data = await fetchJson<YahooChartResponse>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.SA?range=${range}&interval=1mo&events=div`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );

  const dividendsMap = data?.chart?.result?.[0]?.events?.dividends;

  if (!dividendsMap) {
    return NextResponse.json({ dividends: [] });
  }

  const dividends: DividendEvent[] = Object.values(dividendsMap)
    .filter((entry): entry is YahooDividendEntry & { amount: number; date: number } =>
      entry?.amount != null && entry?.date != null
    )
    .map((entry) => ({
      date: new Date(entry.date * 1000).toISOString().slice(0, 10),
      amountPerShare: entry.amount,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return NextResponse.json({ dividends });
}
