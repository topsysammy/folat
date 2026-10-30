import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { MONTHLY_CAP, sendReply, WARN_AT } from "../supabase/functions/_shared/sendGate.ts";
import { ADMIN, FakeWhatsApp, MemoryRepo, STRANGER } from "./helpers.ts";

const NOW = new Date("2026-10-28T09:00:00Z");
const HOUR = 60 * 60 * 1000;

function setup(lastInbound: Date | null, used = 0) {
  const repo = new MemoryRepo({ admin_last_inbound_at: lastInbound?.toISOString() ?? null });
  if (used) repo.usage.set("2026-10", { admin: used, customer: 0 });
  const wa = new FakeWhatsApp();
  return { repo, wa, deps: { repo, wa, now: () => NOW } };
}

Deno.test("gate: sends inside the 24h window and counts it", async () => {
  const { repo, wa, deps } = setup(new Date(NOW.getTime() - HOUR));
  assertEquals(await sendReply(deps, ADMIN, { text: "hi" }), { sent: true, used: 1 });
  assertEquals(wa.sent, [{ to: ADMIN, body: "hi" }]);
  assertEquals(await repo.getUsage("2026-10"), 1);
});

Deno.test("gate: window closed → no send, not counted", async () => {
  const { repo, wa, deps } = setup(new Date(NOW.getTime() - 24 * HOUR));
  assertEquals(await sendReply(deps, ADMIN, { text: "hi" }), { sent: false, reason: "window_closed" });
  assertEquals(wa.sent.length, 0);
  assertEquals(await repo.getUsage("2026-10"), 0);
});

Deno.test("gate: admin never messaged → no send", async () => {
  const { wa, deps } = setup(null);
  assertEquals((await sendReply(deps, ADMIN, { text: "hi" })).sent, false);
  assertEquals(wa.sent.length, 0);
});

Deno.test("gate: monthly limit reached → blocked, no API call", async () => {
  const { repo, wa, deps } = setup(new Date(NOW.getTime() - HOUR), MONTHLY_CAP);
  assertEquals(await sendReply(deps, ADMIN, { text: "hi" }), { sent: false, reason: "limit" });
  assertEquals(wa.sent.length, 0);
  assertEquals(await repo.getUsage("2026-10"), MONTHLY_CAP);
});

Deno.test("gate: customer replies count toward the same cap", async () => {
  const { repo, wa, deps } = setup(new Date(NOW.getTime() - HOUR));
  repo.usage.set("2026-10", { admin: MONTHLY_CAP - 10, customer: 10 });
  assertEquals((await sendReply(deps, ADMIN, { text: "hi" })).sent, false);
  assertEquals(wa.sent.length, 0);
});

Deno.test("gate: the cap resets in a new month", async () => {
  const { repo, wa, deps } = setup(new Date(NOW.getTime() - HOUR), MONTHLY_CAP);
  repo.usage.set("2026-09", { admin: MONTHLY_CAP, customer: 0 });
  repo.usage.delete("2026-10");
  assertEquals((await sendReply(deps, ADMIN, { text: "hi" })).sent, true);
  assertEquals(wa.sent.length, 1);
});

Deno.test("gate: no warning before 700, warning from 700, last-reply note at 950", async () => {
  let s = setup(new Date(NOW.getTime() - HOUR), WARN_AT - 2);
  await sendReply(s.deps, ADMIN, { text: "a" });
  assertEquals(s.wa.last?.body, "a");

  s = setup(new Date(NOW.getTime() - HOUR), WARN_AT - 1);
  await sendReply(s.deps, ADMIN, { text: "a" });
  assertStringIncludes(s.wa.last!.body!, "700 of 950 free replies used");

  s = setup(new Date(NOW.getTime() - HOUR), MONTHLY_CAP - 1);
  await sendReply(s.deps, ADMIN, { text: "a" });
  assertStringIncludes(s.wa.last!.body!, "last free reply");
  assertStringIncludes(s.wa.last!.body!, "1 Nov");
});

Deno.test("gate: warning goes on the document caption too", async () => {
  const { wa, deps } = setup(new Date(NOW.getTime() - HOUR), 800);
  await sendReply(deps, ADMIN, { document: { filename: "x.csv", content: "a,b" }, caption: "Your file" });
  assertStringIncludes(wa.last!.caption!, "801 of 950");
  assertEquals(wa.sent.length, 1);
});

Deno.test("gate: refuses anyone but the admin, and all customer replies", async () => {
  const { wa, deps } = setup(new Date(NOW.getTime() - HOUR));
  assertEquals(await sendReply(deps, STRANGER, { text: "hi" }), { sent: false, reason: "not_admin" });
  assertEquals(await sendReply(deps, ADMIN, { text: "hi" }, "customer"), { sent: false, reason: "customers_disabled" });
  assertEquals(wa.sent.length, 0);
});
