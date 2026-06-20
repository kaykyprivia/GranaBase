import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface FrankfurterResponse {
  amount?: number;
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

export interface CurrencyConversionPayload {
  rate: number | null;
  amount: number;
  converted: number | null;
  date: string | null;
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from")?.trim().toUpperCase();
  const to = searchParams.get("to")?.trim().toUpperCase();
  const amountParam = Number(searchParams.get("amount") ?? "1");
  const amount = Number.isFinite(amountParam) && amountParam > 0 ? amountParam : 1;

  if (!from || !to) {
    return NextResponse.json({ rate: null, amount, converted: null, date: null } satisfies CurrencyConversionPayload);
  }

  if (from === to) {
    return NextResponse.json({
      rate: 1,
      amount,
      converted: amount,
      date: null,
    } satisfies CurrencyConversionPayload);
  }

  const data = await fetchJson<FrankfurterResponse>(
    `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`
  );

  const converted = data?.rates?.[to] ?? null;
  const rate = converted !== null ? converted / amount : null;

  const payload: CurrencyConversionPayload = {
    rate,
    amount,
    converted,
    date: data?.date ?? null,
  };

  return NextResponse.json(payload);
}
