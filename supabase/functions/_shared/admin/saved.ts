import { localPhone, naira } from "../money.ts";
import { shortDate } from "../time.ts";
import type { ActionPlan, Reply } from "../types.ts";
import { type Ctx, customerProgress, planLabel, scheduleLine, text } from "./context.ts";

/**
 * The reply after a confirmed action has been saved. Runs AFTER the commit, so
 * if anything here fails we still tell her it was saved (never "nothing was saved").
 */
export async function savedReply(ctx: Ctx, plan: ActionPlan, result: Record<string, number>): Promise<Reply> {
  try {
    return text(await describeSaved(ctx, plan, result));
  } catch (e) {
    console.error("saved reply failed", e);
    return text("Saved ✅");
  }
}

async function describeSaved(ctx: Ctx, { action, payload: p }: ActionPlan, _result: Record<string, number>) {
  switch (action) {
    case "pay": {
      const { name, total, line } = await balance(ctx, p.customer_id);
      return `Saved ✅ ${name} has paid ${naira(total)} of ${naira(ctx.settings.target)}. ${line}`;
    }
    case "add":
      return `Saved ✅ ${p.name} added — ${planLabel(ctx, p.plan)} from ${shortDate(p.start_date)}.`;
    case "edit_plan":
      return `Saved ✅ ${p.customer_name} is now on the ${planLabel(ctx, p.after.plan)} plan.`;
    case "edit_phone":
      return `Saved ✅ ${p.customer_name}'s phone is now ${localPhone(p.after.phone)}.`;
    case "rename":
      return `Saved ✅ ${p.before.name} is now called ${p.after.name}.`;
    case "remove":
      return `Done ✅ ${p.customer_name} has been removed. Their history is kept. Send *undo* if this was a mistake.`;
    case "undo": {
      let out = `Undone ✅ I reversed ${p.undone}.`;
      if (p.undone_action === "pay") {
        const { name, total } = await balance(ctx, p.customer_id);
        out += ` ${name} has now paid ${naira(total)}.`;
      }
      return out;
    }
    default:
      return "Saved ✅";
  }
}

async function balance(ctx: Ctx, customerId: number) {
  const [customers, payments] = await Promise.all([
    ctx.repo.listCustomers({ includeInactive: true }),
    ctx.repo.listPayments({ customerId }),
  ]);
  const c = customers.find((x) => x.id === customerId)!;
  const total = payments.reduce((s, x) => s + x.amount, 0);
  const pr = customerProgress(ctx, c, total);
  const left = pr.left > 0 ? `${naira(pr.left)} left.` : "Target reached 🎉";
  return { name: c.name, total, line: `${left} ${scheduleLine(pr)}` };
}
