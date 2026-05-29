/**
 * AI Context Builder — GranaBase V2
 *
 * Builds structured, prompt-ready context for AI financial conversations.
 * Designed for Claude/OpenAI integration — provides both:
 *   1. A compact system prompt with financial state
 *   2. A structured JSON object for tool-call APIs
 *
 * This file prepares the app for AI features without coupling to any specific provider.
 * Import `buildAIContext()` wherever you set up an AI chat or recommendation call.
 */

import type { FinancialProjection } from "@/lib/projection-engine";
import type { FinancialInsight } from "@/lib/insights-engine";
import type { BehaviorReport } from "@/lib/behavioral-engine";
import { formatCurrency } from "@/lib/utils";

export interface AIFinancialContext {
  /** Short system prompt (≤500 tokens) describing the user's financial state. */
  systemPrompt: string;

  /** Full structured data for tool-call APIs or RAG. */
  structured: StructuredFinancialContext;

  /** One-sentence financial health summary (for UI display). */
  healthSummary: string;
}

export interface StructuredFinancialContext {
  snapshot: {
    currentBalance: number;
    walletBalance: number;
    totalPatrimony: number;
    monthIncome: number;
    monthExpenses: number;
    freeMoneyReal: number;
    avgMonthlyIncome: number;
  };
  obligations: {
    thisMonth: number;
    next30Days: number;
    total: number;
    pendingBills: number;
    pendingInstallments: number;
  };
  pressure: {
    score: number;
    level: string;
    committedPercent: number;
  };
  projections: {
    surplusNext30: number;
    recurringIncomeExpected: number;
    nextRiskDate: string | null;
  };
  health: {
    radarScore: number;
    stabilityScore: number;
    liquidityScore: number;
    controlScore: number;
    creditScore: number;
    growthScore: number;
  };
  insights: Array<{
    severity: string;
    category: string;
    title: string;
    message: string;
    value?: number;
  }>;
  behavior?: {
    disciplineScore: number;
    overallTrend: string;
    spendingChangePercent: number;
    topImprovement: string | null;
    topConcern: string | null;
  };
}

// ─── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(
  p: FinancialProjection,
  insights: FinancialInsight[],
  behavior?: BehaviorReport
): string {
  const pressureDesc =
    p.pressureLevel === "healthy" ? "pressão financeira saudável" :
    p.pressureLevel === "attention" ? "atenção financeira necessária" :
    "pressão financeira crítica";

  const criticalInsights = insights.filter((i) => i.severity === "critical");
  const riskNote = p.nextRiskDate
    ? `Saldo projetado negativo em ${p.nextRiskDate}.`
    : "Nenhum risco de saldo negativo detectado nos próximos 30 dias.";

  const radarAvg = p.radar.length > 0
    ? Math.round(p.radar.reduce((s, d) => s + d.score, 0) / p.radar.length)
    : 0;

  let behaviorNote = "";
  if (behavior) {
    behaviorNote = `\nComportamento: ${
      behavior.overallTrend === "improving" ? "gastos em queda" :
      behavior.overallTrend === "worsening" ? "gastos em alta" :
      "gastos estáveis"
    }. Disciplina: ${behavior.disciplineScore}/100.`;
  }

  return `Você é um assistente financeiro do GranaBase para um usuário com as seguintes condições:
- Saldo atual: ${formatCurrency(p.currentBalance)} | Patrimônio total: ${formatCurrency(p.totalPatrimony)}
- Renda este mês: ${formatCurrency(p.monthIncome)} | Gastos este mês: ${formatCurrency(p.monthExpenses)}
- Dinheiro livre real: ${formatCurrency(p.freeMoneyReal)} | ${pressureDesc} (${p.pressureScore}%)
- Obrigações próximos 30d: ${formatCurrency(p.committedNext30Days)} | Projeção de sobra: ${formatCurrency(p.surplusProjected)}
- Saúde financeira geral: ${radarAvg}/100
- ${riskNote}${behaviorNote}
${criticalInsights.length > 0 ? `\nAlertas críticos: ${criticalInsights.map((i) => i.title).join(", ")}.` : ""}

Responda em português brasileiro. Seja direto, honesto e não alarmista. Base todas as recomendações nos dados acima.`;
}

// ─── Structured context builder ───────────────────────────────────────────────

function buildStructured(
  p: FinancialProjection,
  insights: FinancialInsight[],
  behavior?: BehaviorReport
): StructuredFinancialContext {
  const radarMap = Object.fromEntries(p.radar.map((d) => [d.label, d.score]));

  return {
    snapshot: {
      currentBalance: p.currentBalance,
      walletBalance: p.walletBalance,
      totalPatrimony: p.totalPatrimony,
      monthIncome: p.monthIncome,
      monthExpenses: p.monthExpenses,
      freeMoneyReal: p.freeMoneyReal,
      avgMonthlyIncome: p.avgMonthlyIncome,
    },
    obligations: {
      thisMonth: p.committedThisMonth,
      next30Days: p.committedNext30Days,
      total: p.committedTotal,
      pendingBills: p.pendingBillsAmount,
      pendingInstallments: p.pendingInstallmentsAmount,
    },
    pressure: {
      score: p.pressureScore,
      level: p.pressureLevel,
      committedPercent: p.committedPercent,
    },
    projections: {
      surplusNext30: p.surplusProjected,
      recurringIncomeExpected: p.projectedIncomeNext30,
      nextRiskDate: p.nextRiskDate,
    },
    health: {
      radarScore: p.radar.length > 0
        ? Math.round(p.radar.reduce((s, d) => s + d.score, 0) / p.radar.length)
        : 0,
      stabilityScore: radarMap["Estabilidade"] ?? 0,
      liquidityScore: radarMap["Liquidez"] ?? 0,
      controlScore:   radarMap["Controle"] ?? 0,
      creditScore:    radarMap["Crédito"] ?? 0,
      growthScore:    radarMap["Crescimento"] ?? 0,
    },
    insights: insights.map((i) => ({
      severity: i.severity,
      category: i.category,
      title: i.title,
      message: i.message,
      value: i.value,
    })),
    behavior: behavior
      ? {
          disciplineScore: behavior.disciplineScore,
          overallTrend: behavior.overallTrend,
          spendingChangePercent: behavior.spendingChangePercent,
          topImprovement: behavior.biggestImprovement?.category ?? null,
          topConcern: behavior.biggestWorsening?.category ?? null,
        }
      : undefined,
  };
}

// ─── Health summary ────────────────────────────────────────────────────────────

function buildHealthSummary(p: FinancialProjection): string {
  const radarAvg = p.radar.length > 0
    ? Math.round(p.radar.reduce((s, d) => s + d.score, 0) / p.radar.length)
    : 0;

  if (radarAvg >= 75 && p.pressureLevel === "healthy") {
    return "Saúde financeira excelente — bem posicionado para crescimento";
  }
  if (radarAvg >= 55 && p.pressureLevel !== "critical") {
    return "Saúde financeira boa — alguns pontos podem ser otimizados";
  }
  if (p.pressureLevel === "critical" || p.nextRiskDate) {
    return "Atenção financeira necessária — revise obrigações e fluxo";
  }
  return "Saúde financeira moderada — monitore gastos e obrigações";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildAIContext(
  projection: FinancialProjection,
  insights: FinancialInsight[],
  behavior?: BehaviorReport
): AIFinancialContext {
  return {
    systemPrompt:  buildSystemPrompt(projection, insights, behavior),
    structured:    buildStructured(projection, insights, behavior),
    healthSummary: buildHealthSummary(projection),
  };
}
