import { assertEquals } from "jsr:@std/assert@1";
import { matchCustomers } from "../supabase/functions/_shared/match.ts";
import { livePayments, periodsBetween, progress } from "../supabase/functions/_shared/progress.ts";
import type { Customer, Payment } from "../supabase/functions/_shared/types.ts";
import { defaultSettings } from "./helpers.ts";

const c = (id: number, name: string): Customer => ({
  id, name, phone: "2348012345678", plan: "weekly", start_date: "2026-01-01", active: true,
});
const PEOPLE = [c(1, "Tunde Adeyemi"), c(2, "Bisi Ade"), c(3, "Bisi Okon"), c(4, "Chioma Obi"), c(5, "Ada Obi")];

Deno.test("match: exact full name wins over partial", () => {
  const people = [c(1, "Ada"), c(2, "Ada Obi")];
  assertEquals(matchCustomers("ada", people), { kind: "one", customer: people[0] });
});

Deno.test("match: partial, case-insensitive", () => {
  const r = matchCustomers("TUNDE", PEOPLE);
  assertEquals(r.kind === "one" && r.customer.id, 1);
  const r2 = matchCustomers("adeyemi", PEOPLE);
  assertEquals(r2.kind === "one" && r2.customer.id, 1);
});

Deno.test("match: several → numbered choice list", () => {
  const r = matchCustomers("bisi", PEOPLE);
  assertEquals(r.kind === "many" && r.customers.map((x) => x.name), ["Bisi Ade", "Bisi Okon"]);
});

Deno.test("match: none → closest 3", () => {
  const r = matchCustomers("Chiomah", PEOPLE);
  assertEquals(r.kind, "none");
  if (r.kind === "none") {
    assertEquals(r.suggestions.length, 3);
    assertEquals(r.suggestions[0].name, "Chioma Obi");
    assertEquals(r.closestDistance, 1);
  }
});

Deno.test("periods: current period is included", () => {
  assertEquals(periodsBetween("daily", "2026-10-01", "2026-10-01"), 1);
  assertEquals(periodsBetween("daily", "2026-10-01", "2026-10-28"), 28);
  assertEquals(periodsBetween("weekly", "2026-10-01", "2026-10-07"), 1);
  assertEquals(periodsBetween("weekly", "2026-10-01", "2026-10-08"), 2);
  assertEquals(periodsBetween("monthly", "2026-01-15", "2026-02-14"), 1);
  assertEquals(periodsBetween("monthly", "2026-01-15", "2026-02-15"), 2);
  assertEquals(periodsBetween("monthly", "2026-01-31", "2026-10-28"), 9);
  assertEquals(periodsBetween("weekly", "2026-11-01", "2026-10-28"), 0); // starts in the future
});

Deno.test("progress: behind vs up to date", () => {
  const s = defaultSettings();
  const weekly = { plan: "weekly" as const, start_date: "2026-10-01" };
  // 28 Oct = week 4 → expected 4 × 3,500 = 14,000
  assertEquals(progress(weekly, 7000, s, "2026-10-28").behindBy, 7000);
  assertEquals(progress(weekly, 14000, s, "2026-10-28").behindBy, 0);
  assertEquals(progress(weekly, 20000, s, "2026-10-28").behindBy, 0);
  assertEquals(progress(weekly, 7000, s, "2026-10-28").expected, 14000);
});

Deno.test("progress: expected is capped at the target, surplus shown", () => {
  const s = defaultSettings();
  const p = progress({ plan: "monthly", start_date: "2025-01-01" }, 160000, s, "2026-10-28");
  assertEquals(p.expected, 150000);
  assertEquals(p.behindBy, 0);
  assertEquals(p.left, 0);
  assertEquals(p.surplus, 10000);
  assertEquals(p.onTrack, true);
});

Deno.test("progress: on track for December uses current pace", () => {
  const s = defaultSettings({ distribution_date: "2026-12-20" });
  // Monthly from 20 Feb → 11 periods by 20 Dec. 9 periods elapsed on 28 Oct.
  const m = { plan: "monthly" as const, start_date: "2026-02-20" };
  assertEquals(progress(m, 9 * 15000, s, "2026-10-28").onTrack, true); // 135k/9 × 11 = 165k
  assertEquals(progress(m, 9 * 12000, s, "2026-10-28").onTrack, false); // 108k/9 × 11 = 132k
  assertEquals(progress(m, 9 * 12000, s, "2026-10-28").projected, 132000);
});

Deno.test("progress: future start → nothing expected yet", () => {
  const s = defaultSettings();
  const p = progress({ plan: "weekly", start_date: "2026-11-01" }, 0, s, "2026-10-28");
  assertEquals(p.expected, 0);
  assertEquals(p.behindBy, 0);
});

Deno.test("livePayments hides undone payments and their reversals", () => {
  const ps: Payment[] = [
    { id: 1, customer_id: 1, amount: 3500, source: "admin", reverses_payment_id: null, paid_at: "2026-10-01T11:00:00Z" },
    { id: 2, customer_id: 1, amount: 500, source: "admin", reverses_payment_id: null, paid_at: "2026-10-02T11:00:00Z" },
    { id: 3, customer_id: 1, amount: -500, source: "undo", reverses_payment_id: 2, paid_at: "2026-10-02T11:00:00Z" },
  ];
  assertEquals(livePayments(ps).map((p) => p.id), [1]);
});
