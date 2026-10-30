import { naira } from "../../money.ts";
import { livePayments } from "../../progress.ts";
import { addDays, dayLabel, lagosDate, lagosStartOf, monthStart, shortDate, weekStart } from "../../time.ts";
import type { Reply } from "../../types.ts";
import { type Ctx, text } from "../context.ts";

const MAX_LINES = 40;

/** "today" / "week" / "month" — payments in the period and the total. */
export async function periodSummary(ctx: Ctx, period: "today" | "week" | "month"): Promise<Reply> {
  const start = period === "today" ? ctx.today : period === "week" ? weekStart(ctx.today) : monthStart(ctx.today);
  const label = period === "today"
    ? `Today (${dayLabel(ctx.today)})`
    : period === "week"
    ? `This week (from ${dayLabel(start)})`
    : `This month (from ${shortDate(start)})`;

  const [payments, customers] = await Promise.all([
    ctx.repo.listPayments({ from: lagosStartOf(start), to: lagosStartOf(addDays(ctx.today, 1)) }),
    ctx.repo.listCustomers({ includeInactive: true }),
  ]);
  const live = livePayments(payments).reverse(); // newest first
  if (!live.length) return text(`${label}: no payments yet.`);

  const names = new Map(customers.map((c) => [c.id, c.name]));
  const total = live.reduce((s, p) => s + p.amount, 0);
  const lines = live.slice(0, MAX_LINES).map((p) => {
    const when = period === "today" ? "" : ` (${dayLabel(lagosDate(p.paid_at))})`;
    return `• ${names.get(p.customer_id) ?? "Unknown"} — ${naira(p.amount)}${when}`;
  });
  if (live.length > MAX_LINES) lines.push(`…and ${live.length - MAX_LINES} more (send *export* for all)`);

  const count = live.length === 1 ? "1 payment" : `${live.length} payments`;
  return text([`${label}: ${count}, ${naira(total)}`, ...lines].join("\n"));
}
