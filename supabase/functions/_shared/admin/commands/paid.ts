import { naira } from "../../money.ts";
import type { Command } from "../../parse/command.ts";
import { lagosNoon, shortDate } from "../../time.ts";
import type { Reply } from "../../types.ts";
import { askConfirm, type Ctx, resolveCustomer } from "../context.ts";

export async function paid(ctx: Ctx, cmd: Extract<Command, { kind: "paid" }>): Promise<Reply> {
  const r = await resolveCustomer(ctx, cmd);
  if ("reply" in r) return r.reply;
  const c = r.customer;

  const backdated = cmd.date !== null && cmd.date !== ctx.today;
  const paidAt = backdated ? lagosNoon(cmd.date!) : ctx.now.toISOString();
  const when = backdated ? ` on ${shortDate(cmd.date!)}` : "";

  return askConfirm(
    ctx,
    {
      action: "pay",
      payload: { customer_id: c.id, customer_name: c.name, amount: cmd.amount, paid_at: paidAt },
      ops: [{ op: "insert_payment", customer_id: c.id, amount: cmd.amount, paid_at: paidAt }],
    },
    `Log ${naira(cmd.amount)} for ${c.name} (${c.plan})${when}?`,
  );
}
