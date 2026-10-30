// THE ONLY WAY A MESSAGE LEAVES THE BOT.
// It enforces the zero-cost rules:
//   • only to the admin (customers are Phase 2 and blocked here),
//   • only inside her 24-hour free reply window,
//   • at most MONTHLY_CAP replies a month, counted before sending,
//   • a warning on her reply from WARN_AT onwards.
import type { Repo } from "./repo.ts";
import { lagosMonthKey, nextMonthLabel } from "./time.ts";
import type { Reply } from "./types.ts";
import type { WhatsAppClient } from "./whatsapp.ts";

export const MONTHLY_CAP = 950;
export const WARN_AT = 700;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type GateResult =
  | { sent: true; used: number }
  | { sent: false; reason: "not_admin" | "customers_disabled" | "window_closed" | "limit" | "send_failed" };

export interface GateDeps {
  repo: Repo;
  wa: WhatsAppClient;
  now: () => Date;
}

export async function sendReply(
  deps: GateDeps,
  to: string,
  reply: Reply,
  audience: "admin" | "customer" = "admin",
): Promise<GateResult> {
  // Phase 1: the bot never talks to customers.
  if (audience === "customer") return { sent: false, reason: "customers_disabled" };

  const settings = await deps.repo.getSettings();
  if (!settings.admin_phone || to !== settings.admin_phone) return { sent: false, reason: "not_admin" };

  const now = deps.now();
  const last = settings.admin_last_inbound_at ? Date.parse(settings.admin_last_inbound_at) : NaN;
  if (!(now.getTime() - last < WINDOW_MS)) return { sent: false, reason: "window_closed" };

  const used = await deps.repo.reserveReply(lagosMonthKey(now), MONTHLY_CAP, audience);
  if (used === null) return { sent: false, reason: "limit" };

  const warning = budgetWarning(used, now);
  try {
    if ("text" in reply) {
      await deps.wa.sendText(to, warning ? `${reply.text}\n\n${warning}` : reply.text);
    } else {
      const caption = warning ? `${reply.caption}\n\n${warning}` : reply.caption;
      await deps.wa.sendDocument(to, reply.document.filename, reply.document.content, caption);
    }
  } catch (e) {
    console.error("send failed", e);
    return { sent: false, reason: "send_failed" };
  }
  return { sent: true, used };
}

export function budgetWarning(used: number, now: Date): string | null {
  if (used >= MONTHLY_CAP) {
    return `⚠️ That was my last free reply this month (${used}/${MONTHLY_CAP}). I'll be quiet until ${nextMonthLabel(now)}.`;
  }
  if (used >= WARN_AT) return `⚠️ ${used} of ${MONTHLY_CAP} free replies used this month.`;
  return null;
}
