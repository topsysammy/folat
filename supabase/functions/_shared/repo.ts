// Storage interface. SupabaseRepo (supabaseRepo.ts) is the real one;
// tests use an in-memory implementation of the same contract.
import type { Customer, LogEntry, Op, Payment, Pending, Settings } from "./types.ts";

export interface PaymentFilter {
  customerId?: number;
  from?: string; // UTC timestamp, inclusive
  to?: string; // UTC timestamp, exclusive
}

export interface Repo {
  getSettings(): Promise<Settings>;
  touchAdminInbound(at: string): Promise<void>;

  /** Records a WhatsApp message ID. false = already seen (duplicate delivery). */
  claimMessage(messageId: string, phone: string): Promise<boolean>;

  getPending(phone: string): Promise<Pending | null>;
  setPending(pending: Pending): Promise<void>;
  clearPending(phone: string): Promise<void>;

  /** Active customers (or all, for reports/export), sorted by name. */
  listCustomers(opts?: { includeInactive?: boolean }): Promise<Customer[]>;
  /** Confirmed payments (including undo rows), oldest first. */
  listPayments(filter?: PaymentFilter): Promise<Payment[]>;

  /** Most recent saved action that can still be undone. */
  lastUndoable(): Promise<LogEntry | null>;

  /**
   * Applies ops + stamps bot_log(messageId) + clears pending, all-or-nothing.
   * Returns new ids, e.g. { customer_id } or { payment_id }.
   */
  applyAction(args: {
    messageId: string;
    phone: string;
    action: string;
    // deno-lint-ignore no-explicit-any
    payload: Record<string, any>;
    ops: Op[];
  }): Promise<Record<string, number>>;

  /** Atomically counts one reply. Returns new monthly total, or null if the cap is reached. */
  reserveReply(month: string, cap: number, audience: "admin" | "customer"): Promise<number | null>;
  /** Replies used this month (admin + customer). */
  getUsage(month: string): Promise<number>;
}
