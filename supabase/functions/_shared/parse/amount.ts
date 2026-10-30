/**
 * Accepts 3500, 3,500, 3.5k, ₦3500, N3500, NGN3500.
 * Returns whole naira, or null for anything unreadable, zero, negative or with kobo.
 */
export function parseAmount(input: string): number | null {
  const t = input.trim().toLowerCase().replace(/^(₦|ngn|n)\s*/, "").replace(/,/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!m) return null;
  const value = Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1) * 100) / 100;
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}
