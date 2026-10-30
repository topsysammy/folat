import { matchCustomers } from "../match.ts";
import { naira } from "../money.ts";
import { planAmount, progress, type Progress } from "../progress.ts";
import { R } from "../replies.ts";
import type { Repo } from "../repo.ts";
import type { ActionPlan, Customer, IsoDate, Reply, Settings } from "../types.ts";

export const PENDING_MS = 10 * 60 * 1000;

/** Everything a command handler needs for one incoming message. */
export interface Ctx {
  repo: Repo;
  phone: string;
  messageId: string;
  now: Date;
  today: IsoDate;
  settings: Settings;
}

export const text = (t: string): Reply => ({ text: t });

/** Saves the action as pending and asks YES/NO. Nothing is written yet. */
export async function askConfirm(ctx: Ctx, plan: ActionPlan, question: string): Promise<Reply> {
  await ctx.repo.setPending({
    phone: ctx.phone,
    action: "confirm",
    payload: { plan },
    expires_at: new Date(ctx.now.getTime() + PENDING_MS).toISOString(),
  });
  return text(R.confirm(question));
}

/**
 * Finds the customer a command refers to. On several matches it stores a
 * "choose" pending (she replies with a number) and returns the list instead.
 * With `quiet`, a name that is nowhere close returns the generic "I didn't get that".
 */
export async function resolveCustomer(
  ctx: Ctx,
  // deno-lint-ignore no-explicit-any
  command: { name: string; customerId?: number } & Record<string, any>,
  opts: { quiet?: boolean } = {},
): Promise<{ customer: Customer } | { reply: Reply }> {
  const customers = await ctx.repo.listCustomers();
  if (command.customerId !== undefined) {
    const c = customers.find((x) => x.id === command.customerId);
    return c ? { customer: c } : { reply: text(R.failed) };
  }
  if (!customers.length) return { reply: text(opts.quiet ? R.unknown : R.noCustomers) };

  const m = matchCustomers(command.name, customers);
  if (m.kind === "one") return { customer: m.customer };
  if (m.kind === "many") {
    await ctx.repo.setPending({
      phone: ctx.phone,
      action: "choose",
      payload: { command, ids: m.customers.map((c) => c.id) },
      expires_at: new Date(ctx.now.getTime() + PENDING_MS).toISOString(),
    });
    const list = m.customers.map((c, i) => `${i + 1}. ${c.name} (${c.plan})`).join("\n");
    const nums = m.customers.length === 2 ? "1 or 2" : `a number from 1 to ${m.customers.length}`;
    return { reply: text(`I found ${m.customers.length} customers matching "${command.name}":\n${list}\nReply ${nums}`) };
  }
  if (opts.quiet && m.closestDistance > 2) return { reply: text(R.unknown) };
  const names = m.suggestions.map((c) => c.name);
  const didYouMean = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
  return { reply: text(`I couldn't find "${command.name}". Did you mean ${didYouMean}?`) };
}

export function customerProgress(ctx: Ctx, customer: Customer, total: number): Progress {
  return progress(customer, total, ctx.settings, ctx.today);
}

export function planLabel(ctx: Ctx, plan: Customer["plan"]): string {
  return `${plan} (${naira(planAmount(ctx.settings, plan))})`;
}

/** "Behind by ₦7,000 ⚠️" or "Up to date ✅" */
export function scheduleLine(p: Progress): string {
  return p.behindBy > 0 ? `Behind by ${naira(p.behindBy)} ⚠️` : "Up to date ✅";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0];
}
