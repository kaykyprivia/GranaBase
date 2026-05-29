/**
 * useCockpitData — Thin consumer of FinancialSystemContext.
 *
 * Previously this hook fetched data itself (causing duplicate queries on each page).
 * Now it simply reads from the global FinancialSystemProvider, which manages:
 *   - Single fetch per session
 *   - 5-minute TTL cache with stale-while-revalidate
 *   - Supabase Realtime invalidation
 *   - Temporal query scoping
 *
 * All pages using this hook share the same cached data — zero duplicate requests.
 */
export { useCockpitFromContext as useCockpitData } from "@/context/FinancialSystemContext";
