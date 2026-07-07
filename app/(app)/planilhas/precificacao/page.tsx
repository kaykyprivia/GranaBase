"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { InsumosScreen } from "@/modules/spreadsheets/pricing/components/InsumosScreen";
import { ProdutosScreen } from "@/modules/spreadsheets/pricing/components/ProdutosScreen";
import { ConfiguracoesScreen } from "@/modules/spreadsheets/pricing/components/ConfiguracoesScreen";

type Tab = "produtos" | "insumos" | "configuracoes";

const TABS: { id: Tab; label: string }[] = [
  { id: "produtos", label: "Produtos" },
  { id: "insumos", label: "Insumos" },
  { id: "configuracoes", label: "Configurações" },
];

export default function PrecificacaoPage() {
  const [tab, setTab] = useState<Tab>("produtos");

  return (
    <div className="page-container animate-fade-in">
      <div className="mb-6 flex items-center gap-3 border-b border-border/50 pb-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/20 to-accent/8 text-accent ring-1 ring-accent/20">
          <Calculator className="h-5 w-5" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Planilha de Precificação</h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Monte a ficha técnica dos seus produtos e descubra o preço certo automaticamente.
          </p>
        </div>
      </div>

      <div className="mb-5 inline-flex rounded-xl border border-border bg-surface p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background"
                : "rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "produtos" && <ProdutosScreen />}
      {tab === "insumos" && <InsumosScreen />}
      {tab === "configuracoes" && <ConfiguracoesScreen />}
    </div>
  );
}
