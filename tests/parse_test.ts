import { assertEquals } from "jsr:@std/assert@1";
import { parseAmount } from "../supabase/functions/_shared/parse/amount.ts";
import { parsePhone } from "../supabase/functions/_shared/parse/phone.ts";
import { parseDate } from "../supabase/functions/_shared/parse/date.ts";
import { parseCommand, tidyName } from "../supabase/functions/_shared/parse/command.ts";

const TODAY = "2026-10-28";

Deno.test("amount: accepted forms", () => {
  for (const s of ["3500", "3,500", "3.5k", "3.5K", "₦3500", "N3500", "n3,500", "NGN3500", "₦3.5k"]) {
    assertEquals(parseAmount(s), 3500, s);
  }
  assertEquals(parseAmount("15k"), 15000);
  assertEquals(parseAmount("1.1k"), 1100);
  assertEquals(parseAmount("500"), 500);
});

Deno.test("amount: rejects zero, negative, kobo and junk", () => {
  for (const s of ["0", "0k", "-500", "₦-500", "350.50", "abc", "", "3.5m", "1.2345k"]) {
    assertEquals(parseAmount(s), null, s);
  }
});

Deno.test("phone: normalises to 234XXXXXXXXXX", () => {
  for (const s of ["08012345678", "+2348012345678", "2348012345678", "0801 234 5678", "0801-234-5678", "8012345678"]) {
    assertEquals(parsePhone(s), "2348012345678", s);
  }
  assertEquals(parsePhone("07031234567"), "2347031234567");
});

Deno.test("phone: rejects bad numbers", () => {
  for (const s of ["0801234567", "080123456789", "12345", "+4479111222333", "0601234567 8", "phone"]) {
    assertEquals(parsePhone(s), null, s);
  }
});

Deno.test("date: words and formats", () => {
  assertEquals(parseDate("today", TODAY), { ok: true, date: "2026-10-28" });
  assertEquals(parseDate("yesterday", TODAY), { ok: true, date: "2026-10-27" });
  assertEquals(parseDate("1 oct", TODAY), { ok: true, date: "2026-10-01" });
  assertEquals(parseDate("1st October", TODAY), { ok: true, date: "2026-10-01" });
  assertEquals(parseDate("Oct 2", TODAY), { ok: true, date: "2026-10-02" });
  assertEquals(parseDate("01/10", TODAY), { ok: true, date: "2026-10-01" });
  assertEquals(parseDate("5/3/2026", TODAY), { ok: true, date: "2026-03-05" });
  assertEquals(parseDate("5-3-26", TODAY), { ok: true, date: "2026-03-05" });
});

Deno.test("date: no year → most recent past date", () => {
  assertEquals(parseDate("5 dec", TODAY), { ok: true, date: "2025-12-05" });
  assertEquals(parseDate("28 oct", TODAY), { ok: true, date: "2026-10-28" });
  assertEquals(parseDate("29 oct", TODAY), { ok: true, date: "2025-10-29" });
});

Deno.test("date: rejects invalid and future", () => {
  assertEquals(parseDate("31/02", TODAY), { ok: false, reason: "invalid" });
  assertEquals(parseDate("32 oct", TODAY), { ok: false, reason: "invalid" });
  assertEquals(parseDate("1 foo", TODAY), { ok: false, reason: "invalid" });
  assertEquals(parseDate("tomorrow", TODAY), { ok: false, reason: "invalid" });
  assertEquals(parseDate("1/11/2026", TODAY), { ok: false, reason: "future" });
});

Deno.test("command: paid", () => {
  assertEquals(parseCommand("paid Tunde 3500", TODAY), { kind: "paid", name: "Tunde", amount: 3500, date: null });
  assertEquals(parseCommand("PAID tunde adeyemi 3.5k", TODAY), { kind: "paid", name: "tunde adeyemi", amount: 3500, date: null });
  assertEquals(parseCommand("paid Tunde 3500 on 2 oct", TODAY), { kind: "paid", name: "Tunde", amount: 3500, date: "2026-10-02" });
  assertEquals(parseCommand("paid Tunde ₦3,500 on yesterday", TODAY), { kind: "paid", name: "Tunde", amount: 3500, date: "2026-10-27" });
  assertEquals(parseCommand("paid 3500 Tunde", TODAY), { kind: "paid", name: "Tunde", amount: 3500, date: null });
  assertEquals(parseCommand("  paid   Tunde   3500  ", TODAY).kind, "paid");
});

Deno.test("command: paid errors", () => {
  assertEquals(parseCommand("paid Tunde", TODAY).kind, "error");
  assertEquals(parseCommand("paid", TODAY).kind, "error");
  const zero = parseCommand("paid Tunde 0", TODAY);
  assertEquals(zero.kind, "error");
  assertEquals(parseCommand("paid Tunde -500", TODAY).kind, "error");
  const future = parseCommand("paid Tunde 3500 on 1/12/2026", TODAY);
  assertEquals(future.kind === "error" && future.message.includes("future"), true);
});

Deno.test("command: add", () => {
  assertEquals(parseCommand("add Chioma weekly 08012345678", TODAY), {
    kind: "add", name: "Chioma", plan: "weekly", phone: "2348012345678", startDate: null,
  });
  assertEquals(parseCommand("add chioma obi Monthly +234 801 234 5678 from 1 oct", TODAY), {
    kind: "add", name: "Chioma Obi", plan: "monthly", phone: "2348012345678", startDate: "2026-10-01",
  });
  assertEquals(parseCommand("add Chioma weekly", TODAY).kind, "error");
  assertEquals(parseCommand("add Chioma 08012345678", TODAY).kind, "error");
  assertEquals(parseCommand("add Chioma weekly 123", TODAY).kind, "error");
});

Deno.test("command: edit, rename, remove, history", () => {
  assertEquals(parseCommand("edit Tunde plan monthly", TODAY), { kind: "edit_plan", name: "Tunde", plan: "monthly" });
  assertEquals(parseCommand("edit Tunde Adeyemi phone 08098765432", TODAY), {
    kind: "edit_phone", name: "Tunde Adeyemi", phone: "2348098765432",
  });
  assertEquals(parseCommand("edit Tunde plan yearly", TODAY).kind, "error");
  assertEquals(parseCommand("edit Tunde", TODAY).kind, "error");
  assertEquals(parseCommand("rename Tunde to tunde adeyemi", TODAY), { kind: "rename", name: "Tunde", newName: "Tunde Adeyemi" });
  assertEquals(parseCommand("rename Tunde to", TODAY).kind, "error");
  assertEquals(parseCommand("remove Chioma", TODAY), { kind: "remove", name: "Chioma" });
  assertEquals(parseCommand("history Tunde", TODAY), { kind: "history", name: "Tunde" });
});

Deno.test("command: keywords, answers and fallback", () => {
  for (const k of ["undo", "customers", "today", "week", "month", "report", "export", "help"]) {
    assertEquals(parseCommand(k.toUpperCase(), TODAY).kind, k);
  }
  assertEquals(parseCommand("owing", TODAY), { kind: "owing", page: 1 });
  assertEquals(parseCommand("owing 2", TODAY), { kind: "owing", page: 2 });
  assertEquals(parseCommand("YES", TODAY), { kind: "yes" });
  assertEquals(parseCommand("y", TODAY), { kind: "yes" });
  assertEquals(parseCommand("No", TODAY), { kind: "no" });
  assertEquals(parseCommand("2", TODAY), { kind: "number", n: 2 });
  assertEquals(parseCommand("Tunde", TODAY), { kind: "check", name: "Tunde" });
});

Deno.test("tidyName", () => {
  assertEquals(tidyName("chioma obi"), "Chioma Obi");
  assertEquals(tidyName("McDonald"), "McDonald");
  assertEquals(tidyName("ada-eze"), "Ada-Eze");
});
