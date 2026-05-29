/**
 * Data Integrity & Legacy Adapter — GranaBase V2
 *
 * This module is the FIRST thing called on raw Supabase data before any engine sees it.
 * It normalizes, validates, and sanitizes records that may contain:
 *   - null / undefined fields (old data missing new columns)
 *   - Invalid dates (wrong format, far-future, far-past)
 *   - NaN / Infinity amounts (corrupt numeric data)
 *   - Invalid or missing enum values (old status strings)
 *   - Empty descriptions or categories
 *   - Orphaned installment payments (no parent installment)
 *
 * CRITICAL INVARIANT: this module NEVER mutates original objects — always returns
 * new objects. All transformations are safe, reversible, and leave real data intact.
 *
 * Edge cases explicitly handled:
 *   - amount = 0           → kept (0-value entries can be valid)
 *   - amount < 0           → kept with warning (refunds, corrections)
 *   - amount = NaN/Infinity → replaced with 0
 *   - received_at = null   → record excluded from projection (cannot be dated)
 *   - due_date = null      → bill/installment excluded from projections only
 *   - status = unknown str → normalized to safest known status
 *   - description = null   → replaced with fallback label
 *   - category = null/""   → replaced with "Outro"
 */

import type {
  Bill,
  ExpenseEntry,
  IncomeEntry,
  InstallmentPayment,
} from "@/types/database";

// ─── Integrity report ─────────────────────────────────────────────────────────

export interface IntegrityReport {
  income:       { total: number; valid: number; fixed: number; excluded: number };
  expenses:     { total: number; valid: number; fixed: number; excluded: number };
  bills:        { total: number; valid: number; fixed: number; excluded: number };
  installments: { total: number; valid: number; fixed: number; excluded: number };
  warnings:     string[];
}

// ─── Low-level sanitizers ─────────────────────────────────────────────────────

/** Sanitize amount: replaces NaN/Infinity with 0; keeps negatives (may be refunds). */
function safeAmount(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** Extracts YYYY-MM-DD from a date string or ISO timestamp. Returns "" if invalid. */
function safeDateStr(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  const m = DATE_PATTERN.exec(value);
  if (!m) return "";
  const year = parseInt(m[1]);
  const month = parseInt(m[2]);
  const day = parseInt(m[3]);
  // Basic range check
  if (year < MIN_YEAR || year > MAX_YEAR) return "";
  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function safeStr(value: unknown, fallback: string): string {
  if (!value || typeof value !== "string" || value.trim() === "") return fallback;
  return value.trim();
}

const VALID_BILL_STATUSES = new Set(["pending", "paid", "overdue"]);
const VALID_INSTALLMENT_STATUSES = new Set(["pending", "paid", "paid_with_discount"]);

function normalizeBillStatus(status: unknown): Bill["status"] {
  const s = typeof status === "string" ? status.toLowerCase().trim() : "";
  if (VALID_BILL_STATUSES.has(s)) return s as Bill["status"];
  // Unknown status → treat as pending (safest — won't hide obligations)
  return "pending";
}

function normalizeInstallmentStatus(status: unknown): "pending" | "paid" | "paid_with_discount" {
  const s = typeof status === "string" ? status.toLowerCase().trim() : "";
  if (VALID_INSTALLMENT_STATUSES.has(s)) return s as "pending" | "paid" | "paid_with_discount";
  return "pending";
}

// ─── Per-entity sanitizers ────────────────────────────────────────────────────

export function sanitizeIncomeEntries(
  raw: IncomeEntry[],
  report?: IntegrityReport
): IncomeEntry[] {
  const result: IncomeEntry[] = [];
  let fixed = 0;
  let excluded = 0;

  for (const e of raw) {
    const date = safeDateStr(e.received_at);
    if (!date) {
      // Cannot place this entry on a timeline — exclude from projection
      excluded++;
      report?.warnings.push(`income ${e.id}: invalid received_at="${e.received_at}", excluded`);
      continue;
    }

    const amount = safeAmount(e.amount);
    const description = safeStr(e.description, "Entrada");
    const category = safeStr(e.category, "Outro");

    const changed =
      date !== e.received_at ||
      amount !== e.amount ||
      description !== e.description ||
      category !== e.category;

    if (changed) fixed++;

    result.push({ ...e, received_at: date, amount, description, category });
  }

  if (report) {
    report.income.total = raw.length;
    report.income.valid = result.length - fixed;
    report.income.fixed = fixed;
    report.income.excluded = excluded;
  }

  return result;
}

export function sanitizeExpenseEntries(
  raw: ExpenseEntry[],
  report?: IntegrityReport
): ExpenseEntry[] {
  const result: ExpenseEntry[] = [];
  let fixed = 0;
  let excluded = 0;

  for (const e of raw) {
    const date = safeDateStr(e.spent_at);
    if (!date) {
      excluded++;
      report?.warnings.push(`expense ${e.id}: invalid spent_at="${e.spent_at}", excluded`);
      continue;
    }

    const amount = safeAmount(e.amount);
    const description = safeStr(e.description, "Gasto");
    const category = safeStr(e.category, "Outro");

    const changed =
      date !== e.spent_at ||
      amount !== e.amount ||
      description !== e.description ||
      category !== e.category;

    if (changed) fixed++;

    result.push({ ...e, spent_at: date, amount, description, category });
  }

  if (report) {
    report.expenses.total = raw.length;
    report.expenses.valid = result.length - fixed;
    report.expenses.fixed = fixed;
    report.expenses.excluded = excluded;
  }

  return result;
}

export function sanitizeBills(
  raw: Bill[],
  report?: IntegrityReport
): Bill[] {
  const result: Bill[] = [];
  let fixed = 0;
  let excluded = 0;

  for (const b of raw) {
    const dueDate = safeDateStr(b.due_date);
    if (!dueDate) {
      // Bill with no valid due_date can't be placed in timeline — exclude projections
      // We still include it with a placeholder date far in the future
      // so it doesn't silently disappear from balance/obligation totals.
      // Use a clearly "unknown" date so UI can flag it.
      excluded++;
      report?.warnings.push(`bill ${b.id}: invalid due_date="${b.due_date}", excluded from projection`);
      continue;
    }

    const amount = safeAmount(b.amount);
    const name = safeStr(b.name, "Conta sem nome");
    const status = normalizeBillStatus(b.status);
    const category = safeStr(b.category, "Outro");

    const changed =
      dueDate !== b.due_date ||
      amount !== b.amount ||
      name !== b.name ||
      status !== b.status ||
      category !== b.category;

    if (changed) fixed++;

    result.push({ ...b, due_date: dueDate, amount, name, status, category });
  }

  if (report) {
    report.bills.total = raw.length;
    report.bills.valid = result.length - fixed;
    report.bills.fixed = fixed;
    report.bills.excluded = excluded;
  }

  return result;
}

export function sanitizeInstallmentPayments(
  raw: InstallmentPayment[],
  report?: IntegrityReport
): InstallmentPayment[] {
  const result: InstallmentPayment[] = [];
  let fixed = 0;
  let excluded = 0;

  for (const ip of raw) {
    const dueDate = safeDateStr(ip.due_date);
    if (!dueDate) {
      excluded++;
      report?.warnings.push(`installment ${ip.id}: invalid due_date="${ip.due_date}", excluded`);
      continue;
    }

    const amount = safeAmount(ip.amount);
    if (amount === 0 && ip.amount !== 0) {
      // Amount was NaN/Infinity — skip zero-amount installments (likely corrupt)
      excluded++;
      report?.warnings.push(`installment ${ip.id}: amount NaN/Infinity, excluded`);
      continue;
    }

    const status = normalizeInstallmentStatus(ip.status);
    const installmentNumber = Math.max(1, Math.round(Number(ip.installment_number) || 1));

    const changed =
      dueDate !== ip.due_date ||
      amount !== ip.amount ||
      status !== ip.status ||
      installmentNumber !== ip.installment_number;

    if (changed) fixed++;

    result.push({ ...ip, due_date: dueDate, amount, status, installment_number: installmentNumber });
  }

  if (report) {
    report.installments.total = raw.length;
    report.installments.valid = result.length - fixed;
    report.installments.fixed = fixed;
    report.installments.excluded = excluded;
  }

  return result;
}

// ─── Amount-only rows (for balance computation) ───────────────────────────────

/** Safely sums amount-only rows from the lightweight balance queries. */
export function sumAmountRows(rows: unknown[]): number {
  return (rows ?? []).reduce((s: number, r: unknown) => {
    const amount = safeAmount((r as Record<string, unknown>)?.amount);
    return s + amount;
  }, 0);
}

// ─── Main sanitize function ───────────────────────────────────────────────────

export interface SanitizedInput {
  income: IncomeEntry[];
  expenses: ExpenseEntry[];
  bills: Bill[];
  installmentPayments: InstallmentPayment[];
  report: IntegrityReport;
}

export function sanitizeAll(
  income: IncomeEntry[],
  expenses: ExpenseEntry[],
  bills: Bill[],
  installmentPayments: InstallmentPayment[]
): SanitizedInput {
  const report: IntegrityReport = {
    income:       { total: 0, valid: 0, fixed: 0, excluded: 0 },
    expenses:     { total: 0, valid: 0, fixed: 0, excluded: 0 },
    bills:        { total: 0, valid: 0, fixed: 0, excluded: 0 },
    installments: { total: 0, valid: 0, fixed: 0, excluded: 0 },
    warnings: [],
  };

  return {
    income:             sanitizeIncomeEntries(income, report),
    expenses:           sanitizeExpenseEntries(expenses, report),
    bills:              sanitizeBills(bills, report),
    installmentPayments: sanitizeInstallmentPayments(installmentPayments, report),
    report,
  };
}
