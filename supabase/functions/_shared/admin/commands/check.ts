import { localPhone, naira } from "../../money.ts";
import type { Command } from "../../parse/command.ts";
import { livePayments } from "../../progress.ts";
import { lagosDate, shortDate } from "../../time.ts";
import type { Reply } from "../../types.ts";
import { type Ctx, customerProgress, planLabel, resolveCustomer, scheduleLine, text } from "../context.ts";

type Of<K extends Command["kind"]> = Extract<Command, { kind: K }>;

/** "<name>" — one customer's balance. */
export async function check(ctx: Ctx, cmd: Of<"check">): Promise<Reply> {
  const r = await resolveCustomer(ctx, cmd, { quiet: true });
  if ("reply" in r) return r.reply;
  const c = r.customer;

  const payments = await ctx.repo.listPayments({ customerId: c.id });
  const total = payments.reduce((s, p) => s + p.amount, 0);
  const last = livePayments(payments).at(-1);
  const p = customerProgress(ctx, c, total);

  const lines = [
    `*${c.name}* — ${planLabel(ctx, c.plan)}`,
    `Paid: ${naira(total)} of ${naira(ctx.settings.target)}`,
    p.left > 0 ? `Left: ${naira(p.left)}` : `Target reached 🎉${p.surplus ? ` Extra: ${naira(p.surplus)}` : ""}`,
    last ? `Last payment: ${naira(last.amount)} on ${shortDate(lagosDate(last.paid_at))}` : "No payments yet",
    scheduleLine(p),
    p.onTrack
      ? "On track for December 🎯"
      : `Not on track for December (about ${naira(p.projected)} at this pace)`,
    `Phone: ${localPhone(c.phone)}`,
  ];
  return text(lines.join("\n"));
}

/** "history <name>" — last 10 payments, newest first. */
export async function history(ctx: Ctx, cmd: Of<"history">): Promise<Reply> {
  const r = await resolveCustomer(ctx, cmd);
  if ("reply" in r) return r.reply;
  const c = r.customer;

  const payments = livePayments(await ctx.repo.listPayments({ customerId: c.id })).slice(-10).reverse();
  if (!payments.length) return text(`No payments yet for ${c.name}.`);
  const lines = payments.map((p) => `• ${shortDate(lagosDate(p.paid_at))} — ${naira(p.amount)}`);
  const head = payments.length === 1 ? `Last payment for ${c.name}:` : `Last ${payments.length} payments for ${c.name}:`;
  return text([head, ...lines].join("\n"));
}
