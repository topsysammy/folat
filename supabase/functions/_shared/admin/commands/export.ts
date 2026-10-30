import { localPhone } from "../../money.ts";
import { progress, totalsByCustomer } from "../../progress.ts";
import { lagosDate, shortDate } from "../../time.ts";
import type { Customer, IsoDate, Payment, Reply, Settings } from "../../types.ts";
import type { Ctx } from "../context.ts";

/** "export" — one CSV (customers with totals, then every payment) sent as a WhatsApp document. */
export async function exportCsv(ctx: Ctx): Promise<Reply> {
  const [customers, payments] = await Promise.all([
    ctx.repo.listCustomers({ includeInactive: true }),
    ctx.repo.listPayments(),
  ]);
  return {
    document: {
      filename: `savings-${ctx.today}.csv`,
      content: buildCsv(customers, payments, ctx.settings, ctx.today),
    },
    caption: `Your records as of ${shortDate(ctx.today)}: ${customers.length} customers, ${payments.length} payment entries. ` +
      "Keep this file safe 📁",
  };
}

export function buildCsv(customers: Customer[], payments: Payment[], settings: Settings, today: IsoDate): string {
  const totals = totalsByCustomer(payments);
  const names = new Map(customers.map((c) => [c.id, c.name]));

  const rows: (string | number)[][] = [
    ["CUSTOMERS"],
    ["Name", "Phone", "Plan", "Start date", "Active", "Total paid", "Left to target", "Expected so far", "Behind by", "On track for December"],
    ...customers.map((c) => {
      const total = totals.get(c.id) ?? 0;
      const p = progress(c, total, settings, today);
      return [c.name, spacedPhone(c.phone), c.plan, c.start_date, c.active ? "yes" : "no", total, p.left, p.expected, p.behindBy, p.onTrack ? "yes" : "no"];
    }),
    [],
    ["PAYMENTS"],
    ["Date", "Customer", "Amount", "Type", "Entry ID", "Reverses entry"],
    ...payments.map((p) => [
      lagosDate(p.paid_at),
      names.get(p.customer_id) ?? `#${p.customer_id}`,
      p.amount,
      p.source === "undo" ? "undo" : "payment",
      p.id,
      p.reverses_payment_id ?? "",
    ]),
  ];
  // BOM so Excel reads names with accents correctly.
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** 0801 234 5678 — the spaces stop Excel turning it into a number and dropping the 0. */
function spacedPhone(phone: string): string {
  const d = localPhone(phone);
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
}

function cell(v: string | number): string {
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`; // never let a name run as a spreadsheet formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
