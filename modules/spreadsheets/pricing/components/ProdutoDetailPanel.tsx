"use client";

import { useMemo, useState } from "react";
import { Copy, Search, Trash2 } from "lucide-react";
import type { Insumo, Produto, ProdutoInput } from "../types";
import { calcularCustoInsumoNaReceita, calcularPrecificacao, type InsumoNaFichaTecnica } from "../calculations";
import { evaluateProductHealth } from "../alerts";
import { PricingSummary } from "./PricingSummary";
import { cn } from "../../engine/cn";
import { useAutosave } from "../../engine/useAutosave";
import { Field, NumberField, inputClass } from "./FormFields";

export interface ProdutoDetailPanelProps {
  produto: Produto;
  insumos: Insumo[];
  onUpdate: (patch: Partial<ProdutoInput>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddInsumo: (insumoId: string, quantidadeUsada: number) => void;
  onUpdateQuantidade: (fichaItemId: string, quantidadeUsada: number) => void;
  onRemoveInsumo: (fichaItemId: string) => void;
}

function buildFichaTecnica(produto: Produto, insumos: Insumo[], custoMultiplicador: number): InsumoNaFichaTecnica[] {
  return produto.fichaTecnica
    .map((item) => {
      const insumo = insumos.find((i) => i.id === item.insumoId);
      if (!insumo) return null;
      return {
        precoCompra: insumo.precoCompra * custoMultiplicador,
        quantidadeCompra: insumo.quantidadeCompra,
        pesoBruto: insumo.pesoBruto,
        pesoLiquido: insumo.pesoLiquido,
        quantidadeUsada: item.quantidadeUsada,
      };
    })
    .filter((v): v is InsumoNaFichaTecnica => v !== null);
}

export function ProdutoDetailPanel({
  produto,
  insumos,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddInsumo,
  onUpdateQuantidade,
  onRemoveInsumo,
}: ProdutoDetailPanelProps) {
  const [simulacaoPct, setSimulacaoPct] = useState(0);
  const [insumoQuery, setInsumoQuery] = useState("");
  const [text, setText] = useState({ nome: produto.nome, categoria: produto.categoria });
  const autosaveStatus = useAutosave(text, async (value) => onUpdate(value));

  const insumosDisponiveis = insumos.filter(
    (i) => !produto.fichaTecnica.some((f) => f.insumoId === i.id)
  );

  const insumosSugeridos = useMemo(() => {
    const query = insumoQuery.trim().toLowerCase();
    if (!query) return [];
    return insumosDisponiveis.filter((i) => i.nome.toLowerCase().includes(query)).slice(0, 6);
  }, [insumosDisponiveis, insumoQuery]);

  function handleSelectInsumo(insumoId: string) {
    onAddInsumo(insumoId, 1);
    setInsumoQuery("");
  }

  const custoBreakdown = useMemo(() => {
    return produto.fichaTecnica
      .map((item) => {
        const insumo = insumos.find((i) => i.id === item.insumoId);
        if (!insumo) return null;
        const custo = calcularCustoInsumoNaReceita({
          precoCompra: insumo.precoCompra,
          quantidadeCompra: insumo.quantidadeCompra,
          pesoBruto: insumo.pesoBruto,
          pesoLiquido: insumo.pesoLiquido,
          quantidadeUsada: item.quantidadeUsada,
        });
        return { nome: insumo.nome, custo };
      })
      .filter((v): v is { nome: string; custo: number } => v !== null)
      .sort((a, b) => b.custo - a.custo);
  }, [produto.fichaTecnica, insumos]);

  const custoTotalFicha = custoBreakdown.reduce((sum, item) => sum + item.custo, 0);
  const maiorCusto = custoBreakdown[0];
  const maiorCustoPct = maiorCusto && custoTotalFicha > 0 ? (maiorCusto.custo / custoTotalFicha) * 100 : null;

  const resultadoReal = useMemo(() => {
    const fichaTecnica = buildFichaTecnica(produto, insumos, 1);
    return calcularPrecificacao({
      fichaTecnica,
      rendimentoPorcoes: produto.rendimentoPorcoes,
      despesasVariaveisPct: produto.despesasVariaveisPct,
      despesasFixasPct: produto.despesasFixasPct,
      impostosPct: produto.impostosPct,
      margemDesejadaPct: produto.margemDesejadaPct,
      precoPraticado: produto.precoPraticado,
    });
  }, [produto, insumos]);

  const resultadoSimulado = useMemo(() => {
    if (simulacaoPct === 0) return null;
    const fichaTecnica = buildFichaTecnica(produto, insumos, 1 + simulacaoPct / 100);
    return calcularPrecificacao({
      fichaTecnica,
      rendimentoPorcoes: produto.rendimentoPorcoes,
      despesasVariaveisPct: produto.despesasVariaveisPct,
      despesasFixasPct: produto.despesasFixasPct,
      impostosPct: produto.impostosPct,
      margemDesejadaPct: produto.margemDesejadaPct,
      precoPraticado: produto.precoPraticado,
    });
  }, [produto, insumos, simulacaoPct]);

  const alerts = useMemo(
    () => evaluateProductHealth(resultadoSimulado ?? resultadoReal, produto.precoPraticado),
    [resultadoReal, resultadoSimulado, produto.precoPraticado]
  );

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <Field label="Nome" className="flex-1">
          <input
            className={inputClass}
            value={text.nome}
            onChange={(e) => setText((current) => ({ ...current, nome: e.target.value }))}
          />
        </Field>
        {autosaveStatus === "saving" && (
          <span className="ml-2 shrink-0 text-xs text-text-secondary">Salvando…</span>
        )}
        {autosaveStatus === "saved" && (
          <span className="ml-2 shrink-0 text-xs text-text-secondary">Salvo</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria">
          <input
            className={inputClass}
            value={text.categoria ?? ""}
            onChange={(e) => setText((current) => ({ ...current, categoria: e.target.value || null }))}
          />
        </Field>
        <NumberField
          label="Rendimento (porções)"
          value={produto.rendimentoPorcoes}
          min={0.01}
          onCommit={(value) => value !== null && onUpdate({ rendimentoPorcoes: value })}
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-surface-2/40 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Ficha técnica</p>
        <div className="space-y-1.5">
          {produto.fichaTecnica.map((item) => {
            const insumo = insumos.find((i) => i.id === item.insumoId);
            return (
              <div key={item.id} className="flex items-center gap-2 rounded-lg bg-background/40 px-2 py-1.5">
                <span className="flex-1 truncate text-xs text-text-primary">{insumo?.nome ?? "Insumo removido"}</span>
                <input
                  type="number"
                  step="0.001"
                  className="w-20 rounded border border-border bg-transparent px-1.5 py-0.5 text-xs text-text-primary"
                  value={item.quantidadeUsada}
                  onChange={(e) => onUpdateQuantidade(item.id, Number(e.target.value))}
                />
                <span className="text-[10px] text-text-muted">{insumo?.unidadeMedida}</span>
                <button type="button" onClick={() => onRemoveInsumo(item.id)} className="text-text-muted hover:text-expense">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" />
          <input
            className={cn(inputClass, "pl-8")}
            placeholder="Buscar insumo para adicionar..."
            value={insumoQuery}
            onChange={(e) => setInsumoQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && insumosSugeridos[0]) {
                handleSelectInsumo(insumosSugeridos[0].id);
              }
            }}
          />
          {insumosSugeridos.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
              {insumosSugeridos.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectInsumo(i.id);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-border/30"
                >
                  <span className="text-text-primary">{i.nome}</span>
                  <span className="text-text-muted">{i.unidadeMedida}</span>
                </button>
              ))}
            </div>
          )}
          {insumoQuery.trim() && insumosSugeridos.length === 0 && (
            <p className="mt-1 text-xs text-text-muted">Nenhum insumo encontrado.</p>
          )}
        </div>

        {maiorCusto && maiorCustoPct !== null && custoBreakdown.length > 1 && (
          <p className="mt-2 text-xs text-text-secondary">
            <span className="font-medium text-text-primary">{maiorCusto.nome}</span> é o insumo que mais pesa
            no custo desta receita ({maiorCustoPct.toFixed(0)}%).
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Despesas variáveis (%)"
          value={produto.despesasVariaveisPct}
          step="0.1"
          min={0}
          onCommit={(value) => value !== null && onUpdate({ despesasVariaveisPct: value })}
        />
        <NumberField
          label="Despesas fixas (%)"
          value={produto.despesasFixasPct}
          step="0.1"
          min={0}
          onCommit={(value) => value !== null && onUpdate({ despesasFixasPct: value })}
        />
        <NumberField
          label="Impostos (%)"
          value={produto.impostosPct}
          step="0.1"
          min={0}
          onCommit={(value) => value !== null && onUpdate({ impostosPct: value })}
        />
        <NumberField
          label="Margem desejada (%)"
          value={produto.margemDesejadaPct}
          step="0.1"
          min={0}
          onCommit={(value) => value !== null && onUpdate({ margemDesejadaPct: value })}
        />
      </div>

      <NumberField
        label="Preço praticado atualmente (opcional)"
        value={produto.precoPraticado}
        min={0}
        allowNull
        onCommit={(value) => onUpdate({ precoPraticado: value })}
      />

      <div className="rounded-xl border border-border/60 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Precificação
        </p>
        <PricingSummary result={resultadoSimulado ?? resultadoReal} alerts={alerts} />
      </div>

      <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">Simulação</p>
        <p className="mb-2 text-xs text-text-secondary">
          E se o custo dos insumos deste produto mudasse? Arraste para ver o novo cenário sem salvar nada.
        </p>
        <input
          type="range"
          min={-50}
          max={50}
          value={simulacaoPct}
          onChange={(e) => setSimulacaoPct(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-center text-xs font-medium text-text-primary">
          {simulacaoPct > 0 ? "+" : ""}
          {simulacaoPct}% no custo dos insumos
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onDuplicate}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-border/40"
        >
          <Copy className="h-4 w-4" />
          Duplicar produto
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-expense hover:bg-expense/10"
        >
          <Trash2 className="h-4 w-4" />
          Excluir produto
        </button>
      </div>
    </div>
  );
}
