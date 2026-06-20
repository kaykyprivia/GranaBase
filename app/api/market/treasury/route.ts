import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export interface TreasuryTitle {
  name: string;
  rate: number | null;
  price: number | null;
}

interface TreasuryResponsePayload {
  titles: TreasuryTitle[];
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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractTitles(data: unknown): TreasuryTitle[] {
  if (!data || typeof data !== "object") {
    return [];
  }

  const record = data as Record<string, unknown>;
  const rawList =
    (Array.isArray(record.treasures) && record.treasures)
    || (Array.isArray(record.titles) && record.titles)
    || (Array.isArray(record.results) && record.results)
    || (Array.isArray(record.data) && record.data)
    || (Array.isArray(data) ? data : null);

  if (!rawList) {
    return [];
  }

  const titles: TreasuryTitle[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;

    const name =
      (typeof entry.name === "string" && entry.name)
      || (typeof entry.title === "string" && entry.title)
      || (typeof entry.bondName === "string" && entry.bondName)
      || null;

    if (!name) continue;

    const rate =
      toFiniteNumber(entry.rate)
      ?? toFiniteNumber(entry.buyRate)
      ?? toFiniteNumber(entry.sellRate)
      ?? toFiniteNumber(entry.annualRate);

    const price =
      toFiniteNumber(entry.price)
      ?? toFiniteNumber(entry.buyPrice)
      ?? toFiniteNumber(entry.sellPrice)
      ?? toFiniteNumber(entry.minimumInvestmentAmount);

    titles.push({ name, rate, price });
  }

  return titles;
}

export async function GET() {
  const token = process.env.BRAPI_TOKEN ?? process.env.BRAPI_API_KEY;
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const data = await fetchJson<unknown>("https://brapi.dev/api/v2/treasury", { headers });

  const payload: TreasuryResponsePayload = {
    titles: data ? extractTitles(data) : [],
  };

  return NextResponse.json(payload);
}
