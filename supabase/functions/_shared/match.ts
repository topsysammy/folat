import type { Customer } from "./types.ts";

export type MatchResult =
  | { kind: "one"; customer: Customer }
  | { kind: "many"; customers: Customer[] }
  | { kind: "none"; suggestions: Customer[]; closestDistance: number };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Partial, case-insensitive name lookup over the given (active) customers.
 * Exact full name wins; otherwise any name containing the query matches.
 */
export function matchCustomers(query: string, customers: Customer[]): MatchResult {
  const q = norm(query);
  const exact = customers.filter((c) => norm(c.name) === q);
  if (exact.length === 1) return { kind: "one", customer: exact[0] };

  const partial = customers.filter((c) => norm(c.name).includes(q));
  if (partial.length === 1) return { kind: "one", customer: partial[0] };
  if (partial.length > 1) {
    return { kind: "many", customers: [...partial].sort((a, b) => a.name.localeCompare(b.name)) };
  }

  const scored = customers
    .map((c) => ({ c, d: nameDistance(q, norm(c.name)) }))
    .sort((a, b) => a.d - b.d || a.c.name.localeCompare(b.c.name));
  return {
    kind: "none",
    suggestions: scored.slice(0, 3).map((s) => s.c),
    closestDistance: scored.length ? scored[0].d : Infinity,
  };
}

/** Best edit distance between the query and the whole name or any single word of it. */
function nameDistance(q: string, name: string): number {
  return Math.min(levenshtein(q, name), ...name.split(" ").map((w) => levenshtein(q, w)));
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
