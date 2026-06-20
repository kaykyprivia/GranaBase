import { NextRequest, NextResponse } from "next/server";
import type { BrasilApiHoliday } from "@/lib/brasilapi";

export const dynamic = "force-dynamic";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(url, {
      ...init,
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") ?? String(new Date().getFullYear());

  const holidays = await fetchJson<BrasilApiHoliday[]>(
    `https://brasilapi.com.br/api/feriados/v1/${year}`
  );

  return NextResponse.json(holidays ?? []);
}
