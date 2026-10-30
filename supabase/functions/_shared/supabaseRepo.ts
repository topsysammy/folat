import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import type { PaymentFilter, Repo } from "./repo.ts";
import type { Customer, LogEntry, Payment, Pending, Settings } from "./types.ts";

const PAGE = 1000; // Supabase returns at most 1000 rows per request

export class SupabaseRepo implements Repo {
  private db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  }

  async getSettings(): Promise<Settings> {
    const { data, error } = await this.db.from("settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return data as Settings;
  }

  async touchAdminInbound(at: string): Promise<void> {
    const { error } = await this.db.from("settings").update({ admin_last_inbound_at: at }).eq("id", 1);
    if (error) throw error;
  }

  async claimMessage(messageId: string, phone: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("bot_log")
      .upsert({ message_id: messageId, phone }, { onConflict: "message_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    return (data ?? []).length === 1;
  }

  async getPending(phone: string): Promise<Pending | null> {
    const { data, error } = await this.db.from("bot_pending").select("*").eq("phone", phone).maybeSingle();
    if (error) throw error;
    return data as Pending | null;
  }

  async setPending(pending: Pending): Promise<void> {
    const { error } = await this.db.from("bot_pending").upsert(pending, { onConflict: "phone" });
    if (error) throw error;
  }

  async clearPending(phone: string): Promise<void> {
    const { error } = await this.db.from("bot_pending").delete().eq("phone", phone);
    if (error) throw error;
  }

  async listCustomers(opts: { includeInactive?: boolean } = {}): Promise<Customer[]> {
    let q = this.db.from("customers").select("id, name, phone, plan, start_date, active");
    if (!opts.includeInactive) q = q.eq("active", true);
    const { data, error } = await q.order("name");
    if (error) throw error;
    return data as Customer[];
  }

  async listPayments(filter: PaymentFilter = {}): Promise<Payment[]> {
    const rows: Payment[] = [];
    for (let offset = 0;; offset += PAGE) {
      let q = this.db
        .from("payments")
        .select("id, customer_id, amount, source, reverses_payment_id, paid_at")
        .eq("status", "confirmed");
      if (filter.customerId !== undefined) q = q.eq("customer_id", filter.customerId);
      if (filter.from) q = q.gte("paid_at", filter.from);
      if (filter.to) q = q.lt("paid_at", filter.to);
      const { data, error } = await q.order("paid_at").order("id").range(offset, offset + PAGE - 1);
      if (error) throw error;
      rows.push(...(data as Payment[]));
      if (data.length < PAGE) return rows;
    }
  }

  async lastUndoable(): Promise<LogEntry | null> {
    const { data, error } = await this.db
      .from("bot_log")
      .select("id, action, payload, created_at")
      .not("action", "is", null)
      .neq("action", "undo")
      .eq("reversed", false)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as LogEntry | null;
  }

  async applyAction(args: Parameters<Repo["applyAction"]>[0]): Promise<Record<string, number>> {
    const { data, error } = await this.db.rpc("apply_action", {
      p_message_id: args.messageId,
      p_phone: args.phone,
      p_action: args.action,
      p_payload: args.payload,
      p_ops: args.ops,
    });
    if (error) throw error;
    return data as Record<string, number>;
  }

  async reserveReply(month: string, cap: number, audience: "admin" | "customer"): Promise<number | null> {
    const { data, error } = await this.db.rpc("reserve_reply", { p_month: month, p_cap: cap, p_audience: audience });
    if (error) throw error;
    return data as number | null;
  }

  async getUsage(month: string): Promise<number> {
    const { data, error } = await this.db
      .from("usage")
      .select("admin_replies, customer_replies")
      .eq("month", month)
      .maybeSingle();
    if (error) throw error;
    return data ? data.admin_replies + data.customer_replies : 0;
  }
}
