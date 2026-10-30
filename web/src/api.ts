import { createClient } from "@supabase/supabase-js";
import type { Customer, IsoDate, Payment, Plan, Settings } from "@shared/types.ts";

export const db = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

const PAGE = 1000; // Supabase returns at most 1000 rows per request

export interface Data {
  settings: Settings;
  customers: Customer[]; // active and removed
  payments: Payment[]; // every row, undo rows included, oldest first
}

export async function loadData(): Promise<Data> {
  const [settings, customers, payments] = await Promise.all([
    db.from("settings").select("*").eq("id", 1).single(),
    db.from("customers").select("id, name, phone, plan, start_date, active").order("name"),
    allPayments(),
  ]);
  if (settings.error) throw settings.error;
  if (customers.error) throw customers.error;
  return { settings: settings.data as Settings, customers: customers.data as Customer[], payments };
}

async function allPayments(): Promise<Payment[]> {
  const out: Payment[] = [];
  for (let from = 0;; from += PAGE) {
    const { data, error } = await db
      .from("payments")
      .select("id, customer_id, amount, source, reverses_payment_id, paid_at")
      .eq("status", "confirmed")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as Payment[]));
    if (data.length < PAGE) return out;
  }
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

export async function addPayment(customerId: number, amount: number, paidAt: string): Promise<number> {
  const { data, error } = await db
    .from("payments")
    .insert({ customer_id: customerId, amount, paid_at: paidAt, source: "admin" })
    .select("id")
    .single();
  if (error) throw friendly(error);
  return data.id;
}

export async function undoPayment(paymentId: number): Promise<void> {
  const { error } = await db.rpc("undo_payment", { p_payment_id: paymentId });
  if (error) throw friendly(error);
}

function friendly(error: { code?: string; message: string }): Error {
  if (error.code === "23505" && error.message.includes("customers_active_name_uniq")) {
    return new Error("There's already a customer with that name. Add a surname or initial to tell them apart.");
  }
  if (error.code === "23505" && error.message.includes("reverses_payment_id")) {
    return new Error("That payment was already undone.");
  }
  return new Error(`Couldn't save: ${error.message}`);
}
