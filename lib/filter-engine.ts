/**
 * Filter Engine — GranaBase V2 "Funis" System
 *
 * Provides smart, semantic filtering across all financial record types.
 *
 * Design goals:
 *   - Works on ANY financial record (income, expense, bill, installment)
 *   - Fuzzy text matching with accent/case normalization (Portuguese-friendly)
 *   - Composable rules (AND logic within a filter, OR within terms)
 *   - Zero-dependency: pure TypeScript, no libraries
 *   - O(n) per filter application — no O(n²) searches
 *   - Memoization-friendly: stable inputs → stable outputs
 *
 * Semantic aliases built-in:
 *   "agua" matches "SABESP", "saneamento básico", "água"
 *   "luz" matches "ENEL", "CELPE", "CEMIG", "energia elétrica"
 *   etc.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** The categories of financial records that can be filtered. */
export type FilterTarget = "all" | "income" | "expense" | "bill" | "installment";

/** A generic financial record that any of the filter functions can operate on. */
export interface FilterableRecord {
  id: string;
  description?: string;
  name?: string;         // bills use 'name'
  category?: string;
  amount: number;
  status?: string;
  spent_at?: string;
  received_at?: string;
  due_date?: string;
}

/** A user-defined smart filter ("Funil"). */
export interface UserFilter {
  id: string;
  name: string;
  color: string;         // Tailwind color key: "profit" | "expense" | "accent" | etc.
  icon: string;          // emoji or lucide icon name
  terms: string[];       // text terms to search (fuzzy, OR logic)
  categories: string[];  // exact category names (OR logic)
  amountMin?: number;
  amountMax?: number;
  statuses: string[];    // exact status values (OR logic)
  target: FilterTarget;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CreateFilterData = Omit<UserFilter, "id" | "createdAt" | "updatedAt">;

// ─── Semantic alias map (Portuguese financial context) ────────────────────────

/**
 * Semantic aliases: if the user's filter term matches a key, we also search
 * for all the associated aliases. This makes "agua" find "SABESP", etc.
 *
 * Keys are normalized (lowercase, no accents).
 */
const SEMANTIC_ALIASES: Record<string, string[]> = {
  agua:       ["sabesp", "sanepar", "caema", "saneago", "saneamento", "compesa"],
  luz:        ["enel", "cemig", "celpe", "coelba", "coelce", "light", "energia eletrica", "eletropaulo"],
  internet:   ["claro", "vivo", "oi fibra", "tim fibra", "net", "brt"],
  telefone:   ["tim", "vivo", "claro", "oi", "nextel"],
  aluguel:    ["condominio", "iptu", "locacao"],
  mercado:    ["supermercado", "carrefour", "extra", "atacadao", "assai", "dia", "pao de acucar"],
  delivery:   ["ifood", "rappi", "uber eats", "james"],
  combustivel:["gasolina", "etanol", "diesel", "posto", "shell", "petrobras"],
  streaming:  ["netflix", "spotify", "disney", "amazon prime", "hbo", "globoplay", "youtube premium"],
  academia:   ["smartfit", "bodytech", "bluefit"],
  saude:      ["unimed", "bradesco saude", "sulamerica", "hapvida", "farmacia", "drogaria"],
  transporte: ["uber", "99", "metro", "onibus", "cartao transporte"],
  banco:      ["bb", "itau", "bradesco", "santander", "caixa", "nubank", "inter"],
};

// ─── Text normalization ───────────────────────────────────────────────────────

/**
 * Normalize text for comparison:
 * 1. Lowercase
 * 2. Remove diacritics (accents: á→a, ç→c, ã→a, etc.)
 * 3. Collapse multiple spaces
 * 4. Trim
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a text contains a search term (including semantic aliases).
 * Both inputs should already be pre-normalized for performance.
 */
function textContainsTerm(normalizedText: string, normalizedTerm: string): boolean {
  // Direct substring match
  if (normalizedText.includes(normalizedTerm)) return true;
  // Also check aliases
  const aliases = SEMANTIC_ALIASES[normalizedTerm];
  if (aliases) {
    return aliases.some((a) => normalizedText.includes(normalizeText(a)));
  }
  return false;
}

// ─── Record text extraction ───────────────────────────────────────────────────

/** Returns normalized searchable text for any financial record. */
export function getRecordText(record: FilterableRecord): string {
  return normalizeText([
    record.description ?? "",
    record.name ?? "",
    record.category ?? "",
  ].filter(Boolean).join(" "));
}

// ─── Filter matching ──────────────────────────────────────────────────────────

/**
 * Check whether a single record matches a filter.
 * Returns true only if ALL active conditions match.
 */
export function matchesFilter(record: FilterableRecord, filter: UserFilter): boolean {
  // Text terms (OR logic: any term must appear in the record text)
  if (filter.terms.length > 0) {
    const text = getRecordText(record);
    const anyTermMatches = filter.terms.some((term) =>
      textContainsTerm(text, normalizeText(term))
    );
    if (!anyTermMatches) return false;
  }

  // Categories (OR logic)
  if (filter.categories.length > 0) {
    const recordCategory = record.category ?? "";
    if (!filter.categories.includes(recordCategory)) return false;
  }

  // Amount bounds
  if (filter.amountMin !== undefined && record.amount < filter.amountMin) return false;
  if (filter.amountMax !== undefined && record.amount > filter.amountMax) return false;

  // Status (OR logic)
  if (filter.statuses.length > 0) {
    const recordStatus = record.status ?? "";
    if (!filter.statuses.includes(recordStatus)) return false;
  }

  return true;
}

/**
 * Apply a filter to an array of records.
 * Returns a new array (never mutates input).
 * Returns all records if filter is null/undefined.
 */
export function applyFilter<T extends FilterableRecord>(
  records: T[],
  filter: UserFilter | null
): T[] {
  if (!filter) return records;
  return records.filter((r) => matchesFilter(r, filter));
}

// ─── Quick text search (no saved filter needed) ───────────────────────────────

/**
 * Real-time text search across all record fields, including semantic aliases.
 * Use this for the search bar — no filter object needed.
 */
export function quickSearch<T extends FilterableRecord>(records: T[], query: string): T[] {
  if (!query.trim()) return records;
  const normalizedQuery = normalizeText(query);
  const terms = normalizedQuery.split(" ").filter(Boolean);

  return records.filter((record) => {
    const text = getRecordText(record);
    // All query words must be found (AND logic for multi-word queries)
    return terms.every((term) => textContainsTerm(text, term));
  });
}

// ─── Filter stats ─────────────────────────────────────────────────────────────

export interface FilterStats {
  totalMatches: number;
  totalAmount: number;
  avgAmount: number;
  monthlyAvg: number;   // rough monthly estimate
}

export function computeFilterStats(records: FilterableRecord[]): FilterStats {
  const totalAmount = records.reduce((s, r) => s + r.amount, 0);
  const totalMatches = records.length;
  const avgAmount = totalMatches > 0 ? totalAmount / totalMatches : 0;
  // Monthly average assumes records span ~3 months on average
  const monthlyAvg = totalAmount / Math.max(3, 1);

  return { totalMatches, totalAmount, avgAmount, monthlyAvg };
}

// ─── Preset color palette for filters ────────────────────────────────────────

export const FILTER_COLORS: Array<{
  key: string;
  label: string;
  bg: string;
  text: string;
  border: string;
}> = [
  { key: "accent",  label: "Azul",   bg: "bg-accent/15",  text: "text-accent",  border: "border-accent/30"  },
  { key: "profit",  label: "Verde",  bg: "bg-profit/15",  text: "text-profit",  border: "border-profit/30"  },
  { key: "expense", label: "Vermelho", bg: "bg-expense/15", text: "text-expense", border: "border-expense/30" },
  { key: "warning", label: "Amarelo", bg: "bg-warning/15", text: "text-warning", border: "border-warning/30" },
  { key: "growth",  label: "Roxo",   bg: "bg-growth/15",  text: "text-growth",  border: "border-growth/30"  },
];

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createFilter(data: CreateFilterData): UserFilter {
  const now = Date.now();
  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    ...data,
  };
}

function generateId(): string {
  // Use crypto.randomUUID if available, fallback to timestamp-based
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
