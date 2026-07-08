"use client";

import { useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import type { Insumo, Produto, ProdutoInput } from "../types";
import { calcularPrecificacao, type InsumoNaFichaTecnica } from "../calculations";
import { evaluateProductHealth } from "../alerts";
import { PricingSummary } from "./PricingSummary";
import { cn } from "../../engine/cn";
import { Field, NumberField, inputClass } from "./FormFields";

export interface ProdutoDetailPanelProps {
  produto: Produto;
  insumos: Insumo[];
  onUpdate: (patch: Partial<ProdutoInput>) => void;
  onDelete: () => void;
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
  onAddInsumo,
  onUpdateQuantidade,
  onRemoveInsumo,
}: ProdutoDetailPanelProps) {
  const [simulacaoPct, setSimulacaoPct] = useState(0);
  const [novoInsumoId, setNovoInsumoId] = useState("");
  const [novaQuantidade, setNovaQuantidade] = useState(1);

  const insumosDisponiveis = insumos.filter(
    (i) => !produto.fichaTecnica.some((f) => f.insumoId === i.id)
  );

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
      <Field label="Nome">
        <input className={inputClass} value={produto.nome} onChange={(e) => onUpdate({ nome: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria">
          <input
            className={inputClass}
            value={produto.categoria ?? ""}
            onChange={(e) => onUpdate({ categoria: e.target.value || null })}
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

        <div className="mt-2 flex items-center gap-2">
          <select
            className={cn(inputClass, "flex-1")}
            value={novoInsumoId}
            onChange={(e) => setNovoInsumoId(e.target.value)}
          >
            <option value="">Adicionar insumo…</option>
            {insumosDisponiveis.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.001"
            className="w-20 rounded-lg border border-border bg-background/60 px-2 py-2 text-xs text-text-primary"
            value={novaQuantidade}
            onChange={(e) => setNovaQuantidade(Number(e.target.value))}
          />
          <button
            type="button"
            disabled={!novoInsumoId}
            onClick={() => {
              onAddInsumo(novoInsumoId, novaQuantidade);
              setNovoInsumoId("");
              setNovaQuantidade(1);
            }}
            className="rounded-lg bg-accent p-2 text-background disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
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

      <button
        type="button"
        onClick={onDelete}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-expense hover:bg-expense/10"
      >
        <Trash2 className="h-4 w-4" />
        Excluir produto
      </button>
    </div>
  );
}
