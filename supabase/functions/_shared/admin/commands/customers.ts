import { localPhone } from "../../money.ts";
import type { Command } from "../../parse/command.ts";
import { shortDate } from "../../time.ts";
import type { Reply } from "../../types.ts";
import { askConfirm, type Ctx, planLabel, resolveCustomer, text } from "../context.ts";

type Of<K extends Command["kind"]> = Extract<Command, { kind: K }>;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function add(ctx: Ctx, cmd: Of<"add">): Promise<Reply> {
  const existing = (await ctx.repo.listCustomers()).find((c) => sameName(c.name, cmd.name));
  if (existing) {
    return text(`You already have a customer called ${existing.name}. Please add a surname, e.g. "${cmd.name} Obi".`);
  }
  const start = cmd.startDate ?? ctx.today;
  return askConfirm(
    ctx,
    {
      action: "add",
      payload: { name: cmd.name, plan: cmd.plan, phone: cmd.phone, start_date: start },
      ops: [{ op: "insert_customer", name: cmd.name, plan: cmd.plan, phone: cmd.phone, start_date: start }],
    },
    `Add ${cmd.name} — ${planLabel(ctx, cmd.plan)}, phone ${localPhone(cmd.phone)}, starting ${shortDate(start)}?`,
  );
}

export async function editPlan(ctx: Ctx, cmd: Of<"edit_plan">): Promise<Reply> {
  const r = await resolveCustomer(ctx, cmd);
  if ("reply" in r) return r.reply;
  const c = r.customer;
  if (c.plan === cmd.plan) return text(`${c.name} is already on the ${cmd.plan} plan.`);
  return askConfirm(
    ctx,
    {
      action: "edit_plan",
      payload: { customer_id: c.id, customer_name: c.name, before: { plan: c.plan }, after: { plan: cmd.plan } },
      ops: [{ op: "update_customer", id: c.id, set: { plan: cmd.plan } }],
    },
    `Change ${c.name} from ${c.plan} to ${planLabel(ctx, cmd.plan)}?`,
  );
}

export async function editPhone(ctx: Ctx, cmd: Of<"edit_phone">): Promise<Reply> {
  const r = await resolveCustomer(ctx, cmd);
  if ("reply" in r) return r.reply;
  const c = r.customer;
  if (c.phone === cmd.phone) return text(`${c.name}'s phone is already ${localPhone(c.phone)}.`);
  return askConfirm(
    ctx,
    {
      action: "edit_phone",
      payload: { customer_id: c.id, customer_name: c.name, before: { phone: c.phone }, after: { phone: cmd.phone } },
      ops: [{ op: "update_customer", id: c.id, set: { phone: cmd.phone } }],
    },
    `Change ${c.name}'s phone from ${localPhone(c.phone)} to ${localPhone(cmd.phone)}?`,
  );
}

export async function rename(ctx: Ctx, cmd: Of<"rename">): Promise<Reply> {
  const r = await resolveCustomer(ctx, cmd);
  if ("reply" in r) return r.reply;
  const c = r.customer;
  if (c.name === cmd.newName) return text(`${c.name} already has that name.`);
  const clash = (await ctx.repo.listCustomers()).find((x) => x.id !== c.id && sameName(x.name, cmd.newName));
  if (clash) return text(`You already have a customer called ${clash.name}. Please pick a different name.`);
  return askConfirm(
    ctx,
    {
      action: "rename",
      payload: { customer_id: c.id, customer_name: c.name, before: { name: c.name }, after: { name: cmd.newName } },
      ops: [{ op: "update_customer", id: c.id, set: { name: cmd.newName } }],
    },
    `Rename ${c.name} to ${cmd.newName}?`,
  );
}

export async function remove(ctx: Ctx, cmd: Of<"remove">): Promise<Reply> {
  const r = await resolveCustomer(ctx, cmd);
  if ("reply" in r) return r.reply;
  const c = r.customer;
  return askConfirm(
    ctx,
    {
      action: "remove",
      payload: { customer_id: c.id, customer_name: c.name, before: { active: true }, after: { active: false } },
      ops: [{ op: "update_customer", id: c.id, set: { active: false } }],
    },
    `Remove ${c.name}? Their payment history will be kept.`,
  );
}

export async function listCustomers(ctx: Ctx): Promise<Reply> {
  const customers = await ctx.repo.listCustomers();
  if (!customers.length) return text("You have no active customers yet.");
  const lines = customers.map((c, i) => `${i + 1}. ${c.name} — ${c.plan}`);
  const head = customers.length === 1 ? "1 active customer:" : `${customers.length} active customers:`;
  return text([head, ...lines].join("\n"));
}
