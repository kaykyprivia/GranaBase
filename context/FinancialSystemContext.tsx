"use client";

/**
 * FinancialSystemContext — Global financial data provider for GranaBase V2.
 *
 * Architecture goals:
 * 1. Single fetch per session (not one per page/component)
 * 2. Stale-while-revalidate: show cached data instantly, refresh in background
 * 3. Temporal query scoping: only load recent data (6-month window for income/expenses)
 * 4. Separate lightweight query for all-time balance (just amounts, no metadata)
 * 5. Supabase Realtime: invalidate cache when any financial record changes
 * 6. 5-minute TTL: automatic background refresh on access after stale
 * 7. Debounced reload: realtime events batch-trigger at most once per 2 seconds
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { coerceData } from "@/lib/supabase/casts";
import { buildProjection, dateToStr, getMonthKey } from "@/lib/projection-engine";
import { generateInsights } from "@/lib/insights-engine";
import type { FinancialProjection, ProjectionInput } from "@/lib/projection-engine";
import type { FinancialInsight } from "@/lib/insights-engine";
import type { Bill, ExpenseEntry, IncomeEntry, InstallmentPayment } from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_TTL_MS  = 5 * 60 * 1000;  // 5 minutes before background refresh
const DEBOUNCE_MS   = 2000;             // batch realtime events (2 seconds)
const HISTORY_MONTHS = 6;              // load last 6 months of income/expenses

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialSystemState {
  projection: FinancialProjection;
  insights: FinancialInsight[];
  loading: boolean;       // true only on FIRST load (no cached data yet)
  refreshing: boolean;    // true during background re-fetch (cached data shown)
  lastFetched: number | null;
  error: string | null;
}

interface FinancialSystemContextValue extends FinancialSystemState {
  /** Force a full reload (invalidates cache). */
  reload: () => void;
  /**
   * Raw input data used to build the current projection.
   * Exposed so the Simulation Engine can clone + modify it without re-fetching.
   * null during initial load.
   */
  rawInput: ProjectionInput | null;
}

// ─── Empty projection (safe defaults) ────────────────────────────────────────

const EMPTY_PROJECTION: FinancialProjection = {
  currentBalance: 0,
  walletBalance: 0,
  totalPatrimony: 0,
  monthIncome: 0,
  monthExpenses: 0,
  committedThisMonth: 0,
  committedNext30Days: 0,
  committedTotal: 0,
  pendingBillsAmount: 0,
  pendingInstallmentsAmount: 0,
  freeMoneyReal: 0,
  pressureScore: 0,
  pressureLevel: "healthy",
  committedPercent: 0,
  avgMonthlyIncome: 0,
  projectedIncomeNext30: 0,
  surplusProjected: 0,
  nextRiskDate: null,
  days: [],
  radar: [],
  recurringIncome: [],
};

const INITIAL_STATE: FinancialSystemState = {
  projection: EMPTY_PROJECTION,
  insights: [],
  loading: true,
  refreshing: false,
  lastFetched: null,
  error: null,
};

// ─── Context ──────────────────────────────────────────────────────────────────

const FinancialSystemContext = createContext<FinancialSystemContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FinancialSystemProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FinancialSystemState>(INITIAL_STATE);
  const [rawInput, setRawInput] = useState<ProjectionInput | null>(null);
  const abortRef     = useRef<AbortController | null>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef   = useRef<RealtimeChannel | null>(null);

  // ── Data fetching ───────────────────────────────────────────────────────────

  const fetchData = useCallback(async (isBackground: boolean) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    // Show "refreshing" spinner (not full loading) on background re-fetch
    setState((prev) => ({
      ...prev,
      loading: !isBackground,
      refreshing: isBackground,
      error: null,
    }));

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || signal.aborted) return;

    // ── Temporal scoping ─────────────────────────────────────────────────────
    // Only load the last N months for income/expenses — reduces payload dramatically
    // for users with years of history.
    const now = new Date();
    const historyStart = new Date(now.getFullYear(), now.getMonth() - HISTORY_MONTHS, 1);
    const historyStartStr = dateToStr(historyStart);

    try {
      // ── 7 parallel queries — selective column projection reduces payload ──────
      const [
        { data: incomeAmountsRaw },   // all-time amounts only (for balance)
        { data: expenseAmountsRaw },  // all-time amounts only (for balance)
        { data: recentIncomeRaw },    // last 6 months, full metadata (for analysis)
        { data: recentExpenseRaw },   // last 6 months, full metadata
        { data: billsRaw },           // only non-paid bills
        { data: installmentsRaw },    // all installments (engine filters by status)
        { data: walletRaw },
      ] = await Promise.all([
        // Lightweight all-time totals — only amount column
        supabase.from("income_entries")
          .select("amount")
          .eq("user_id", user.id),
        supabase.from("expense_entries")
          .select("amount")
          .eq("user_id", user.id),

        // Recent detailed data for engine calculations
        supabase.from("income_entries")
          .select("id, description, amount, category, received_at, payment_method")
          .eq("user_id", user.id)
          .gte("received_at", historyStartStr)
          .order("received_at", { ascending: false }),
        supabase.from("expense_entries")
          .select("id, description, amount, category, spent_at, payment_method")
          .eq("user_id", user.id)
          .gte("spent_at", historyStartStr)
          .order("spent_at", { ascending: false }),

        // Only non-paid bills — huge optimization for users with years of history
        supabase.from("bills")
          .select("id, name, amount, due_date, status, category, is_recurring")
          .eq("user_id", user.id)
          .neq("status", "paid"),

        // All installment payments (engine filters by status internally)
        supabase.from("installment_payments")
          .select("id, installment_id, installment_number, due_date, amount, status, paid_at")
          .eq("user_id", user.id),

        supabase.from("investment_wallets")
          .select("total_balance")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

      if (signal.aborted) return;

      // ── Pre-compute all-time balance from lightweight queries ──────────────
      const allTimeIncome  = (incomeAmountsRaw ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
      const allTimeExpense = (expenseAmountsRaw ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
      const currentBalance = allTimeIncome - allTimeExpense;

      const income             = coerceData<IncomeEntry[]>(recentIncomeRaw ?? []);
      const expenses           = coerceData<ExpenseEntry[]>(recentExpenseRaw ?? []);
      const bills              = coerceData<Bill[]>(billsRaw ?? []);
      const installmentPayments = coerceData<InstallmentPayment[]>(installmentsRaw ?? []);
      const walletBalance      = coerceData<{ total_balance: number } | null>(walletRaw ?? null)?.total_balance ?? 0;

      const projInput: ProjectionInput = {
        income,
        expenses,
        bills,
        installmentPayments,
        walletBalance,
        currentBalance, // pre-computed from all-time data
      };

      const projection = buildProjection(projInput);
      const insights   = generateInsights(income, expenses, bills, installmentPayments);

      if (signal.aborted) return;

      // Store raw input for simulation engine (clone avoids mutation issues)
      setRawInput(projInput);

      setState({
        projection,
        insights,
        loading: false,
        refreshing: false,
        lastFetched: Date.now(),
        error: null,
      });
    } catch (err) {
      if (signal.aborted) return;
      const message = err instanceof Error ? err.message : "Erro ao carregar dados";
      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: message,
      }));
    }
  }, []);

  // ── Cache-aware reload ──────────────────────────────────────────────────────

  const checkAndLoad = useCallback((force = false) => {
    const { lastFetched, loading, refreshing } = state;

    if (loading || refreshing) return; // already loading

    const isStale = lastFetched === null || Date.now() - lastFetched > CACHE_TTL_MS;

    if (force || lastFetched === null) {
      fetchData(false); // first load — show spinner
    } else if (isStale) {
      fetchData(true);  // stale — refresh in background, keep showing data
    }
    // else: cache is fresh, do nothing
  }, [state, fetchData]);

  const reload = useCallback(() => {
    fetchData(false);
  }, [fetchData]);

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchData(false);
    return () => { abortRef.current?.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Stale check on visibility change ────────────────────────────────────────
  // Refresh data when user returns to the tab after TTL expires

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        checkAndLoad();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [checkAndLoad]);

  // ── Legacy event bus (wallet:changed from WalletContributionProvider) ────────

  useEffect(() => {
    const handler = () => fetchData(true);
    window.addEventListener("wallet:changed", handler);
    return () => window.removeEventListener("wallet:changed", handler);
  }, [fetchData]);

  // ── Supabase Realtime subscriptions ─────────────────────────────────────────
  // Automatically invalidate and refresh when any financial record changes.
  // Events are debounced so rapid changes (bulk imports) don't trigger N reloads.

  useEffect(() => {
    const supabase = createClient();
    let userId: string | null = null;

    const debouncedReload = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchData(true); // background refresh — keeps UI responsive
      }, DEBOUNCE_MS);
    };

    const setupRealtime = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;

      // Subscribe to all financial tables for this user
      // Requires "postgres_changes" enabled for these tables in Supabase Dashboard
      channelRef.current = supabase
        .channel(`financial-${userId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "income_entries",       filter: `user_id=eq.${userId}` }, debouncedReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "expense_entries",      filter: `user_id=eq.${userId}` }, debouncedReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "bills",                filter: `user_id=eq.${userId}` }, debouncedReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "installment_payments", filter: `user_id=eq.${userId}` }, debouncedReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "investment_wallets",   filter: `user_id=eq.${userId}` }, debouncedReload)
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [fetchData]);

  // ── Context value (memoized to prevent unnecessary re-renders) ───────────────

  const value = useMemo<FinancialSystemContextValue>(
    () => ({ ...state, reload, rawInput }),
    [state, reload, rawInput]
  );

  return (
    <FinancialSystemContext.Provider value={value}>
      {children}
    </FinancialSystemContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useFinancialSystem(): FinancialSystemContextValue {
  const ctx = useContext(FinancialSystemContext);
  if (!ctx) {
    throw new Error("useFinancialSystem must be used within a FinancialSystemProvider");
  }
  return ctx;
}

/**
 * Backwards-compatible alias for pages that previously used useCockpitData.
 * Consuming from the global context means no duplicate fetches.
 */
export function useCockpitFromContext() {
  const { projection, insights, loading, refreshing, reload } = useFinancialSystem();
  return {
    projection,
    insights,
    loading,
    refreshing,
    reload,
  };
}
