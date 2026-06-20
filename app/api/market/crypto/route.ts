import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
  BNB: "binancecoin",
  USDT: "tether",
  USDC: "usd-coin",
  MATIC: "matic-network",
  LTC: "litecoin",
  AVAX: "avalanche-2",
  DOT: "polkadot",
  LINK: "chainlink",
  TRX: "tron",
};

interface CoinGeckoPrice {
  brl?: number;
  brl_24h_change?: number;
}

export interface CryptoQuote {
  priceBrl: number;
  changePercent24h: number | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      next: { revalidate: 60 * 5 },
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
  const symbolsParam = searchParams.get("symbols") ?? "";
  const symbols = symbolsParam
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  const result: Record<string, CryptoQuote> = {};

  if (symbols.length === 0) {
    return NextResponse.json(result);
  }

  const idToSymbols = new Map<string, string[]>();
  for (const symbol of symbols) {
    const id = SYMBOL_TO_COINGECKO_ID[symbol];
    if (!id) continue;
    const existing = idToSymbols.get(id) ?? [];
    existing.push(symbol);
    idToSymbols.set(id, existing);
  }

  const ids = [...idToSymbols.keys()];
  if (ids.length === 0) {
    return NextResponse.json(result);
  }

  const data = await fetchJson<Record<string, CoinGeckoPrice>>(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=brl&include_24hr_change=true`
  );

  if (!data) {
    return NextResponse.json(result);
  }

  for (const [id, mappedSymbols] of idToSymbols.entries()) {
    const price = data[id];
    if (!price || typeof price.brl !== "number") continue;

    for (const symbol of mappedSymbols) {
      result[symbol] = {
        priceBrl: price.brl,
        changePercent24h: typeof price.brl_24h_change === "number" ? price.brl_24h_change : null,
      };
    }
  }

  return NextResponse.json(result);
}
