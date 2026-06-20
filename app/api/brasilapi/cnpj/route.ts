import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cnpj = searchParams.get("cnpj") ?? "";

  if (!/^\d{14}$/.test(cnpj)) {
    return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

    if (!response.ok) {
      return NextResponse.json({ error: "CNPJ não encontrado" }, { status: 404 });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "CNPJ não encontrado" }, { status: 404 });
  }
}
