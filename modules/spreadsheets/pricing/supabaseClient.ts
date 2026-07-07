import { createBrowserClient } from "@supabase/ssr";
import type { PricingDatabase } from "./supabaseSchema";

/**
 * Own Supabase client factory — the spreadsheets module does not import
 * `@/lib/supabase/client` to stay fully independent from the rest of the app.
 * Uses the same project (there is only one Supabase project), just its own
 * typed view of it, scoped to the pricing_* tables.
 */
export function createPricingClient() {
  return createBrowserClient<PricingDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
