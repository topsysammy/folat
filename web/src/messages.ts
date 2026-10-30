import { firstName } from "@shared/admin/context.ts";
import { naira } from "@shared/money.ts";
import { lagosDate, shortDate } from "@shared/time.ts";
import type { Payment } from "@shared/types.ts";
import type { Row } from "./store.tsx";

/** wa.me link that opens her own WhatsApp with the customer's statement typed out. Free: it's her message, not a bot's. */
export function statementLink({ customer: c, progress: p }: Row, target: number, last: Payment | undefined): string {
  const lines = [
    `Hello ${firstName(c.name)}, here is your December food savings statement from Folat Place:`,
    "",
    `Paid so far: ${naira(p.total)} of ${naira(target)}`,
  ];
  if (last) lines.push(`Last payment: ${naira(last.amount)} on ${shortDate(lagosDate(last.paid_at))}`);
  lines.push(p.left > 0 ? `Left to pay: ${naira(p.left)}` : "You have reached the target 🎉");
  if (p.behindBy > 0) lines.push(`You are ${naira(p.behindBy)} behind on your ${c.plan} plan.`);
  lines.push("", "Thank you! 🙏");
  return `https://wa.me/${c.phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

/** Nudge for someone who hasn't paid in a while. */
export function checkInLink({ customer: c }: Row, days: number): string {
  const msg = `Hello ${firstName(c.name)}, we haven't seen your December food savings payment for ${days} days. ` +
    "Is everything okay? Thank you! 🙏";
  return `https://wa.me/${c.phone}?text=${encodeURIComponent(msg)}`;
}
