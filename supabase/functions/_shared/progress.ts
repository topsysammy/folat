// THE single place that decides "behind" and "on track for December".
// Every command (<name>, paid, owing, report, export) uses progress().
import { daysBetween, monthsBetween } from "./time.ts";
import type { Customer, IsoDate, Payment, Plan, Settings } from "./types.ts";

export function planAmount(settings: Settings, plan: Plan): number {
  return plan === "daily"
    ? settings.daily_amount
    : plan === "weekly"
    ? settings.weekly_amount
    : settings.monthly_amount;
}

/** Periods from `start` up to and including the period containing `end`. 0 if end is before start. */
export function periodsBetween(plan: Plan, start: IsoDate, end: IsoDate): number {
  const days = daysBetween(start, end);
  if (days < 0) return 0;
  if (plan === "daily") return days + 1;
  if (plan === "weekly") return Math.floor(days / 7) + 1;
  return monthsBetween(start, end) + 1;
}

export interface Progress {
  total: number;
  expected: number;
  behindBy: number; // 0 when up to date
  left: number; // left to target, 0 once reached
  surplus: number; // paid beyond target
  onTrack: boolean; // current pace reaches target by distribution date
  projected: number; // total at current pace by distribution date
}

export function progress(
  customer: Pick<Customer, "plan" | "start_date">,
  total: number,
  settings: Settings,
  today: IsoDate,
): Progress {
  const amount = planAmount(settings, customer.plan);
  const elapsed = periodsBetween(customer.plan, customer.start_date, today);
  const expected = Math.min(amount * elapsed, settings.target);
  const horizon = Math.max(
    periodsBetween(customer.plan, customer.start_date, settings.distribution_date),
    elapsed,
  );
  // Not started yet → assume they'll pay the plan amount every period.
  const projected = elapsed > 0 ? (total / elapsed) * horizon : total + amount * horizon;
  return {
    total,
    expected,
    behindBy: Math.max(expected - total, 0),
    left: Math.max(settings.target - total, 0),
    surplus: Math.max(total - settings.target, 0),
    onTrack: total >= settings.target || projected >= settings.target,
    projected: Math.round(projected),
  };
}

/** Payments that still count: drops undo rows and the payments they reversed. */
export function livePayments(payments: Payment[]): Payment[] {
  const reversed = new Set(payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id));
  return payments.filter((p) => p.source !== "undo" && !reversed.has(p.id));
}

export function totalsByCustomer(payments: Payment[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const p of payments) totals.set(p.customer_id, (totals.get(p.customer_id) ?? 0) + p.amount);
  return totals;
}
