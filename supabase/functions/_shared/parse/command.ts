// Turns one WhatsApp message into a typed Command. Pure: no DB, no clock
// (today is passed in), so it is fully unit-testable.
import { PLANS, type IsoDate, type Plan } from "../types.ts";
import { parseAmount } from "./amount.ts";
import { parseDate } from "./date.ts";
import { parsePhone } from "./phone.ts";
import { EXAMPLES } from "../replies.ts";

/** Commands that look up a customer carry `customerId` once a "reply 1 or 2" choice is made. */
type Named = { name: string; customerId?: number };

export type Command =
  | ({ kind: "paid"; amount: number; date: IsoDate | null } & Named)
  | ({ kind: "edit_plan"; plan: Plan } & Named)
  | ({ kind: "edit_phone"; phone: string } & Named)
  | ({ kind: "rename"; newName: string } & Named)
  | ({ kind: "remove" } & Named)
  | ({ kind: "history" } & Named)
  | ({ kind: "check" } & Named)
  | { kind: "add"; name: string; plan: Plan; phone: string; startDate: IsoDate | null }
  | { kind: "owing"; page: number }
  | { kind: "undo" | "customers" | "today" | "week" | "month" | "report" | "export" | "help" }
  | { kind: "yes" | "no" }
  | { kind: "number"; n: number }
  | { kind: "error"; message: string };

const SIMPLE: Record<string, Command["kind"]> = {
  undo: "undo",
  customers: "customers",
  customer: "customers",
  list: "customers",
  today: "today",
  week: "week",
  month: "month",
  report: "report",
  export: "export",
  help: "help",
  menu: "help",
  "?": "help",
};

const YES = new Set(["yes", "y", "yeah", "yea", "yep", "ok", "okay"]);
const NO = new Set(["no", "n", "nope", "cancel"]);

const err = (message: string): Command => ({ kind: "error", message });

export function parseCommand(input: string, today: IsoDate): Command {
  const text = input.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "");
  const lower = text.toLowerCase();
  const words = text.split(" ");
  const keyword = words[0].toLowerCase();
  const rest = words.slice(1);

  if (YES.has(lower)) return { kind: "yes" };
  if (NO.has(lower)) return { kind: "no" };
  if (/^\d{1,2}$/.test(lower)) return { kind: "number", n: Number(lower) };
  if (SIMPLE[lower]) return { kind: SIMPLE[lower] } as Command;

  switch (keyword) {
    case "paid":
    case "pay":
      return parsePaid(rest, today);
    case "add":
      return parseAdd(rest, today);
    case "edit":
      return parseEdit(rest);
    case "rename":
      return parseRename(rest);
    case "remove":
    case "delete":
      return rest.length ? { kind: "remove", name: rest.join(" ") } : err(`Please send it like: ${EXAMPLES.remove}`);
    case "history":
      return rest.length ? { kind: "history", name: rest.join(" ") } : err(`Please send it like: ${EXAMPLES.history}`);
    case "owing":
    case "owe": {
      if (!rest.length) return { kind: "owing", page: 1 };
      const page = Number(rest[0]);
      return rest.length === 1 && Number.isInteger(page) && page > 0
        ? { kind: "owing", page }
        : err(`Please send it like: owing  (or owing 2 for the next page)`);
    }
  }
  return { kind: "check", name: text };
}

function parsePaid(tokens: string[], today: IsoDate): Command {
  const usage = `Please send it like: ${EXAMPLES.paid}`;
  let date: IsoDate | null = null;
  const onIdx = lastIndexOfWord(tokens, "on");
  if (onIdx >= 2) {
    const d = parseDate(tokens.slice(onIdx + 1).join(" "), today);
    if (!d.ok) return err(dateError(d.reason, "2 oct"));
    date = d.date;
    tokens = tokens.slice(0, onIdx);
  }
  if (tokens.length < 2) return err(usage);

  // Usually "<name> <amount>", but also accept "<amount> <name>".
  let amountToken = tokens[tokens.length - 1];
  let nameTokens = tokens.slice(0, -1);
  if (!looksLikeAmount(amountToken) && looksLikeAmount(tokens[0])) {
    amountToken = tokens[0];
    nameTokens = tokens.slice(1);
  }
  if (!looksLikeAmount(amountToken)) return err(usage);
  const amount = parseAmount(amountToken);
  if (amount === null) return err("The amount must be more than ₦0, in whole naira. Example: 3500 or 3.5k");
  return { kind: "paid", name: nameTokens.join(" "), amount, date };
}

function parseAdd(tokens: string[], today: IsoDate): Command {
  const usage = `Please send it like: ${EXAMPLES.add}`;
  let startDate: IsoDate | null = null;
  const fromIdx = lastIndexOfWord(tokens, "from");
  if (fromIdx >= 3) {
    const d = parseDate(tokens.slice(fromIdx + 1).join(" "), today);
    if (!d.ok) return err(dateError(d.reason, "1 oct"));
    startDate = d.date;
    tokens = tokens.slice(0, fromIdx);
  }
  const planIdx = tokens.findIndex((t, i) => i > 0 && PLANS.includes(t.toLowerCase() as Plan));
  if (planIdx < 1) return err(usage);
  const phoneText = tokens.slice(planIdx + 1).join(" ");
  if (!phoneText) return err(usage);
  const phone = parsePhone(phoneText);
  if (!phone) return err(`I couldn't read the phone number "${phoneText}". Example: 08012345678`);
  return {
    kind: "add",
    name: tidyName(tokens.slice(0, planIdx).join(" ")),
    plan: tokens[planIdx].toLowerCase() as Plan,
    phone,
    startDate,
  };
}

function parseEdit(tokens: string[]): Command {
  const usage = `Please send it like: ${EXAMPLES.editPlan}  or  ${EXAMPLES.editPhone}`;
  const idx = Math.max(lastIndexOfWord(tokens, "plan"), lastIndexOfWord(tokens, "phone"));
  if (idx < 1 || idx === tokens.length - 1) return err(usage);
  const name = tokens.slice(0, idx).join(" ");
  const value = tokens.slice(idx + 1).join(" ");
  if (tokens[idx].toLowerCase() === "plan") {
    const plan = value.toLowerCase() as Plan;
    return PLANS.includes(plan) ? { kind: "edit_plan", name, plan } : err("The plan must be daily, weekly or monthly.");
  }
  const phone = parsePhone(value);
  return phone ? { kind: "edit_phone", name, phone } : err(`I couldn't read the phone number "${value}". Example: 08012345678`);
}

function parseRename(tokens: string[]): Command {
  const idx = tokens.findIndex((t, i) => i > 0 && t.toLowerCase() === "to");
  if (idx < 1 || idx === tokens.length - 1) return err(`Please send it like: ${EXAMPLES.rename}`);
  return { kind: "rename", name: tokens.slice(0, idx).join(" "), newName: tidyName(tokens.slice(idx + 1).join(" ")) };
}

function lastIndexOfWord(tokens: string[], word: string): number {
  for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].toLowerCase() === word) return i;
  return -1;
}

function looksLikeAmount(token: string): boolean {
  return /^(₦|ngn|n)?-?[\d,]+(\.\d+)?k?$/i.test(token);
}

function dateError(reason: "invalid" | "future", example: string): string {
  return reason === "future"
    ? "That date is in the future. Please use today or an earlier date."
    : `I couldn't read that date. Try like: ${example}, 01/10 or yesterday`;
}

/** "chioma obi" → "Chioma Obi"; leaves names she typed with capitals alone. */
export function tidyName(name: string): string {
  const n = name.trim().replace(/\s+/g, " ");
  return n === n.toLowerCase() ? n.replace(/(^|[\s-])(\p{L})/gu, (_, p, c) => p + c.toUpperCase()) : n;
}
