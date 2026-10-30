// Turns ONE admin message into exactly ONE reply.
// Handles the YES/NO + "reply 1 or 2" flow, then dispatches commands.
import { type Command, parseCommand } from "../parse/command.ts";
import { HELP, R } from "../replies.ts";
import type { Repo } from "../repo.ts";
import { lagosDate } from "../time.ts";
import type { ActionPlan, Pending, Reply } from "../types.ts";
import { type Ctx, text } from "./context.ts";
import { check, history } from "./commands/check.ts";
import { add, editPhone, editPlan, listCustomers, remove, rename } from "./commands/customers.ts";
import { exportCsv } from "./commands/export.ts";
import { paid } from "./commands/paid.ts";
import { periodSummary } from "./commands/periods.ts";
import { owing, report } from "./commands/report.ts";
import { undo } from "./commands/undo.ts";
import { savedReply } from "./saved.ts";

export async function handleAdminMessage(
  deps: { repo: Repo; now: Date },
  msg: { phone: string; messageId: string; text: string },
): Promise<Reply> {
  const settings = await deps.repo.getSettings();
  const ctx: Ctx = {
    repo: deps.repo,
    phone: msg.phone,
    messageId: msg.messageId,
    now: deps.now,
    today: lagosDate(deps.now),
    settings,
  };
  const cmd = parseCommand(msg.text, ctx.today);
  const answer = cmd.kind === "yes" || cmd.kind === "no" || cmd.kind === "number";

  const pending = await ctx.repo.getPending(ctx.phone);
  if (pending) {
    if (answer) {
      if (Date.parse(pending.expires_at) <= ctx.now.getTime()) {
        await ctx.repo.clearPending(ctx.phone);
        return text(R.expired);
      }
      return resolvePending(ctx, pending, cmd);
    }
    // Any other message cancels what was waiting, then is handled normally.
    await ctx.repo.clearPending(ctx.phone);
  } else if (answer) {
    return text(R.nothingPending);
  }
  return dispatch(ctx, cmd);
}

async function resolvePending(ctx: Ctx, pending: Pending, cmd: Command): Promise<Reply> {
  if (cmd.kind === "no") {
    await ctx.repo.clearPending(ctx.phone);
    return text(R.cancelled);
  }

  if (pending.action === "choose") {
    const ids: number[] = pending.payload.ids;
    if (cmd.kind !== "number" || cmd.n < 1 || cmd.n > ids.length) return text(R.pickNumber(ids.length));
    await ctx.repo.clearPending(ctx.phone);
    return dispatch(ctx, { ...pending.payload.command, customerId: ids[cmd.n - 1] });
  }

  // confirm
  if (cmd.kind !== "yes") return text(R.yesOrNo);
  const plan: ActionPlan = pending.payload.plan;
  let result: Record<string, number>;
  try {
    result = await ctx.repo.applyAction({ messageId: ctx.messageId, phone: ctx.phone, ...plan });
  } catch (e) {
    // Rolled back in the database. Drop the pending so a stray YES can't retry it.
    await ctx.repo.clearPending(ctx.phone).catch(() => {});
    throw e;
  }
  return savedReply(ctx, plan, result);
}

function dispatch(ctx: Ctx, cmd: Command): Promise<Reply> | Reply {
  switch (cmd.kind) {
    case "paid":
      return paid(ctx, cmd);
    case "undo":
      return undo(ctx);
    case "add":
      return add(ctx, cmd);
    case "edit_plan":
      return editPlan(ctx, cmd);
    case "edit_phone":
      return editPhone(ctx, cmd);
    case "rename":
      return rename(ctx, cmd);
    case "remove":
      return remove(ctx, cmd);
    case "customers":
      return listCustomers(ctx);
    case "check":
      return check(ctx, cmd);
    case "history":
      return history(ctx, cmd);
    case "owing":
      return owing(ctx, cmd.page);
    case "today":
    case "week":
    case "month":
      return periodSummary(ctx, cmd.kind);
    case "report":
      return report(ctx);
    case "export":
      return exportCsv(ctx);
    case "help":
      return text(HELP);
    case "error":
      return text(cmd.message);
    default:
      return text(R.unknown);
  }
}
