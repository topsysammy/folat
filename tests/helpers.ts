// In-memory Repo that mirrors the SQL in the migration (apply_action and
// reserve_reply semantics, constraints, all-or-nothing), plus a fake WhatsApp.
import type { PaymentFilter, Repo } from "../supabase/functions/_shared/repo.ts";
import type {
  Customer,
  LogEntry,
  Op,
  Payment,
  Pending,
  Settings,
} from "../supabase/functions/_shared/types.ts";
import type { WhatsAppClient } from "../supabase/functions/_shared/whatsapp.ts";
import { handleRequest, type WebhookDeps } from "../supabase/functions/_shared/webhook.ts";

export const ADMIN = "2348011111111";
export const STRANGER = "2348099999999";
export const APP_SECRET = "test-secret";

export function defaultSettings(over: Partial<Settings> = {}): Settings {
  return {
    target: 150000,
    distribution_date: "2026-12-20",
    daily_amount: 500,
    weekly_amount: 3500,
    monthly_amount: 15000,
    admin_phone: ADMIN,
    admin_last_inbound_at: null,
    customers_enabled: false,
    ...over,
  };
}

interface LogRow extends LogEntry {
  message_id: string;
  phone: string;
  reversed: boolean;
}

export class MemoryRepo implements Repo {
  settings: Settings;
  customers: Customer[] = [];
  payments: Payment[] = [];
  pending = new Map<string, Pending>();
  log: LogRow[] = [];
  usage = new Map<string, { admin: number; customer: number }>();
  failNextApply = false;
  private seq = 1;

  constructor(settings: Partial<Settings> = {}) {
    this.settings = defaultSettings(settings);
  }

  // ── test seeding ──
  seedCustomer(c: Partial<Customer> & { name: string }): Customer {
    const row: Customer = {
      id: this.seq++,
      phone: "2348012345678",
      plan: "weekly",
      start_date: "2026-10-01",
      active: true,
      ...c,
    };
    this.customers.push(row);
    return row;
  }
  seedPayment(customer_id: number, amount: number, paid_at: string): Payment {
    const row: Payment = { id: this.seq++, customer_id, amount, source: "admin", reverses_payment_id: null, paid_at };
    this.payments.push(row);
    return row;
  }

  // ── Repo ──
  getSettings() {
    return Promise.resolve({ ...this.settings });
  }
  touchAdminInbound(at: string) {
    this.settings.admin_last_inbound_at = at;
    return Promise.resolve();
  }
  claimMessage(messageId: string, phone: string) {
    if (this.log.some((l) => l.message_id === messageId)) return Promise.resolve(false);
    this.log.push({ id: this.seq++, message_id: messageId, phone, action: null as unknown as string, payload: null, reversed: false, created_at: new Date().toISOString() });
    return Promise.resolve(true);
  }
  getPending(phone: string) {
    return Promise.resolve(this.pending.get(phone) ?? null);
  }
  setPending(p: Pending) {
    this.pending.set(p.phone, structuredClone(p));
    return Promise.resolve();
  }
  clearPending(phone: string) {
    this.pending.delete(phone);
    return Promise.resolve();
  }
  listCustomers(opts: { includeInactive?: boolean } = {}) {
    return Promise.resolve(
      this.customers
        .filter((c) => opts.includeInactive || c.active)
        .map((c) => ({ ...c }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
  listPayments(f: PaymentFilter = {}) {
    return Promise.resolve(
      this.payments
        .filter((p) => f.customerId === undefined || p.customer_id === f.customerId)
        .filter((p) => !f.from || Date.parse(p.paid_at) >= Date.parse(f.from))
        .filter((p) => !f.to || Date.parse(p.paid_at) < Date.parse(f.to))
        .sort((a, b) => Date.parse(a.paid_at) - Date.parse(b.paid_at) || a.id - b.id)
        .map((p) => ({ ...p })),
    );
  }
  lastUndoable() {
    const row = [...this.log].reverse().find((l) => l.action && l.action !== "undo" && !l.reversed);
    return Promise.resolve(row ? { id: row.id, action: row.action, payload: structuredClone(row.payload), created_at: row.created_at } : null);
  }

  applyAction(args: Parameters<Repo["applyAction"]>[0]): Promise<Record<string, number>> {
    // Transaction: snapshot, run, roll back on any error.
    const snapshot = structuredClone({ c: this.customers, p: this.payments, l: this.log, seq: this.seq });
    try {
      if (this.failNextApply) {
        this.failNextApply = false;
        throw new Error("simulated database failure");
      }
      const result: Record<string, number> = {};
      for (const op of args.ops) this.runOp(op, result);
      const row = this.log.find((l) => l.message_id === args.messageId);
      if (!row) throw new Error("bot_log row missing");
      row.action = args.action;
      row.payload = { ...structuredClone(args.payload), ...result };
      this.pending.delete(args.phone);
      return Promise.resolve(result);
    } catch (e) {
      this.customers = snapshot.c;
      this.payments = snapshot.p;
      this.log = snapshot.l;
      this.seq = snapshot.seq;
      return Promise.reject(e);
    }
  }

  private runOp(op: Op, result: Record<string, number>) {
    switch (op.op) {
      case "insert_customer": {
        this.assertUniqueName(op.name, -1);
        const c: Customer = { id: this.seq++, name: op.name, phone: op.phone, plan: op.plan, start_date: op.start_date, active: true };
        this.customers.push(c);
        result.customer_id = c.id;
        return;
      }
      case "update_customer": {
        const c = this.customers.find((x) => x.id === op.id);
        if (!c) throw new Error("customer not found");
        const next = { ...c, ...op.set };
        if (next.active) this.assertUniqueName(next.name, c.id);
        Object.assign(c, op.set);
        return;
      }
      case "insert_payment": {
        const source = op.source ?? "admin";
        const ok = (op.amount > 0 && source !== "undo" && !op.reverses_payment_id) ||
          (op.amount < 0 && source === "undo" && !!op.reverses_payment_id);
        if (!ok) throw new Error("payments_amount_sign violated");
        if (op.reverses_payment_id && this.payments.some((p) => p.reverses_payment_id === op.reverses_payment_id)) {
          throw new Error("duplicate reversal");
        }
        const p: Payment = {
          id: this.seq++,
          customer_id: op.customer_id,
          amount: op.amount,
          source,
          reverses_payment_id: op.reverses_payment_id ?? null,
          paid_at: op.paid_at,
        };
        this.payments.push(p);
        result.payment_id = p.id;
        return;
      }
      case "mark_reversed": {
        const row = this.log.find((l) => l.id === op.log_id && l.action && !l.reversed);
        if (!row) throw new Error("already undone");
        row.reversed = true;
        return;
      }
    }
  }

  private assertUniqueName(name: string, selfId: number) {
    if (this.customers.some((c) => c.active && c.id !== selfId && c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error("duplicate active name");
    }
  }

  reserveReply(month: string, cap: number, audience: "admin" | "customer") {
    const u = this.usage.get(month) ?? { admin: 0, customer: 0 };
    this.usage.set(month, u);
    if (u.admin + u.customer >= cap) return Promise.resolve(null);
    u[audience]++;
    return Promise.resolve(u.admin + u.customer);
  }
  getUsage(month: string) {
    const u = this.usage.get(month);
    return Promise.resolve(u ? u.admin + u.customer : 0);
  }

  total(customerId: number): number {
    return this.payments.filter((p) => p.customer_id === customerId).reduce((s, p) => s + p.amount, 0);
  }
}

export class FakeWhatsApp implements WhatsAppClient {
  sent: { to: string; body?: string; filename?: string; content?: string; caption?: string }[] = [];
  sendText(to: string, body: string) {
    this.sent.push({ to, body });
    return Promise.resolve();
  }
  sendDocument(to: string, filename: string, content: string, caption: string) {
    this.sent.push({ to, filename, content, caption });
    return Promise.resolve();
  }
  get last() {
    return this.sent.at(-1);
  }
}

/** A tiny "phone" that sends signed webhook messages as the admin (or anyone). */
export class Harness {
  repo: MemoryRepo;
  wa = new FakeWhatsApp();
  clock: Date;
  private n = 0;

  constructor(opts: { now?: string; settings?: Partial<Settings> } = {}) {
    this.repo = new MemoryRepo(opts.settings);
    this.clock = new Date(opts.now ?? "2026-10-28T09:00:00Z");
  }

  get deps(): WebhookDeps {
    return {
      repo: this.repo,
      wa: this.wa,
      now: () => this.clock,
      verifyToken: "verify-me",
      appSecret: APP_SECRET,
      adminPhone: ADMIN,
    };
  }

  /** Sends a message and returns the bot's reply text (or undefined if none was sent). */
  async say(text: string, opts: { from?: string; id?: string } = {}): Promise<string | undefined> {
    const before = this.wa.sent.length;
    const res = await handleRequest(await signedRequest(messagePayload(opts.from ?? ADMIN, text, opts.id ?? `wamid.${++this.n}`)), this.deps);
    if (res.status !== 200) throw new Error(`webhook returned ${res.status}`);
    const out = this.wa.sent.slice(before);
    if (out.length > 1) throw new Error(`expected at most one reply, got ${out.length}`);
    return out[0]?.body ?? out[0]?.caption;
  }

  advance(ms: number) {
    this.clock = new Date(this.clock.getTime() + ms);
  }
}

export function messagePayload(from: string, text: string, id: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          messages: [{ from, id, timestamp: "0", type: "text", text: { body: text } }],
        },
      }],
    }],
  };
}

export async function sign(body: string, secret = APP_SECRET): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signedRequest(payload: unknown, secret = APP_SECRET): Promise<Request> {
  const body = JSON.stringify(payload);
  return new Request("https://example.test/whatsapp-webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": await sign(body, secret) },
    body,
  });
}
