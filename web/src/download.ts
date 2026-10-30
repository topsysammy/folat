import { buildCsv } from "@shared/admin/commands/export.ts";
import type { Store } from "./store.tsx";

/** Same CSV as the bot's "export": customers with totals, then every payment. */
export function downloadCsv(s: Store) {
  const csv = buildCsv(s.customers, s.payments, s.settings, s.today);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `savings-${s.today}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
