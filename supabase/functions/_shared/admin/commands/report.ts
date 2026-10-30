import { naira } from "../../money.ts";
import { type Progress, totalsByCustomer } from "../../progress.ts";
import { MONTHLY_CAP } from "../../sendGate.ts";
import { lagosMonthKey, shortDate } from "../../time.ts";
import type { Customer, Reply } from "../../types.ts";
import { type Ctx, customerProgress, firstName, text } from "../context.ts";

export const OWING_PAGE_SIZE = 10;

interface Row {
  customer: Customer;
  progress: Progress;
}

async function activeRows(ctx: Ctx): Promise<{ rows: Row[]; collected: number }> {
  const [customers, payments] = await Promise.all([ctx.repo.listCustomers(), ctx.repo.listPayments()]);
  const totals = totalsByCustomer(payments);
  const rows = customers.map((customer) => ({
    customer,
    progress: customerProgress(ctx, customer, totals.get(customer.id) ?? 0),
  }));
  return { rows, collected: payments.reduce((s, p) => s + p.amount, 0) };
}

const mostBehindFirst = (rows: Row[]) =>
  rows.filter((r) => r.progress.behindBy > 0).sort((a, b) => b.progress.behindBy - a.progress.behindBy);

export function reminderLink(customer: Customer, behindBy: number): string {
  const msg = `Hello ${firstName(customer.name)}, this is a gentle reminder about your December food savings. ` +
    `You are ${naira(behindBy)} behind. Thank you! 🙏`;
  return `https://wa.me/${customer.phone}?text=${encodeURIComponent(msg)}`;
}

/** "owing" — everyone behind, most behind first, with a tap-to-send reminder link each. */
export async function owing(ctx: Ctx, page: number): Promise<Reply> {
  const behind = mostBehindFirst((await activeRows(ctx)).rows);
  if (!behind.length) return text("Everyone is up to date 🎉");

  const pages = Math.ceil(behind.length / OWING_PAGE_SIZE);
  if (page > pages) return text(`There's no page ${page}. Send *owing* to start again.`);
  const start = (page - 1) * OWING_PAGE_SIZE;
  const slice = behind.slice(start, start + OWING_PAGE_SIZE);

  const head = behind.length === 1 ? "1 customer is behind:" : `${behind.length} customers are behind:`;
  const lines = slice.map((r, i) =>
    `${start + i + 1}. ${r.customer.name} — owes ${naira(r.progress.behindBy)}\n${
      reminderLink(r.customer, r.progress.behindBy)
    }`
  );
  const out = [page > 1 ? `${head} (page ${page} of ${pages})` : head, ...lines];
  if (page < pages) {
    const next = Math.min(OWING_PAGE_SIZE, behind.length - start - OWING_PAGE_SIZE);
    out.push(`Send *owing ${page + 1}* for the next ${next}.`);
  }
  return text(out.join("\n\n"));
}

/** "report" — the big picture plus this month's reply budget. */
export async function report(ctx: Ctx): Promise<Reply> {
  const [{ rows, collected }, used] = await Promise.all([
    activeRows(ctx),
    ctx.repo.getUsage(lagosMonthKey(ctx.now)),
  ]);
  const behind = mostBehindFirst(rows);
  const onTrack = rows.filter((r) => r.progress.onTrack).length;

  const lines = [
    `📊 *Report — ${shortDate(ctx.today)}*`,
    `Total collected: ${naira(collected)}`,
    `Active customers: ${rows.length}`,
    `Up to date: ${rows.length - behind.length} · Behind: ${behind.length}`,
    `On track for December: ${onTrack} of ${rows.length}`,
  ];
  if (behind.length) {
    lines.push("", "*Most behind:*");
    behind.slice(0, 5).forEach((r, i) => lines.push(`${i + 1}. ${r.customer.name} — ${naira(r.progress.behindBy)}`));
  }
  // +1 counts this reply, which the send gate reserves just after this.
  lines.push("", `Free replies used this month: ${Math.min(used + 1, MONTHLY_CAP)} of ${MONTHLY_CAP}`);
  return text(lines.join("\n"));
}
