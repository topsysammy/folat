// End-to-end conversations through the real webhook handler, with an
// in-memory database and a fake WhatsApp.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { handleRequest } from "../supabase/functions/_shared/webhook.ts";
import { ADMIN, Harness, messagePayload, signedRequest, STRANGER } from "./helpers.ts";

const MIN = 60 * 1000;

// ───────── webhook plumbing ─────────

Deno.test("webhook: GET verification", async () => {
  const h = new Harness();
  const ok = await handleRequest(
    new Request("https://x/?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42"),
    h.deps,
  );
  assertEquals([ok.status, await ok.text()], [200, "42"]);
  const bad = await handleRequest(new Request("https://x/?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42"), h.deps);
  assertEquals(bad.status, 403);
});

Deno.test("webhook: invalid signature → 401, nothing processed", async () => {
  const h = new Harness();
  const res = await handleRequest(await signedRequest(messagePayload(ADMIN, "help", "m1"), "wrong-secret"), h.deps);
  assertEquals(res.status, 401);
  assertEquals(h.wa.sent.length, 0);
  assertEquals(h.repo.log.length, 0);

  const unsigned = new Request("https://x/", { method: "POST", body: JSON.stringify(messagePayload(ADMIN, "help", "m2")) });
  assertEquals((await handleRequest(unsigned, h.deps)).status, 401);
});

Deno.test("webhook: other numbers get no reply and nothing is stored", async () => {
  const h = new Harness();
  assertEquals(await h.say("help", { from: STRANGER }), undefined);
  assertEquals(await h.say("paid Tunde 3500", { from: STRANGER }), undefined);
  assertEquals(h.wa.sent.length, 0);
  assertEquals(h.repo.log.length, 0);
  assertEquals(h.repo.settings.admin_last_inbound_at, null);
});

Deno.test("webhook: ADMIN_PHONE and settings.admin_phone must agree", async () => {
  const h = new Harness({ settings: { admin_phone: "2348022222222" } });
  assertEquals(await h.say("help"), undefined);
  assertEquals(h.wa.sent.length, 0);
});

Deno.test("webhook: duplicate message IDs are processed once", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde Adeyemi" });
  await h.say("paid tunde 3500", { id: "dup-1" });
  assertStringIncludes((await h.say("yes", { id: "dup-2" }))!, "Saved");
  assertEquals(await h.say("yes", { id: "dup-2" }), undefined); // Meta re-delivers the YES
  assertEquals(await h.say("paid tunde 3500", { id: "dup-1" }), undefined);
  assertEquals(h.repo.payments.length, 1);
  assertEquals(h.wa.sent.length, 2);
});

Deno.test("webhook: status callbacks are ignored", async () => {
  const h = new Harness();
  const payload = { entry: [{ changes: [{ value: { statuses: [{ id: "x", status: "read" }] } }] }] };
  assertEquals((await handleRequest(await signedRequest(payload), h.deps)).status, 200);
  assertEquals(h.wa.sent.length, 0);
});

Deno.test("webhook: each message updates admin_last_inbound_at before replying", async () => {
  const h = new Harness();
  await h.say("help");
  assertEquals(h.repo.settings.admin_last_inbound_at, h.clock.toISOString());
  assertEquals(h.wa.sent.length, 1);
});

// ───────── recording ─────────

Deno.test("paid: confirm → save → new total", async () => {
  const h = new Harness();
  const t = h.repo.seedCustomer({ name: "Tunde Adeyemi", plan: "weekly", start_date: "2026-10-01" });
  h.repo.seedPayment(t.id, 7000, "2026-10-10T10:00:00Z");

  assertEquals(await h.say("paid tunde 3.5k"), "Log ₦3,500 for Tunde Adeyemi (weekly)? Reply YES or NO");
  assertEquals(h.repo.payments.length, 1); // nothing saved yet
  assertEquals(
    await h.say("yes"),
    "Saved ✅ Tunde Adeyemi has paid ₦10,500 of ₦150,000. ₦139,500 left. Behind by ₦3,500 ⚠️",
  );
  assertEquals(h.repo.total(t.id), 10500);
  assertEquals(h.repo.pending.size, 0);
});

Deno.test("paid: backdated sets paid_at to that day", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  assertStringIncludes((await h.say("paid Tunde 3500 on 2 oct"))!, "on 2 Oct?");
  await h.say("YES");
  assertEquals(h.repo.payments[0].paid_at, "2026-10-02T11:00:00.000Z"); // 12:00 Lagos
});

Deno.test("paid: NO cancels, nothing saved", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  await h.say("paid Tunde 3500");
  assertEquals(await h.say("no"), "OK, cancelled. Nothing was saved.");
  assertEquals(h.repo.payments.length, 0);
});

Deno.test("paid: confirmation expires after 10 minutes", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  await h.say("paid Tunde 3500");
  h.advance(10 * MIN + 1000);
  assertEquals(await h.say("yes"), "That request expired. Please send it again.");
  assertEquals(h.repo.payments.length, 0);
});

Deno.test("paid: a new message cancels the pending one and is handled", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  h.repo.seedCustomer({ name: "Chioma" });
  await h.say("paid Tunde 3500");
  assertStringIncludes((await h.say("paid Chioma 500"))!, "Log ₦500 for Chioma");
  await h.say("yes");
  assertEquals(h.repo.payments.map((p) => [p.customer_id, p.amount]), [[2, 500]]);
});

Deno.test("paid: several matches → pick a number → confirm", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Bisi Ade", plan: "daily" });
  const okon = h.repo.seedCustomer({ name: "Bisi Okon", plan: "weekly" });
  assertEquals(
    await h.say("paid bisi 500"),
    'I found 2 customers matching "bisi":\n1. Bisi Ade (daily)\n2. Bisi Okon (weekly)\nReply 1 or 2',
  );
  assertEquals(await h.say("3"), "Please reply with a number from 1 to 2, or NO to cancel.");
  assertEquals(await h.say("2"), "Log ₦500 for Bisi Okon (weekly)? Reply YES or NO");
  await h.say("yes");
  assertEquals(h.repo.total(okon.id), 500);
});

Deno.test("paid: unknown name → closest 3", async () => {
  const h = new Harness();
  for (const n of ["Tunde", "Chioma", "Bisi", "Ada"]) h.repo.seedCustomer({ name: n });
  assertStringIncludes((await h.say("paid chiomah 500"))!, 'I couldn\'t find "chiomah". Did you mean Chioma');
});

Deno.test("yes with nothing pending", async () => {
  const h = new Harness();
  assertStringIncludes((await h.say("yes"))!, "nothing waiting");
});

Deno.test("database failure → nothing saved, error reply", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  await h.say("paid Tunde 3500");
  h.repo.failNextApply = true;
  assertEquals(await h.say("yes"), "Something went wrong, nothing was saved. Please try again.");
  assertEquals(h.repo.payments.length, 0);
  assertEquals(h.repo.pending.size, 0);
});

// ───────── undo ─────────

Deno.test("undo: payment gets a reversal row, never deleted", async () => {
  const h = new Harness();
  const t = h.repo.seedCustomer({ name: "Tunde" });
  await h.say("paid Tunde 3500");
  await h.say("yes");
  assertEquals(await h.say("undo"), "Undo ₦3,500 for Tunde (28 Oct)? Reply YES or NO");
  assertStringIncludes((await h.say("yes"))!, "Undone ✅ I reversed ₦3,500 for Tunde (28 Oct). Tunde has now paid ₦0.");
  assertEquals(h.repo.payments.length, 2);
  assertEquals(h.repo.payments[1].amount, -3500);
  assertEquals(h.repo.payments[1].reverses_payment_id, h.repo.payments[0].id);
  assertEquals(h.repo.total(t.id), 0);
});

Deno.test("undo: the same action can't be undone twice; next undo targets the one before", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  await h.say("paid Tunde 1000");
  await h.say("yes");
  await h.say("paid Tunde 2000");
  await h.say("yes");
  await h.say("undo");
  await h.say("yes");
  assertStringIncludes((await h.say("undo"))!, "Undo ₦1,000");
  await h.say("yes");
  assertEquals(await h.say("undo"), "There's nothing to undo.");
  assertEquals(h.repo.payments.filter((p) => p.source === "undo").length, 2);
});

Deno.test("undo: edit plan is restored", async () => {
  const h = new Harness();
  const t = h.repo.seedCustomer({ name: "Tunde", plan: "weekly" });
  assertEquals(await h.say("edit tunde plan monthly"), "Change Tunde from weekly to monthly (₦15,000)? Reply YES or NO");
  await h.say("yes");
  assertEquals(h.repo.customers[0].plan, "monthly");
  assertStringIncludes((await h.say("undo"))!, "changing Tunde's plan from weekly to monthly");
  await h.say("yes");
  assertEquals(h.repo.customers.find((c) => c.id === t.id)!.plan, "weekly");
});

Deno.test("undo: remove is restored, add is deactivated", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Chioma" });
  await h.say("remove chioma");
  await h.say("yes");
  assertEquals(h.repo.customers[0].active, false);
  await h.say("undo");
  await h.say("yes");
  assertEquals(h.repo.customers[0].active, true);

  await h.say("add Ada weekly 08033333333");
  await h.say("yes");
  assertEquals(h.repo.customers.length, 2);
  await h.say("undo");
  await h.say("yes");
  assertEquals(h.repo.customers.find((c) => c.name === "Ada")!.active, false);
});

// ───────── customers ─────────

Deno.test("add: creates with today or a past start date", async () => {
  const h = new Harness();
  assertEquals(
    await h.say("add chioma obi weekly 08012345678 from 1 oct"),
    "Add Chioma Obi — weekly (₦3,500), phone 08012345678, starting 1 Oct? Reply YES or NO",
  );
  assertEquals(await h.say("yes"), "Saved ✅ Chioma Obi added — weekly (₦3,500) from 1 Oct.");
  assertEquals(h.repo.customers[0], {
    id: h.repo.customers[0].id, name: "Chioma Obi", phone: "2348012345678", plan: "weekly", start_date: "2026-10-01", active: true,
  });
  await h.say("add Ada daily 08033333333");
  await h.say("yes");
  assertEquals(h.repo.customers[1].start_date, "2026-10-28");
});

Deno.test("add: duplicate active name is refused", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Chioma" });
  assertStringIncludes((await h.say("add chioma weekly 08012345678"))!, "already have a customer called Chioma");
  assertEquals(h.repo.pending.size, 0);
});

Deno.test("rename, edit phone, customers list", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  h.repo.seedCustomer({ name: "Ada Obi", plan: "daily" });
  await h.say("rename tunde to tunde adeyemi");
  assertEquals(await h.say("yes"), "Saved ✅ Tunde is now called Tunde Adeyemi.");
  await h.say("edit tunde phone 08098765432");
  assertEquals(await h.say("yes"), "Saved ✅ Tunde Adeyemi's phone is now 08098765432.");
  assertEquals(await h.say("customers"), "2 active customers:\n1. Ada Obi — daily\n2. Tunde Adeyemi — weekly");
});

// ───────── checking ─────────

Deno.test("<name>: balance card", async () => {
  const h = new Harness();
  const t = h.repo.seedCustomer({ name: "Tunde Adeyemi", plan: "weekly", start_date: "2026-10-01" });
  h.repo.seedPayment(t.id, 3500, "2026-10-01T10:00:00Z");
  h.repo.seedPayment(t.id, 3500, "2026-10-21T10:00:00Z");
  const reply = (await h.say("tunde"))!;
  assertStringIncludes(reply, "*Tunde Adeyemi* — weekly (₦3,500)");
  assertStringIncludes(reply, "Paid: ₦7,000 of ₦150,000");
  assertStringIncludes(reply, "Left: ₦143,000");
  assertStringIncludes(reply, "Last payment: ₦3,500 on 21 Oct");
  assertStringIncludes(reply, "Behind by ₦7,000 ⚠️");
  assertStringIncludes(reply, "Not on track for December");
});

Deno.test("unrecognised text → help hint", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  assertEquals(await h.say("good morning"), "I didn't get that. Send *help* to see what I can do.");
});

Deno.test("history: last 10, newest first, undone payments hidden", async () => {
  const h = new Harness();
  const t = h.repo.seedCustomer({ name: "Tunde" });
  for (let d = 1; d <= 12; d++) h.repo.seedPayment(t.id, 100 * d, `2026-10-${String(d).padStart(2, "0")}T10:00:00Z`);
  const lines = (await h.say("history tunde"))!.split("\n");
  assertEquals(lines[0], "Last 10 payments for Tunde:");
  assertEquals(lines[1], "• 12 Oct — ₦1,200");
  assertEquals(lines[10], "• 3 Oct — ₦300");
});

Deno.test("owing: most behind first with wa.me reminder links", async () => {
  const h = new Harness();
  const a = h.repo.seedCustomer({ name: "Ada Obi", plan: "weekly", start_date: "2026-10-01", phone: "2348012345678" });
  const b = h.repo.seedCustomer({ name: "Bola", plan: "weekly", start_date: "2026-10-01", phone: "2348022222222" });
  h.repo.seedCustomer({ name: "Chi", plan: "daily", start_date: "2026-10-28" });
  h.repo.seedPayment(a.id, 7000, "2026-10-10T10:00:00Z");
  h.repo.seedPayment(b.id, 14000, "2026-10-10T10:00:00Z");
  const reply = (await h.say("owing"))!;
  assertStringIncludes(reply, "2 customers are behind:");
  assertStringIncludes(reply, "1. Ada Obi — owes ₦7,000");
  assertStringIncludes(reply, "2. Chi — owes ₦500");
  assert(reply.indexOf("Ada Obi — owes ₦7,000") < reply.indexOf("Chi — owes"));
  assertStringIncludes(reply, "https://wa.me/2348012345678?text=Hello%20Ada%2C");
  assert(!reply.includes("Bola"));
});

Deno.test("owing: pages of 10", async () => {
  const h = new Harness();
  for (let i = 1; i <= 12; i++) h.repo.seedCustomer({ name: `Person ${String(i).padStart(2, "0")}` });
  const p1 = (await h.say("owing"))!;
  assertStringIncludes(p1, "12 customers are behind:");
  assertStringIncludes(p1, "Send *owing 2* for the next 2.");
  const p2 = (await h.say("owing 2"))!;
  assertStringIncludes(p2, "(page 2 of 2)");
  assertStringIncludes(p2, "11. Person");
  assert(p2.length < 4096);
  assert(p1.length < 4096);
});

Deno.test("today / week / month", async () => {
  const h = new Harness(); // Wed 28 Oct 2026, 10:00 Lagos
  const t = h.repo.seedCustomer({ name: "Tunde" });
  h.repo.seedPayment(t.id, 500, "2026-10-28T08:00:00Z"); // today
  h.repo.seedPayment(t.id, 1000, "2026-10-26T08:00:00Z"); // Monday
  h.repo.seedPayment(t.id, 2000, "2026-10-03T08:00:00Z"); // this month
  h.repo.seedPayment(t.id, 4000, "2026-09-30T23:30:00Z"); // 1 Oct 00:30 Lagos → this month
  assertStringIncludes((await h.say("today"))!, "1 payment, ₦500");
  assertStringIncludes((await h.say("week"))!, "2 payments, ₦1,500");
  assertStringIncludes((await h.say("month"))!, "4 payments, ₦7,500");
});

Deno.test("report: totals, on track, top behind, replies used", async () => {
  const h = new Harness();
  const a = h.repo.seedCustomer({ name: "Ada", plan: "weekly", start_date: "2026-10-01" });
  h.repo.seedCustomer({ name: "Bola", plan: "weekly", start_date: "2026-10-01" });
  h.repo.seedPayment(a.id, 14000, "2026-10-10T10:00:00Z");
  await h.say("help"); // 1 reply used
  const r = (await h.say("report"))!;
  assertStringIncludes(r, "Total collected: ₦14,000");
  assertStringIncludes(r, "Active customers: 2");
  assertStringIncludes(r, "Up to date: 1 · Behind: 1");
  assertStringIncludes(r, "1. Bola — ₦14,000");
  assertStringIncludes(r, "Free replies used this month: 2 of 950");
});

Deno.test("export: one CSV document with customers and payments", async () => {
  const h = new Harness();
  const t = h.repo.seedCustomer({ name: "Tunde, Jr", phone: "2348012345678" });
  h.repo.seedPayment(t.id, 3500, "2026-10-02T11:00:00Z");
  await h.say("export");
  assertEquals(h.wa.sent.length, 1);
  const doc = h.wa.last!;
  assertEquals(doc.filename, "savings-2026-10-28.csv");
  assertStringIncludes(doc.content!, "CUSTOMERS");
  assertStringIncludes(doc.content!, '"Tunde, Jr",0801 234 5678,weekly,2026-10-01,yes,3500');
  assertStringIncludes(doc.content!, "PAYMENTS");
  assertStringIncludes(doc.content!, '2026-10-02,"Tunde, Jr",3500,payment');
  assertStringIncludes(doc.caption!, "1 customers");
});

Deno.test("every message gets exactly one reply", async () => {
  const h = new Harness();
  h.repo.seedCustomer({ name: "Tunde" });
  for (const m of ["help", "paid Tunde 500", "yes", "undo", "no", "owing", "report", "export", "blah", "edit", "3"]) {
    const before = h.wa.sent.length;
    await h.say(m);
    assertEquals(h.wa.sent.length, before + 1, m);
  }
});
