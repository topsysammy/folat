export type Plan = "daily" | "weekly" | "monthly";
export const PLANS: Plan[] = ["daily", "weekly", "monthly"];

/** ISO calendar date in Lagos time, e.g. "2026-10-28". */
export type IsoDate = string;

export interface Settings {
  target: number;
  distribution_date: IsoDate;
  daily_amount: number;
  weekly_amount: number;
  monthly_amount: number;
  admin_phone: string;
  admin_last_inbound_at: string | null;
  customers_enabled: boolean;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  plan: Plan;
  start_date: IsoDate;
  active: boolean;
}

export interface Payment {
  id: number;
  customer_id: number;
  amount: number;
  source: string;
  reverses_payment_id: number | null;
  paid_at: string; // ISO timestamp (UTC)
  method?: string | null; // web app: cash / transfer / pos / other
  note?: string | null;
}

export interface Pending {
  phone: string;
  action: "confirm" | "choose";
  // deno-lint-ignore no-explicit-any
  payload: any;
  expires_at: string;
}

export interface LogEntry {
  id: number;
  action: string;
  // deno-lint-ignore no-explicit-any
  payload: any;
  created_at: string;
}

/** One data change inside an atomic apply_action call. */
export type Op =
  | { op: "insert_customer"; name: string; phone: string; plan: Plan; start_date: IsoDate }
  | { op: "update_customer"; id: number; set: Partial<Pick<Customer, "name" | "phone" | "plan" | "active">> }
  | {
    op: "insert_payment";
    customer_id: number;
    amount: number;
    paid_at: string;
    source?: string;
    note?: string;
    reverses_payment_id?: number;
  }
  | { op: "mark_reversed"; log_id: number };

/** What a confirmed action saves. Stored in bot_pending, then bot_log. */
export interface ActionPlan {
  action: string;
  // deno-lint-ignore no-explicit-any
  payload: Record<string, any>;
  ops: Op[];
}

/** The single outgoing message for one incoming message. */
export type Reply =
  | { text: string }
  | { document: { filename: string; content: string }; caption: string };
