/**
 * Own copy of the same two-line typing escape hatch the main app uses
 * (lib/supabase/casts.ts) to work around @supabase/supabase-js's strict
 * generic inference on insert/update payloads. Not imported from `lib/` —
 * this is a generic TypeScript workaround, not app logic.
 */
export function coerceMutation<T>(value: T): never {
  return value as never;
}

export function coerceData<T>(value: unknown): T {
  return value as T;
}
