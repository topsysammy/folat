import { createClient } from "@supabase/supabase-js";
import type { Customer, IsoDate, Payment, Plan, Settings } from "@shared/types.ts";

export const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const PAGE = 1000; // Supabase returns at most 1000 rows per request

export type Method = "cash" | "transfer" | "pos" | "other";
export const METHODS: { value: Method; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "transfer", label: "Transfer" },
  { value: "pos", label: "POS" },
  { value: "other", label: "Other" },
];

export interface AppSettings extends Settings {
  current_season_id: number;
}

export interface Season {
  id: number;
  name: string;
  started_on: IsoDate;
  distribution_date: IsoDate;
  closed_at: string | null;
}

export interface Distribution {
  id: number;
  customer_id: number;
  amount_saved: number;
  items: string | null;
  collected_at: string;
}

export interface Data {
  settings: AppSettings;
  seasons: Season[]; // newest first
  customers: Customer[]; // active and removed
  payments: Payment[]; // this season's rows, undo rows included, oldest first
  distributions: Distribution[]; // this season
}

const PAYMENT_COLUMNS = "id, customer_id, amount, source, reverses_payment_id, paid_at, method, note";

export async function loadData(): Promise<Data> {
  const settings = await db.from("settings").select("*").eq("id", 1).single();
  if (settings.error) throw settings.error;
  const season = settings.data.current_season_id as number;
  const [seasons, customers, payments, distributions] = await Promise.all([
    db.from("seasons").select("id, name, started_on, distribution_date, closed_at").order("id", { ascending: false }),
    db.from("customers").select("id, name, phone, plan, start_date, active").order("name"),
    seasonPayments(season),
    seasonDistributions(season),
  ]);
  if (seasons.error) throw seasons.error;
  if (customers.error) throw customers.error;
  return {
    settings: settings.data as AppSettings,
    seasons: seasons.data as Season[],
    customers: customers.data as Customer[],
    payments,
    distributions,
  };
}

export async function seasonPayments(seasonId: number): Promise<Payment[]> {
  const out: Payment[] = [];
  for (let from = 0;; from += PAGE) {
    const { data, error } = await db
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .eq("status", "confirmed")
      .eq("season_id", seasonId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as Payment[]));
    if (data.length < PAGE) return out;
  }
}

export async function seasonDistributions(seasonId: number): Promise<Distribution[]> {
  const { data, error } = await db
    .from("distributions")
    .select("id, customer_id, amount_saved, items, collected_at")
    .eq("season_id", seasonId)
    .order("collected_at");
  if (error) throw error;
  return data as Distribution[];
}

export async function addCustomer(c: { name: string; phone: string; plan: Plan; start_date: IsoDate }): Promise<number> {
  const { data, error } = await db.from("customers").insert(c).select("id").single();
  if (error) throw friendly(error);
  return data.id;
}

export async function updateCustomer(
  id: number,
  set: Partial<Pick<Customer, "name" | "phone" | "plan" | "active">>,
): Promise<void> {
  const { error } = await db.from("customers").update(set).eq("id", id);
  if (error) throw friendly(error);
}

export async function addPayment(p: {
  customerId: number;
  amount: number;
  paidAt: string;
  method: Method;
  note: string;
}): Promise<number> {
  const { data, error } = await db
    .from("payments")
    .insert({
      customer_id: p.customerId,
      amount: p.amount,
      paid_at: p.paidAt,
      method: p.method,
      note: p.note.trim() || null,
      source: "admin",
    })
    .select("id")
    .single();
  if (error) throw friendly(error);
  return data.id;
}

export async function undoPayment(paymentId: number): Promise<void> {
  const { error } = await db.rpc("undo_payment", { p_payment_id: paymentId });
  if (error) throw friendly(error);
}

export type EditableSettings = Pick<
  Settings,
  "target" | "distribution_date" | "daily_amount" | "weekly_amount" | "monthly_amount"
>;

export async function saveSettings(set: EditableSettings): Promise<void> {
  const { error } = await db.from("settings").update(set).eq("id", 1);
  if (error) throw friendly(error);
}

export async function markCollected(d: {
  seasonId: number;
  customerId: number;
  amountSaved: number;
  items: string;
}): Promise<void> {
  const { error } = await db.from("distributions").insert({
    season_id: d.seasonId,
    customer_id: d.customerId,
    amount_saved: d.amountSaved,
    items: d.items.trim() || null,
  });
  if (error) throw friendly(error);
}

export async function untickCollected(distributionId: number): Promise<void> {
  const { error } = await db.from("distributions").delete().eq("id", distributionId);
  if (error) throw friendly(error);
}

export async function startNewSeason(s: {
  name: string;
  startedOn: IsoDate;
  distributionDate: IsoDate;
  keepCustomers: boolean;
}): Promise<void> {
  const { error } = await db.rpc("start_new_season", {
    p_name: s.name,
    p_started_on: s.startedOn,
    p_distribution_date: s.distributionDate,
    p_keep_customers: s.keepCustomers,
  });
  if (error) throw friendly(error);
}

function friendly(error: { code?: string; message: string }): Error {
  if (error.code === "23505" && error.message.includes("customers_active_name_uniq")) {
    return new Error("There's already a customer with that name. Add a surname or initial to tell them apart.");
  }
  if (error.code === "23505" && error.message.includes("reverses_payment_id")) {
    return new Error("That payment was already undone.");
  }
  if (error.code === "23505" && error.message.includes("distributions_season_id_customer_id")) {
    return new Error("This customer is already marked as collected.");
  }
  return new Error(`Couldn't save: ${error.message}`);
}
