import { localPhone, naira } from "../../money.ts";
import { lagosDate, shortDate } from "../../time.ts";
import type { ActionPlan, LogEntry, Op, Reply } from "../../types.ts";
import { askConfirm, type Ctx, text } from "../context.ts";
import { R } from "../../replies.ts";

export async function undo(ctx: Ctx): Promise<Reply> {
  const last = await ctx.repo.lastUndoable();
  if (!last) return text(R.nothingToUndo);
  const plan = planUndo(last);
  return askConfirm(ctx, plan, `Undo ${describe(last)}?`);
}

/** Works out how to reverse a saved action. Never deletes: writes a reversal or restores the old values. */
export function planUndo(entry: LogEntry): ActionPlan {
  const p = entry.payload;
  const ops: Op[] = [];
  switch (entry.action) {
    case "pay":
      ops.push({
        op: "insert_payment",
        customer_id: p.customer_id,
        amount: -p.amount,
        paid_at: p.paid_at,
        source: "undo",
        reverses_payment_id: p.payment_id,
        note: `undo of payment #${p.payment_id}`,
      });
      break;
    case "add":
      ops.push({ op: "update_customer", id: p.customer_id, set: { active: false } });
      break;
    case "edit_plan":
    case "edit_phone":
    case "rename":
    case "remove":
      ops.push({ op: "update_customer", id: p.customer_id, set: p.before });
      break;
    default:
      throw new Error(`Cannot undo action ${entry.action}`);
  }
  ops.push({ op: "mark_reversed", log_id: entry.id });
  return {
    action: "undo",
    payload: { log_id: entry.id, undone: describe(entry), customer_id: p.customer_id, undone_action: entry.action },
    ops,
  };
}

/** Plain-English description of a saved action, e.g. "₦3,500 for Tunde Adeyemi (2 Oct)". */
export function describe(entry: Pick<LogEntry, "action" | "payload">): string {
  const p = entry.payload;
  switch (entry.action) {
    case "pay":
      return `${naira(p.amount)} for ${p.customer_name} (${shortDate(lagosDate(p.paid_at))})`;
    case "add":
      return `adding ${p.name} (${p.plan})`;
    case "edit_plan":
      return `changing ${p.customer_name}'s plan from ${p.before.plan} to ${p.after.plan}`;
    case "edit_phone":
      return `changing ${p.customer_name}'s phone from ${localPhone(p.before.phone)} to ${localPhone(p.after.phone)}`;
    case "rename":
      return `renaming ${p.before.name} to ${p.after.name}`;
    case "remove":
      return `removing ${p.customer_name}`;
    default:
      return entry.action;
  }
}
