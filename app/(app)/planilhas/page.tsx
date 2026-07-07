"use client";

import Link from "next/link";
import { Calculator, LayoutGrid } from "lucide-react";

const PLANILHAS = [
  {
    href: "/planilhas/precificacao",
    nome: "Precificação",
    descricao: "Ficha técnica, custos e preço ideal para seus produtos.",
    icon: Calculator,
    disponivel: true,
  },
];

export default function PlanilhasPage() {
  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6 flex items-center gap-3 border-b border-border/50 pb-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent/8 text-accent ring-1 ring-accent/20">
          <LayoutGrid className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Planilhas</h1>
          <p className="mt-0.5 text-sm text-text-secondary">Ferramentas de gestão financeira do seu negócio.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLANILHAS.map((planilha) => (
          <Link
            key={planilha.href}
            href={planilha.href}
            className="stat-card group flex flex-col gap-3 transition-colors hover:border-accent/40"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/8 text-accent">
              <planilha.icon className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">{planilha.nome}</p>
              <p className="mt-1 text-xs text-text-secondary">{planilha.descricao}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
