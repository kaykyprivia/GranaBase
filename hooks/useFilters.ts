"use client";

/**
 * useFilters — Smart filter ("Funis") state management hook.
 *
 * Persistence: localStorage (zero migration risk, no DB schema changes).
 * Future upgrade path: swap loadFromStorage/saveToStorage with Supabase calls.
 *
 * Features:
 *   - CRUD: create, update, delete, duplicate filters
 *   - Pin/unpin: pinned filters show at the top of the list
 *   - Active filter: at most one active filter at a time
 *   - Search: live text search (no saved filter needed)
 *   - apply(): filters any array of FilterableRecord
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyFilter,
  createFilter,
  quickSearch,
  type CreateFilterData,
  type FilterableRecord,
  type UserFilter,
} from "@/lib/filter-engine";

const STORAGE_KEY = "granabase_v2_filters";
const SCHEMA_VERSION = 1;

interface StorageEnvelope {
  version: number;
  filters: UserFilter[];
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadFromStorage(): UserFilter[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: StorageEnvelope = JSON.parse(raw);
    if (parsed.version !== SCHEMA_VERSION) return []; // schema changed — start fresh
    return Array.isArray(parsed.filters) ? parsed.filters : [];
  } catch {
    return [];
  }
}

function saveToStorage(filters: UserFilter[]): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: StorageEnvelope = { version: SCHEMA_VERSION, filters };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // localStorage might be full or unavailable (private browsing) — fail silently
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseFiltersReturn {
  /** All saved filters, sorted: pinned first, then by createdAt desc. */
  filters: UserFilter[];

  /** ID of the currently active filter (null = no filter active). */
  activeId: string | null;

  /** The active UserFilter object, or null. */
  activeFilter: UserFilter | null;

  /** Live text search query (applied instantly, no save needed). */
  searchQuery: string;

  /** Set the live search text. */
  setSearchQuery: (q: string) => void;

  /** Activate/deactivate a filter by ID. Deactivates current if same ID passed. */
  toggleFilter: (id: string) => void;

  /** Clear active filter. */
  clearActive: () => void;

  /** Create a new filter and return its ID. */
  createFilter: (data: CreateFilterData) => string;

  /** Update an existing filter. */
  updateFilter: (id: string, patch: Partial<Omit<UserFilter, "id" | "createdAt">>) => void;

  /** Delete a filter. If it was active, clears active state. */
  deleteFilter: (id: string) => void;

  /** Duplicate a filter with a new name. */
  duplicateFilter: (id: string) => string | null;

  /** Toggle pinned state. */
  togglePin: (id: string) => void;

  /**
   * Apply the active filter + live search to an array of records.
   * Returns a new array — never mutates input.
   */
  apply: <T extends FilterableRecord>(records: T[]) => T[];

  /** Whether any filter or search is currently active. */
  isFiltering: boolean;
}

export function useFilters(): UseFiltersReturn {
  const [filters, setFilters] = useState<UserFilter[]>(() => loadFromStorage());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Sync to storage whenever filters change
  const saveRef = useRef(saveToStorage);
  saveRef.current = saveToStorage;

  useEffect(() => {
    saveRef.current(filters);
  }, [filters]);

  // If active filter was deleted, clear it
  useEffect(() => {
    if (activeId && !filters.find((f) => f.id === activeId)) {
      setActiveId(null);
    }
  }, [filters, activeId]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const sortedFilters = useMemo(
    () => [...filters].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    }),
    [filters]
  );

  const activeFilter = useMemo(
    () => filters.find((f) => f.id === activeId) ?? null,
    [filters, activeId]
  );

  const isFiltering = Boolean(activeId || searchQuery.trim());

  // ── Mutators ───────────────────────────────────────────────────────────────

  const toggleFilter = useCallback((id: string) => {
    setActiveId((prev) => (prev === id ? null : id));
  }, []);

  const clearActive = useCallback(() => {
    setActiveId(null);
    setSearchQuery("");
  }, []);

  const handleCreate = useCallback((data: CreateFilterData): string => {
    const filter = createFilter(data);
    setFilters((prev) => [...prev, filter]);
    return filter.id;
  }, []);

  const updateFilter = useCallback(
    (id: string, patch: Partial<Omit<UserFilter, "id" | "createdAt">>) => {
      setFilters((prev) =>
        prev.map((f) => f.id === id ? { ...f, ...patch, updatedAt: Date.now() } : f)
      );
    },
    []
  );

  const deleteFilter = useCallback((id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const duplicateFilter = useCallback(
    (id: string): string | null => {
      const source = filters.find((f) => f.id === id);
      if (!source) return null;
      const copy = createFilter({
        ...source,
        name: `${source.name} (cópia)`,
        isPinned: false,
      });
      setFilters((prev) => [...prev, copy]);
      return copy.id;
    },
    [filters]
  );

  const togglePin = useCallback((id: string) => {
    setFilters((prev) =>
      prev.map((f) => f.id === id ? { ...f, isPinned: !f.isPinned, updatedAt: Date.now() } : f)
    );
  }, []);

  // ── Apply ─────────────────────────────────────────────────────────────────

  const apply = useCallback(
    <T extends FilterableRecord>(records: T[]): T[] => {
      let result = records;
      // 1. Apply saved filter (category, terms, amount range, status)
      if (activeFilter) result = applyFilter(result, activeFilter);
      // 2. Apply live text search on top
      if (searchQuery.trim()) result = quickSearch(result, searchQuery);
      return result;
    },
    [activeFilter, searchQuery]
  );

  return {
    filters: sortedFilters,
    activeId,
    activeFilter,
    searchQuery,
    setSearchQuery,
    toggleFilter,
    clearActive,
    createFilter: handleCreate,
    updateFilter,
    deleteFilter,
    duplicateFilter,
    togglePin,
    apply,
    isFiltering,
  };
}
