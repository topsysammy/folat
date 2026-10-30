/**
 * Accepts 08012345678, +2348012345678, 2348012345678 (spaces/dashes allowed).
 * Returns 234XXXXXXXXXX, or null if it isn't a Nigerian mobile number.
 */
export function parsePhone(input: string): string | null {
  const d = input.trim().replace(/[\s\-().]/g, "").replace(/^\+/, "");
  if (/^0[789]\d{9}$/.test(d)) return `234${d.slice(1)}`;
  if (/^234[789]\d{9}$/.test(d)) return d;
  if (/^[789]\d{9}$/.test(d)) return `234${d}`;
  return null;
}
